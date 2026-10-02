import { CONFIG } from '../shared/config.local.js'
import { getDeviceId, getUserId } from './identity.js'
import { assignAll } from '../core/experiment.js'
import { getSessionId } from './session.js'
import { isCollectionAllowed } from './consent.js'
import { pseudonymize } from './pseudonym.js'
import { safeErrorName } from '../shared/error-name.js'

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

// 쿠팡의 상품 번호와 리뷰 번호 원문은 기기 밖으로 나가지 않는다(명세 11.3). 새 식별자가 생기면 한 줄 추가한다.
const PSEUDONYMIZED = { product_id: 'product_key', page_first_review_id: 'page_key' }

// 두 번째 방어선. 표에 없는 식별자나 자유 텍스트가 새지 않게 한다.
// 예외 메시지 같은 자유 텍스트에는 리뷰 본문이나 쿠팡 번호가 섞일 수 있다. 콘텐츠 스크립트가 싣지 않지만 들어와도 값과 무관하게 지운다.
const FREE_TEXT_KEYS = ['error_message']
const ID_SUFFIX = /_id$/i

// 원문 키는 항상 지운다. 해시에 실패하면 원문 대신 null 을 보낸다.
async function minimize(properties) {
  const result = { ...properties }
  for (const key of FREE_TEXT_KEYS) delete result[key]
  // 오류 이름은 콘텐츠 스크립트가 이미 걸러 보내지만 메시지는 신뢰 경계 밖에서 온다. 고정된 모양이 아니면 Unknown 으로 바꾼다.
  if ('error_name' in result) result.error_name = safeErrorName(result.error_name)
  for (const [rawKey, safeKey] of Object.entries(PSEUDONYMIZED)) {
    if (!(rawKey in result)) continue
    const raw = result[rawKey]
    delete result[rawKey]
    try {
      result[safeKey] = await pseudonymize(raw)
    } catch {
      result[safeKey] = null
    }
  }
  // 표에 없는 _id 접미사 키는 새 식별자를 표에 넣지 않고 추가한 것이다. 실패 시 닫힘으로 지우고 키 이름만 경고한다.
  for (const key of Object.keys(result)) {
    if (!ID_SUFFIX.test(key)) continue
    delete result[key]
    console.warn(`[체험단 필터] 표에 없는 식별자 키를 보내지 않았습니다: ${key}`)
  }
  return result
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

// options.time 은 이벤트 시각(ms)을 지정한다. 백그라운드 내부 호출만 쓴다(첫 동의의 Extension Installed).
// 메시지로 들어온 이벤트는 시각을 지정할 수 없다. 없거나 유한한 수가 아니면 지금 시각을 쓴다.
export async function track(eventType, properties = {}, options = {}) {
  try {
    if (isApiKeyMissing(CONFIG.amplitudeApiKey)) {
      console.warn('[체험단 필터] 앰플리튜드 키가 없습니다. 계측이 비활성화됩니다.')
      return
    }

    // 동의한 경우에만 보낸다. 미동의는 정상 상태이므로 경고하지 않고 쌓아 두지도 않는다.
    if (!(await isCollectionAllowed())) return

    // 이벤트 시각과 세션 판정이 같은 시계를 쓰도록 한 번만 읽는다.
    const now = Number.isFinite(options?.time) ? options.time : Date.now()
    const sessionId = await sessionIdAt(now)
    const deviceId = await getDeviceId()
    const payload = buildPayload({
      apiKey: CONFIG.amplitudeApiKey,
      deviceId,
      userId: await getUserId(),
      eventType,
      properties: await minimize(properties),
      appVersion: appVersion(),
      commonProperties: commonProperties(deviceId),
      time: now,
      sessionId,
      insertId: crypto.randomUUID(),
    })

    // 준비하는 사이에 동의가 철회됐을 수 있다. 앞쪽 게이트는 미동의 상태에서 세션과 솔트를 만들지 않으려고 둔다.
    if (!(await isCollectionAllowed())) return

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
