// 앰플리튜드 HTTP API V2 페이로드를 만든다. 확장의 background/analytics.js 와 같은 모양이지만
// 패키지 경계를 지키려고 확장 코드를 가져오지 않는다.
const PLATFORM = 'Web'
const SURFACE = 'site'
// 앰플리튜드에서 세션 밖 이벤트를 뜻하는 값. 제거 페이지 방문 한 건이 세션 하나로 세어지지 않게 한다.
const NO_SESSION_ID = -1

export const DEFAULT_ENDPOINT = 'https://api2.amplitude.com/2/httpapi'

// sessionId 가 없으면(제거 페이지) 세션 밖으로 보낸다. 랜딩은 페이지 로드 시각을 넘겨 한 방문을 한 세션으로 묶는다.
export function buildSiteEvent({
  apiKey,
  deviceId,
  eventType,
  properties,
  appVersion,
  now,
  insertId,
  sessionId,
}) {
  const event = {
    device_id: deviceId,
    event_type: eventType,
    platform: PLATFORM,
    // surface 는 이벤트 프로퍼티가 덮어쓰지 못한다.
    event_properties: { ...properties, surface: SURFACE },
    time: now,
    session_id: sessionId ?? NO_SESSION_ID,
    insert_id: insertId,
  }

  if (appVersion != null) event.app_version = appVersion

  return { api_key: apiKey, events: [event] }
}

// 보내는 데 실패해도 페이지를 깨뜨리지 않는다. fetch 는 첫 await 전에 동기적으로 호출된다.
export async function sendSiteEvent(payload, endpoint = DEFAULT_ENDPOINT) {
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch {
    // 제거 페이지의 계측은 최선 노력이다.
  }
}
