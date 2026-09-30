import { MESSAGES } from '../shared/messages.js'
import { track } from './analytics.js'
import { getDeviceId } from './identity.js'
import { assign, EXPERIMENTS } from '../core/experiment.js'

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGES.TRACK) {
    track(message.eventType, message.properties)
    sendResponse({ ok: true })
    return false
  }

  if (message?.type === MESSAGES.GET_VARIANT) {
    getDeviceId()
      .then((deviceId) => {
        const variants = {}
        for (const experiment of Object.values(EXPERIMENTS)) {
          variants[experiment.id] = assign(deviceId, experiment.id, experiment.variants)
        }
        sendResponse({ variants })
      })
      .catch(() => sendResponse({ variants: null }))
    return true
  }

  return false
})
