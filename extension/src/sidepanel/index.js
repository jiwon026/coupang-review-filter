import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { privacyUrl } from '../shared/site.js'
import { ONBOARDING_PATH } from '../shared/pages.js'
import { CONSENT, DECIDED_STATUSES, consentStatusFrom, deviceIdFrom } from '../shared/consent-status.js'
import { request, GET_CONSENT_TIMEOUT_MS, SET_CONSENT_TIMEOUT_MS } from '../shared/request.js'
import { UNKNOWN_SHOP_ID, safeShopId } from '../shared/shops.js'
import { renderPanel, renderConsent } from './view.js'

const LOG_PREFIX = '[체험단 필터]'
const TRIGGERS = ['banner', 'toolbar']

// 요약은 root, 동의 구역은 consentRoot 에 따로 그린다. 요약이 갱신돼도 동의 구역은 지워지지 않는다.
const root = document.getElementById('root')
const consentRoot = document.getElementById('consent')
let activeTabId = null
// 지금 그린 요약에 적힌 쇼핑몰. 패널이 보내는 이벤트의 site 로 쓴다. 요약이 없으면 unknown 이다.
let shopId = UNKNOWN_SHOP_ID

// revision 은 더 새로운 정보(저장 성공, 다른 곳의 변경 알림, 다시 읽은 상태)가 도착할 때마다 올린다.
// 응답을 기다리던 쪽은 그 사이에 revision 이 바뀌었으면 자기 응답을 버린다.
// deviceId 는 삭제 요청에 쓰도록 화면에만 보여 주는 익명 기기 번호다. 백그라운드는 한 번이라도 동의한 경우에만 알려 준다.
// 이 값은 어떤 메시지에도 다시 싣지 않는다.
let consent = { status: CONSENT.UNDECIDED, deviceId: null, saving: false, saveFailed: false, revision: 0 }

async function currentTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id ?? null
}

// 요약을 그리고 그 쇼핑몰을 기억한다. 요약은 저장소를 거쳐 온 값이라 목록에 있는 쇼핑몰만 받아들인다.
function showSummary(summary) {
  shopId = safeShopId(summary?.site)
  renderPanel(root, summary)
}

// 요약 응답을 받았거나 받지 못한 것으로 정리된 뒤에 끝난다. 읽기 시간 제한 안에 응답이 없으면 요약 없이 그리고
// 늦게 온 응답은 도착했을 때 그린다.
async function load() {
  activeTabId = await currentTabId()
  if (activeTabId === null) {
    showSummary(null)
    return
  }
  const show = (response) => showSummary(response?.summary ?? null)
  try {
    show(
      await request(
        { type: MESSAGES.GET_SUMMARY, tabId: activeTabId },
        { timeoutMs: GET_CONSENT_TIMEOUT_MS, onLate: show },
      ),
    )
  } catch (error) {
    console.warn(`${LOG_PREFIX} 요약을 읽지 못했습니다:`, error?.message)
    showSummary(null)
  }
}

function drawConsent() {
  renderConsent(consentRoot, {
    status: consent.status,
    deviceId: consent.deviceId,
    privacyUrl: privacyUrl(),
    saveFailed: consent.saveFailed,
    saving: consent.saving,
    onChange: changeConsent,
    onLearnMore: openOnboarding,
  })
}

function openOnboarding() {
  try {
    const pending = chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_PATH) })
    if (pending && typeof pending.catch === 'function') {
      pending.catch((error) => console.warn(`${LOG_PREFIX} 온보딩 페이지를 열지 못했습니다:`, error?.message))
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} 온보딩 페이지를 열지 못했습니다:`, error?.message)
  }
}

// 새 정보로 동의 화면을 다시 그린다. 요약(root)은 건드리지 않는다.
// payload 는 응답이나 알림의 consent 다. 상태와 같은 출처의 기기 번호를 함께 받아들인다.
function adoptConsent(status, payload, { keepError = false } = {}) {
  consent = {
    ...consent,
    status,
    deviceId: deviceIdFrom(payload),
    saveFailed: keepError ? consent.saveFailed : false,
    revision: consent.revision + 1,
  }
  drawConsent()
}

async function changeConsent(status) {
  if (consent.saving) return
  consent = { ...consent, saving: true }
  drawConsent()

  let response = null
  try {
    response = await request(
      { type: MESSAGES.SET_CONSENT, status, source: 'panel' },
      { timeoutMs: SET_CONSENT_TIMEOUT_MS },
    )
  } catch (error) {
    console.warn(`${LOG_PREFIX} 동의를 저장하지 못했습니다:`, error?.message)
  }

  const saved = !response?.error && DECIDED_STATUSES.includes(response?.consent?.status)
  if (saved) {
    consent = { ...consent, saving: false }
    adoptConsent(response.consent.status, response.consent)
    return
  }

  consent = { ...consent, saving: false, saveFailed: true }
  drawConsent()
  // 시간이 지나 실패로 다뤘어도 저장은 됐을 수 있다. 실제 상태를 다시 읽고, 요청한 상태와 같으면 오류 문구를 지운다.
  refreshConsent({ requested: status })
}

// 초기 읽기. 응답이 없어도 구역은 그려야 하므로 먼저 undecided 로 그린다.
// 늦게 도착한 응답은 그 사이에 더 새로운 정보가 없었을 때만 반영한다.
async function loadConsent() {
  const startedAt = consent.revision
  const adoptLate = (response) => {
    const status = consentStatusFrom(response)
    if (status !== null && consent.revision === startedAt) adoptConsent(status, response.consent)
  }

  let status = CONSENT.UNDECIDED
  let deviceId = null
  try {
    const response = await request(
      { type: MESSAGES.GET_CONSENT },
      { timeoutMs: GET_CONSENT_TIMEOUT_MS, onLate: adoptLate },
    )
    const read = consentStatusFrom(response)
    if (read !== null) {
      status = read
      deviceId = deviceIdFrom(response.consent)
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} 동의 상태를 읽지 못했습니다:`, error?.message)
  }
  // 읽는 동안 더 새로운 정보가 왔다면 그 상태가 이긴다. 다시 그리기만 한다.
  if (consent.revision === startedAt) consent = { ...consent, status, deviceId }
  drawConsent()
}

