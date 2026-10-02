import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { debugLog } from '../shared/log.js'
import { track } from './analytics.js'
import { getDeviceId, getInstalledAt } from './identity.js'
import { CONSENT, getConsent, setConsent } from './consent.js'
import { saveSummary, loadSummary, removeSummary } from './summaries.js'
import { assignAll } from '../core/experiment.js'
import { configureUninstallUrl, handleInstalled } from './lifecycle.js'
import { markPanelTrigger, consumePanelTrigger } from './panel-trigger.js'

// chrome.storage.local 은 기본으로 콘텐츠 스크립트 문맥에도 열려 있다. 그러면 쿠팡 페이지 안의 코드가 동의 값을 직접 바꿀 수 있다.
// 확장 페이지와 워커에서만 읽고 쓰도록 닫는다. 실패해도 확장 동작은 막지 않는다.
try {
  chrome.storage.local
    .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
    .catch((error) => console.warn('[체험단 필터] 저장소 접근 수준을 낮추지 못했습니다:', error?.message))
} catch (error) {
  console.warn('[체험단 필터] 저장소 접근 수준을 낮추지 못했습니다:', error?.message)
}

chrome.tabs.onRemoved.addListener((tabId) => {
  removeSummary(tabId).catch((error) =>
    console.warn('[체험단 필터] 요약을 지우지 못했습니다:', error?.message),
  )
})

chrome.runtime.onInstalled.addListener((details) => {
  handleInstalled(details).catch((error) =>
    console.warn('[체험단 필터] 설치 처리에 실패했습니다:', error?.message),
  )
})

// 워커가 시작될 때마다 제거 주소를 다시 맞춘다. 설정은 확장 업데이트 때 보존되지 않을 수 있다.
configureUninstallUrl().catch((error) =>
  console.warn('[체험단 필터] 제거 주소를 설정하지 못했습니다:', error?.message),
)

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.warn('[체험단 필터] 패널 동작을 설정하지 못했습니다:', error?.message))

const CONSENT_SOURCES = ['onboarding', 'panel']

// 확장 페이지(온보딩, 사이드 패널)에서 온 메시지만 동의를 바꿀 수 있고 기기 번호를 받을 수 있다. 콘텐츠 스크립트의 sender.url 은 쿠팡 주소다.
function isFromExtensionPage(sender) {
  return typeof sender?.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''))
}

// 설치부터 동의 저장 시각(at)까지의 초. 설치 시각을 모르면 null 이다.
async function secondsSinceInstall(at) {
  try {
    const installedAt = await getInstalledAt()
    return installedAt == null ? null : Math.round((at - installedAt) / 1000)
  } catch {
    return null
  }
}

// 페이지(패널, 온보딩)에 돌려주는 동의 상태. 익명 기기 번호는 통계 삭제 요청에 쓰도록 화면에 보여 줄 값이다.
// 한 번이라도 동의한 적이 있을 때만 싣는다. 동의한 적이 없으면 보낸 통계가 없으므로 번호를 읽지도(없으면 새로 만들지도) 않는다.
// 번호를 읽지 못하면 null 로 둔다. 던지지 않는다.
// trusted 는 받는 쪽이 확장 페이지인지다. 저장소를 TRUSTED_CONTEXTS 로 닫아 세운 경계를 응답이 우회하지 않도록,
// 콘텐츠 스크립트(쿠팡 페이지 안에서 도는 코드) 같은 다른 발신자에게는 상태만 주고 번호는 주지 않는다.
async function consentForPage({ status, decidedAt, everGranted }, { trusted }) {
  let deviceId = null
  if (trusted === true && everGranted === true) {
    try {
      deviceId = await getDeviceId()
    } catch (error) {
      console.warn('[체험단 필터] 기기 번호를 읽지 못했습니다:', error?.message)
    }
  }
  return { status, decidedAt, deviceId }
}

// 열려 있는 패널과 온보딩 페이지가 바뀐 상태를 따라가게 알린다. 받는 쪽이 없으면 거절되므로 삼킨다.
// 알림 실패가 응답이나 후속 처리를 막으면 안 된다.
function announceConsent(consent) {
  try {
    const pending = chrome.runtime.sendMessage({ type: MESSAGES.CONSENT_CHANGED, consent })
    if (pending && typeof pending.catch === 'function') pending.catch(() => {})
  } catch {
    // 받는 쪽이 없거나 컨텍스트가 닫혔다. 정상적인 상황이다.
  }
}

// 처음 동의한 순간에 한 번 보낸다(명세 11.4). 이벤트 시각은 동의 저장 시각이다.
// 지금 시각으로 찍으면 동의 직후 온보딩 페이지가 보내는 Onboarding Viewed 보다 늦게 찍힐 수 있다.
async function trackInstalled(result, source) {
  await track(
    EVENTS.EXTENSION_INSTALLED,
    { consent_source: source, seconds_since_install: await secondsSinceInstall(result.decidedAt) },
    { time: result.decidedAt },
  )
}

