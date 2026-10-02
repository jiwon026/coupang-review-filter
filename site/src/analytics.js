// 앰플리튜드 HTTP API V2 페이로드를 만든다. 확장의 background/analytics.js 와 같은 모양이지만
// 패키지 경계를 지키려고 확장 코드를 가져오지 않는다.
const PLATFORM = 'Web'
const SURFACE = 'site'

export const DEFAULT_ENDPOINT = 'https://api2.amplitude.com/2/httpapi'

export function buildSiteEvent({ apiKey, deviceId, eventType, properties, appVersion, now, insertId }) {
  const event = {
    device_id: deviceId,
    event_type: eventType,
    platform: PLATFORM,
    // surface 는 이벤트 프로퍼티가 덮어쓰지 못한다.
    event_properties: { ...properties, surface: SURFACE },
    time: now,
    // 세션은 페이지 로드 시각이다. 제거 페이지는 한 번 열리고 끝난다.
    session_id: now,
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