// 다시 보일 때와 저장 실패 뒤에 실제 상태를 다시 읽는다. 읽지 못하면 화면을 그대로 둔다.
// requested 는 저장에 실패한 요청의 상태다. 다시 읽은 상태가 이와 다를 때만 오류 문구를 남긴다.
async function refreshConsent({ requested = null } = {}) {
  const startedAt = consent.revision
  try {
    const response = await request({ type: MESSAGES.GET_CONSENT }, { timeoutMs: GET_CONSENT_TIMEOUT_MS })
    const status = consentStatusFrom(response)
    if (status !== null && consent.revision === startedAt) {
      adoptConsent(status, response.consent, { keepError: requested !== null && status !== requested })
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} 동의 상태를 다시 읽지 못했습니다:`, error?.message)
  }
}

// 배너의 자세히 보기로 열렸는지 툴바로 열렸는지 백그라운드에 묻는다. 묻지 못하면 unknown 이다.
// windows API 는 tabs 권한 없이 창 id 를 준다.
async function panelTrigger() {
  try {
    const currentWindow = await chrome.windows.getCurrent()
    const response = await request({ type: MESSAGES.CONSUME_PANEL_TRIGGER, windowId: currentWindow.id })
    return TRIGGERS.includes(response?.trigger) ? response.trigger : 'unknown'
  } catch (error) {
    console.warn(`${LOG_PREFIX} 패널을 연 경로를 알지 못했습니다:`, error?.message ?? error)
    return 'unknown'
  }
}

// 패널은 배너 렌더 시각을 모르므로 seconds_since_render 는 싣지 않는다.
// site 는 지금 탭의 요약에서 오므로 첫 요약 읽기(summaryLoaded)가 끝난 뒤에 보낸다. 읽지 못했어도 unknown 으로 보낸다.
// 여는 경로는 기다리지 않고 바로 묻는다.
async function trackPanelOpened(summaryLoaded) {
  const [trigger] = await Promise.all([
    panelTrigger(),
    summaryLoaded.catch((error) => console.warn(`${LOG_PREFIX} 요약을 읽지 못했습니다:`, error?.message)),
  ])
  try {
    const pending = chrome.runtime.sendMessage({
      type: MESSAGES.TRACK,
      eventType: EVENTS.PANEL_OPENED,
      properties: { trigger, site: shopId },
    })
    if (pending && typeof pending.catch === 'function') {
      pending.catch((error) => console.warn(`${LOG_PREFIX} 패널 열림을 기록하지 못했습니다:`, error?.message))
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} 패널 열림을 기록하지 못했습니다:`, error?.message)
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  // 백그라운드가 보낸 동의 변경 알림. 탭에서 온 메시지는 받지 않는다.
  if (message?.type === MESSAGES.CONSENT_CHANGED) {
    const status = message.consent?.status
    if (!sender?.tab && DECIDED_STATUSES.includes(status)) adoptConsent(status, message.consent)
    return false
  }
  if (message?.type !== MESSAGES.SUMMARY_UPDATED) return false
  if (sender.tab?.id !== activeTabId) return false
  showSummary(message.summary)
  return false
})

chrome.tabs.onActivated.addListener(() => {
  load()
})

// 알림을 놓쳤을 수 있으니(워커 재시작 직후 등) 다시 보일 때 실제 상태를 읽는다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshConsent()
})

trackPanelOpened(load())
loadConsent()
