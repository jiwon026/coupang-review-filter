import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { privacyUrl } from '../shared/site.js'
import { request, GET_CONSENT_TIMEOUT_MS, SET_CONSENT_TIMEOUT_MS } from '../shared/request.js'
import { renderPanel, renderConsent } from './view.js'

const LOG_PREFIX = '[체험단 필터]'
const TRIGGERS = ['banner', 'toolbar']
const DECIDED = ['granted', 'denied']
const ONBOARDING_PATH = 'src/onboarding/index.html'

// 요약은 root, 동의 구역은 consentRoot 에 따로 그린다. 요약이 갱신돼도 동의 구역은 지워지지 않는다.
const root = document.getElementById('root')
const consentRoot = document.getElementById('consent')
let activeTabId = null

let consent = { status: 'undecided', saving: false, saveFailed: false }

async function currentTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id ?? null
}

async function load() {
  activeTabId = await currentTabId()
  if (activeTabId === null) {
    renderPanel(root, null)
    return
  }
  chrome.runtime.sendMessage({ type: MESSAGES.GET_SUMMARY, tabId: activeTabId }, (response) => {
    renderPanel(root, response?.summary ?? null)
  })
}

function drawConsent() {
  renderConsent(consentRoot, {
    status: consent.status,
    privacyUrl: privacyUrl(),
    saveFailed: consent.saveFailed,
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

async function changeConsent(status) {
  if (consent.saving) return
  consent = { ...consent, saving: true }

  let response = null
  try {
    response = await request(
      { type: MESSAGES.SET_CONSENT, status, source: 'panel' },
      { timeoutMs: SET_CONSENT_TIMEOUT_MS },
    )
  } catch (error) {
    console.warn(`${LOG_PREFIX} 동의를 저장하지 못했습니다:`, error?.message)
  }

  const saved = !response?.error && DECIDED.includes(response?.consent?.status)
  consent = saved
    ? { status: response.consent.status, saving: false, saveFailed: false }
    : { ...consent, saving: false, saveFailed: true }
  drawConsent()
}

// 응답이 없어도 구역은 그려야 한다. 읽지 못하면 아직 고르지 않은 것으로 본다.
async function loadConsent() {
  let status = 'undecided'
  try {
    const response = await request({ type: MESSAGES.GET_CONSENT }, { timeoutMs: GET_CONSENT_TIMEOUT_MS })
    if (DECIDED.includes(response?.consent?.status)) status = response.consent.status
  } catch (error) {
    console.warn(`${LOG_PREFIX} 동의 상태를 읽지 못했습니다:`, error?.message)
  }
  consent = { ...consent, status }
  drawConsent()
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
async function trackPanelOpened() {
  const trigger = await panelTrigger()
  try {
    const pending = chrome.runtime.sendMessage({
      type: MESSAGES.TRACK,
      eventType: EVENTS.PANEL_OPENED,
      properties: { trigger },
    })
    if (pending && typeof pending.catch === 'function') {
      pending.catch((error) => console.warn(`${LOG_PREFIX} 패널 열림을 기록하지 못했습니다:`, error?.message))
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} 패널 열림을 기록하지 못했습니다:`, error?.message)
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== MESSAGES.SUMMARY_UPDATED) return false
  if (sender.tab?.id !== activeTabId) return false
  renderPanel(root, message.summary)
  return false
})

chrome.tabs.onActivated.addListener(() => {
  load()
})

trackPanelOpened()

load()
loadConsent()
