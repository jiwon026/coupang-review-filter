import { buildSiteEvent, sendSiteEvent, DEFAULT_ENDPOINT } from '../analytics.js'

export const EVENTS = {
  LANDING_VIEWED: 'Landing Viewed',
  DEMO_VIEWED: 'Demo Viewed',
  INSTALL_CTA_CLICKED: 'Install CTA Clicked',
  HANDOFF_REQUESTED: 'Handoff Link Requested',
}

// 랜딩 이벤트를 보내는 함수를 만든다. 계측은 최선 노력이라 어떤 실패도 밖으로 내보내지 않는다.
// 키가 없거나(개발 빌드) enabled 가 false 면 아무것도 보내지 않는다.
// common 은 모든 이벤트에 실리고 이벤트 프로퍼티가 덮어쓰지 못한다(순서상 뒤에 둔다).
// now 는 이벤트마다 부르는 함수라 time 이 각 이벤트의 발생 시각이 된다.
export function createTracker({
  apiKey,
  endpoint = DEFAULT_ENDPOINT,
  deviceId,
  enabled,
  common = {},
  sessionId,
  now = () => Date.now(),
  randomUUID = () => crypto.randomUUID(),
  send = (payload) => sendSiteEvent(payload, endpoint),
}) {
  const canSend = Boolean(enabled) && Boolean(apiKey)

  return (eventType, properties = {}) => {
    if (!canSend) return
    try {
      const payload = buildSiteEvent({
        apiKey,
        deviceId,
        eventType,
        properties: { ...properties, ...common },
        now: now(),
        insertId: randomUUID(),
        sessionId,
      })
      const result = send(payload)
      // 거부된 약속을 받아 두지 않으면 처리되지 않은 거부가 콘솔에 남는다.
      if (result && typeof result.catch === 'function') result.catch(() => {})
    } catch {
      // 동기 예외도 페이지를 깨뜨리지 않는다.
    }
  }
}
