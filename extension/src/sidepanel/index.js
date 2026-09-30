import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { renderPanel } from './view.js'

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

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== MESSAGES.SUMMARY_UPDATED) return false
  if (sender.tab?.id !== activeTabId) return false
  renderPanel(root, message.summary)
  return false
})

chrome.tabs.onActivated.addListener(() => {
  load()
})

chrome.runtime.sendMessage({ type: MESSAGES.TRACK, eventType: EVENTS.PANEL_OPENED, properties: {} })

load()
