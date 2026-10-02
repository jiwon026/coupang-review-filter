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

// 확장 페이지(온보딩, 사이드 패널)에서 온 메시지만 동의를 바꿀 수 있다. 콘텐츠 스크립트의 sender.url 은 쿠팡 주소다.
function isFromExtensionPage(sender) {
  return typeof sender?.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''))
}

async function secondsSinceInstall() {
  try {
    const installedAt = await getInstalledAt()
    return installedAt == null ? null : Math.round((Date.now() - installedAt) / 1000)
  } catch {
    return null
  }
}

// 동의 저장 뒤의 부수 작업. 실패해도 던지지 않는다. 응답 성패와 무관하게 실행돼야 하므로 응답 전에 시작한다.
// 열려 있는 패널과 온보딩 페이지가 바뀐 상태를 따라가게 알린다. 받는 쪽이 없으면 거절되므로 삼킨다.
// 알림 실패가 응답이나 후속 처리를 막으면 안 된다.
function announceConsent(result) {
  try {
    const pending = chrome.runtime.sendMessage({
      type: MESSAGES.CONSENT_CHANGED,
      consent: { status: result.status, decidedAt: result.decidedAt },
    })
    if (pending && typeof pending.catch === 'function') pending.catch(() => {})
  } catch {
    // 받는 쪽이 없거나 컨텍스트가 닫혔다. 정상적인 상황이다.
  }
}

async function afterConsentChange(result, source) {
  try {
    await configureUninstallUrl()
    if (result.firstGrant) {
      await track(EVENTS.EXTENSION_INSTALLED, {
        consent_source: source,
        seconds_since_install: await secondsSinceInstall(),
      })
    }
  } catch (error) {
    console.warn('[체험단 필터] 동의 후속 처리에 실패했습니다:', error?.message)
  }
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
    track(message.eventType, message.properties)
    sendResponse({ ok: true })
    return false
  }

  if (message?.type === MESSAGES.GET_CONSENT) {
    getConsent()
      .then(
        (consent) => sendResponse({ consent }),
        (error) => {
          console.warn('[체험단 필터] 동의 상태를 읽지 못했습니다:', error?.message)
          // 읽기 실패는 아직 고르지 않음과 구분되도록 표지를 단다. 계약 모양(consent)은 그대로다.
          sendResponse({ consent: { status: CONSENT.UNDECIDED, decidedAt: null }, error: 'failed' })
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
        (result) => {
          // 패널이나 온보딩 탭이 이미 닫혀 sendResponse 가 던져도 제거 주소 갱신 등은 빠지면 안 된다.
          // 후속 처리를 먼저 시작하고(첫 await 까지 동기 실행) 응답은 그 뒤에 보낸다. 응답 예외는 아래 catch 가 경고한다.
          announceConsent(result)
          const followUp = afterConsentChange(result, source)
          sendResponse({ consent: { status: result.status, decidedAt: result.decidedAt } })
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
