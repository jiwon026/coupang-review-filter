import { CONFIG } from '../shared/config.local.js'
import { getDeviceId, getUserId } from './identity.js'
import { assignAll } from '../core/experiment.js'
import { getSessionId } from './session.js'
import { isCollectionAllowed } from './consent.js'

// 앰플리튜드는 이벤트 최상위의 platform 과 app_version 을 기기 속성으로 쓴다.
const AMPLITUDE_PLATFORM = 'Chrome Extension'
// 앰플리튜드에서 세션 밖 이벤트를 뜻하는 값. 세션을 얻지 못해도 이벤트 자체는 보낸다.
const NO_SESSION_ID = -1

export function buildPayload(input) {
  const event = {
    device_id: input.deviceId,
    event_type: input.eventType,
    platform: AMPLITUDE_PLATFORM,
    app_version: input.appVersion,
    // 공통 프로퍼티(실험 배정, surface, app_version)가 이긴다. 이벤트 프로퍼티는 콘텐츠 메시지에서 오는 신뢰 경계 밖 값이다.
    event_properties: { ...input.properties, ...input.commonProperties },
    time: input.time,
    session_id: input.sessionId,
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

async function sessionIdAt(now) {
  try {
    return await getSessionId(now)
  } catch (error) {
    console.warn('[체험단 필터] 세션을 얻지 못했습니다. 세션 밖 이벤트로 보냅니다.', error?.message ?? error)
    return NO_SESSION_ID
  }
}

export async function track(eventType, properties = {}) {
  try {
    if (isApiKeyMissing(CONFIG.amplitudeApiKey)) {
      console.warn('[체험단 필터] 앰플리튜드 키가 없습니다. 계측이 비활성화됩니다.')
      return
    }

    // 동의한 경우에만 보낸다. 미동의는 정상 상태이므로 경고하지 않고 쌓아 두지도 않는다.
    if (!(await isCollectionAllowed())) return

    // 이벤트 시각과 세션 판정이 같은 시계를 쓰도록 한 번만 읽는다.
    const now = Date.now()
    const sessionId = await sessionIdAt(now)
    const deviceId = await getDeviceId()
    const payload = buildPayload({
      apiKey: CONFIG.amplitudeApiKey,
      deviceId,
      userId: await getUserId(),
      eventType,
      properties,
      appVersion: appVersion(),
      commonProperties: commonProperties(deviceId),
      time: now,
      sessionId,
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
