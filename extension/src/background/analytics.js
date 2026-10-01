import { CONFIG } from '../shared/config.local.js'
import { getDeviceId, getUserId } from './identity.js'
import { assignAll } from '../core/experiment.js'

// 앰플리튜드는 이벤트 최상위의 platform 과 app_version 을 기기 속성으로 쓴다.
const AMPLITUDE_PLATFORM = 'Chrome Extension'

export function buildPayload(input) {
  const event = {
    device_id: input.deviceId,
    event_type: input.eventType,
    platform: AMPLITUDE_PLATFORM,
    app_version: input.appVersion,
    event_properties: { ...input.commonProperties, ...input.properties },
    time: input.time,
    insert_id: input.insertId,
  }

  if (input.userId) event.user_id = input.userId

  return {
    api_key: input.apiKey,
    events: [event],
  }
}

export function isApiKeyMissing(apiKey) {
  return !apiKey || apiKey.startsWith('PASTE_')
}

function appVersion() {
  return chrome.runtime.getManifest().version
}

function commonProperties(deviceId) {
  const experiments = {}
  for (const [id, variant] of Object.entries(assignAll(deviceId))) {
    experiments[`exp_${id}`] = variant
  }

  return {
    surface: 'extension',
    platform: 'desktop',
    app_version: appVersion(),
    ...experiments,
  }
}

export async function track(eventType, properties = {}) {
  try {
    if (isApiKeyMissing(CONFIG.amplitudeApiKey)) {
      console.warn('[체험단 필터] 앰플리튜드 키가 없습니다. 계측이 비활성화됩니다.')
      return
    }

    const deviceId = await getDeviceId()
    const payload = buildPayload({
      apiKey: CONFIG.amplitudeApiKey,
      deviceId,
      userId: await getUserId(),
      eventType,
      properties,
      appVersion: appVersion(),
      commonProperties: commonProperties(deviceId),
      time: Date.now(),
      insertId: crypto.randomUUID(),
    })

    const response = await fetch(CONFIG.amplitudeEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.warn('[체험단 필터] 이벤트 전송 실패', response.status, eventType)
    }
  } catch (error) {
    console.warn('[체험단 필터] 이벤트 전송 오류', eventType, error)
  }
}
