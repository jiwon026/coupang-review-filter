import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { renderPanel } from './view.js'

const LOG_PREFIX = '[체험단 필터]'
const TRIGGERS = ['banner', 'toolbar']

const root = document.getElementById('root')
let activeTabId = null

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

function request(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve(response)
    })
  })
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
