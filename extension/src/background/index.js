import { MESSAGES } from '../shared/messages.js'
import { debugLog } from '../shared/log.js'
import { track } from './analytics.js'
import { getDeviceId } from './identity.js'
import { saveSummary, loadSummary, removeSummary } from './summaries.js'
import { assignAll } from '../core/experiment.js'
import { configureUninstallUrl, handleInstalled } from './lifecycle.js'

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
      chrome.sidePanel
        .open({ windowId: sender.tab.windowId })
        .catch((error) => console.warn('[체험단 필터] 패널을 열지 못했습니다:', error?.message))
    }
    return false
  }

  if (message?.type === MESSAGES.TRACK) {
    track(message.eventType, message.properties)
    sendResponse({ ok: true })
    return false
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