// 동의 저장 뒤의 부수 작업. 실패해도 던지지 않는다. 응답 성패와 무관하게 실행돼야 하므로 응답 전에 시작한다.
// Extension Installed 를 먼저 시작하고 제거 주소 갱신을 기다리지 않는다. 둘 다 실패를 스스로 삼킨다.
function afterConsentChange(result, source) {
  const installed = result.firstGrant ? trackInstalled(result, source) : Promise.resolve()
  const uninstallUrl = configureUninstallUrl()
  return Promise.all([installed, uninstallUrl]).catch((error) =>
    console.warn('[체험단 필터] 동의 후속 처리에 실패했습니다:', error?.message),
  )
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGES.SUMMARY_UPDATED) {
    if (sender.tab?.id !== undefined) {
      saveSummary(sender.tab.id, message.summary).catch((error) =>
        console.warn('[체험단 필터] 요약을 저장하지 못했습니다:', error?.message),
      )
    }
    return false
  }

  if (message?.type === MESSAGES.GET_SUMMARY) {
    // 읽기 실패에서만 null 로 응답한다. then(...).catch(...) 로 이으면 sendResponse 가 던질 때 응답이 두 번 나간다.
    loadSummary(message.tabId)
      .then(
        (summary) => sendResponse({ summary }),
        (error) => {
          console.warn('[체험단 필터] 요약을 읽지 못했습니다:', error?.message)
          sendResponse({ summary: null })
        },
      )
      .catch((error) =>
        console.warn('[체험단 필터] 요약 응답을 보내지 못했습니다:', error?.message),
      )
    return true
  }

  if (message?.type === MESSAGES.OPEN_PANEL) {
    // sidePanel.open 은 사용자 제스처 안에서만 동작한다. 제스처를 잃지 않도록
    // await 없이 리스너 안에서 곧바로 호출한다.
    if (sender.tab?.windowId !== undefined) {
      const windowId = sender.tab.windowId
      chrome.sidePanel
        .open({ windowId })
        .catch((error) => console.warn('[체험단 필터] 패널을 열지 못했습니다:', error?.message))
      // 패널이 로드되며 물을 때 배너 경로로 열렸음을 알 수 있게 창별 표시를 남긴다. 열기 호출 뒤에 한다.
      markPanelTrigger(windowId).catch((error) =>
        console.warn('[체험단 필터] 패널 열기 경로를 기록하지 못했습니다:', error?.message),
      )
    }
    return false
  }

  if (message?.type === MESSAGES.CONSUME_PANEL_TRIGGER) {
    if (typeof message.windowId !== 'number') {
      sendResponse({ trigger: 'unknown' })
      return false
    }
    consumePanelTrigger(message.windowId)
      .then(
        (trigger) => sendResponse({ trigger }),
        (error) => {
          console.warn('[체험단 필터] 패널 열기 경로를 읽지 못했습니다:', error?.message)
          sendResponse({ trigger: 'unknown' })
        },
      )
      .catch((error) =>
        console.warn('[체험단 필터] 패널 열기 경로 응답을 보내지 못했습니다:', error?.message),
      )
    return true
  }

  if (message?.type === MESSAGES.TRACK) {
    // 이벤트 시각(options.time)은 넘기지 않는다. 페이지나 콘텐츠 스크립트가 시각을 지정할 수 없게 한다.
    track(message.eventType, message.properties)
    sendResponse({ ok: true })
    return false
  }

  if (message?.type === MESSAGES.GET_CONSENT) {
    const trusted = isFromExtensionPage(sender)
    getConsent()
      .then((consent) => consentForPage(consent, { trusted }))
      .then(
        (consent) => sendResponse({ consent }),
        (error) => {
          console.warn('[체험단 필터] 동의 상태를 읽지 못했습니다:', error?.message)
          // 읽기 실패는 아직 고르지 않음과 구분되도록 표지를 단다. 계약 모양(consent)은 그대로다.
          sendResponse({ consent: { status: CONSENT.UNDECIDED, decidedAt: null, deviceId: null }, error: 'failed' })
        },
      )
      .catch((error) =>
        console.warn('[체험단 필터] 동의 상태 응답을 보내지 못했습니다:', error?.message),
      )
    return true
  }

  if (message?.type === MESSAGES.SET_CONSENT) {
    const valid = message.status === CONSENT.GRANTED || message.status === CONSENT.DENIED
    if (!isFromExtensionPage(sender) || !valid) {
      sendResponse({ error: 'invalid' })
      return false
    }
    const source = CONSENT_SOURCES.includes(message.source) ? message.source : 'unknown'
    setConsent(message.status)
      .then(
        async (result) => {
          // 패널이나 온보딩 탭이 이미 닫혀 sendResponse 가 던져도 Extension Installed 와 제거 주소 갱신은 빠지면 안 된다.
          // 후속 처리를 먼저 시작하고 알림과 응답은 그 뒤에 보낸다. 응답 예외는 아래 catch 가 경고한다.
          const followUp = afterConsentChange(result, source)
          // 이 응답과 알림은 위에서 발신자를 확인한 확장 페이지로만 간다.
          const consent = await consentForPage(result, { trusted: true })
          announceConsent(consent)
          sendResponse({ consent })
          return followUp
        },
        (error) => {
          console.warn('[체험단 필터] 동의를 저장하지 못했습니다:', error?.message)
          sendResponse({ error: 'failed' })
        },
      )
      .catch((error) =>
        console.warn('[체험단 필터] 동의 응답을 보내지 못했습니다:', error?.message),
      )
    return true
  }

  if (message?.type === MESSAGES.GET_VARIANT) {
    getDeviceId()
      .then((deviceId) => sendResponse({ variants: assignAll(deviceId) }))
      .catch(() => sendResponse({ variants: null }))
    return true
  }

  return false
})

/* @__PURE__ */ debugLog('[체험단 필터] 백그라운드 준비됨')
