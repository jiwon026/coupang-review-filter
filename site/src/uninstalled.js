import { buildSiteEvent, sendSiteEvent, DEFAULT_ENDPOINT } from './analytics.js'

const DAY_MS = 24 * 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VERSION = /^\d+\.\d+\.\d+$/
const POSITIVE_INTEGER = /^[1-9]\d*$/

const EVENT_REMOVED = 'Extension Removed'
const EVENT_REASON = 'Removal Reason Selected'
const REASONS = new Set(['detection', 'layout', 'rarely_used', 'other'])
const THANKS = '알려 주셔서 감사합니다'

function parseInstalledAt(value, now) {
  if (value == null || !POSITIVE_INTEGER.test(value)) return null
  const installedAt = Number(value)
  return Number.isSafeInteger(installedAt) && installedAt < now ? installedAt : null
}

// 제거 주소는 신뢰 경계 밖의 입력이다. 형식이 틀린 값은 null 로 본다.
// d(기기 번호)와 i(설치 시각)는 조각(#)에서만 읽는다. 조각은 서버로 전송되지 않아 호스팅 서버의 접속 기록에 남지 않는다.
// 쿼리의 d 와 i 는 읽지 않는다. v(버전)는 식별자가 아니므로 쿼리에서 읽는다.
export function parseUninstallParams({ search = '', hash = '' } = {}, now = Date.now()) {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const deviceId = fragment.get('d')
  const version = query.get('v')
  return {
    deviceId: deviceId !== null && UUID.test(deviceId) ? deviceId : null,
    version: version !== null && VERSION.test(version) ? version : null,
    installedAt: parseInstalledAt(fragment.get('i'), now),
  }
}

// 읽은 조각을 주소창과 방문 기록에서 지운다. 새 항목을 쌓지 않으려고 replaceState 를 쓴다. 실패해도 페이지는 그대로 동작한다.
function clearFragment(location, history) {
  if (!location.hash) return
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}`)
  } catch {
    // 지우지 못해도 조각은 서버로 가지 않는다.
  }
}

export function daysSince(installedAt, now) {
  if (installedAt == null) return null
  return Math.floor((now - installedAt) / DAY_MS)
}

function showThanks(document) {
  const reasons = document.getElementById('reasons')
  const thanks = document.getElementById('thanks')
  thanks.textContent = THANKS
  thanks.hidden = false
  reasons.hidden = true
}

// 동의했던 사용자(조각에 d 가 있는 경우)에게서만 기록한다. d 가 없으면 화면은 같고 통계를 보내지 않는다.
export function initUninstalledPage({ document, location, history, config, now = Date.now() }) {
  const { deviceId, version, installedAt } = parseUninstallParams(location, now)
  clearFragment(location, history)
  const endpoint = config.endpoint || DEFAULT_ENDPOINT
  // 키가 없으면(개발 빌드) 계측이 꺼진다.
  const canSend = Boolean(config.apiKey) && deviceId !== null

  // insert_id 는 기기당 고정이라 새로고침이나 탭 복원으로 다시 보내도 앰플리튜드가 중복을 걸러 낸다.
  const track = (eventType, properties, insertId) => {
    if (!canSend) return
    const payload = buildSiteEvent({
      apiKey: config.apiKey,
      deviceId,
      eventType,
      properties,
      appVersion: version,
      now,
      insertId,
    })
    void sendSiteEvent(payload, endpoint)
  }

  const days = daysSince(installedAt, now)
  track(EVENT_REMOVED, days === null ? {} : { days_since_install: days }, `removed:${deviceId}`)

  // 사유는 한 번만 받는다. 두 번째부터는 무시한다.
  let answered = false
  for (const button of document.querySelectorAll('[data-reason]')) {
    button.addEventListener('click', () => {
      if (answered) return
      const reason = button.dataset.reason
      if (!REASONS.has(reason)) return
      answered = true
      track(EVENT_REASON, { reason }, `reason:${deviceId}`)
      showThanks(document)
    })
  }
}
