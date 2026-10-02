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

// 제거 주소의 쿼리는 신뢰 경계 밖의 입력이다. 형식이 틀린 값은 null 로 본다.
export function parseUninstallParams(search, now = Date.now()) {
  const params = new URLSearchParams(search)
  const deviceId = params.get('d')
  const version = params.get('v')
  return {
    deviceId: deviceId !== null && UUID.test(deviceId) ? deviceId : null,
    version: version !== null && VERSION.test(version) ? version : null,
    installedAt: parseInstalledAt(params.get('i'), now),
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

// 동의했던 사용자(d 가 있는 경우)에게서만 기록한다. d 가 없으면 화면은 같고 아무것도 보내지 않는다.
export function initUninstalledPage({ document, search, config, now = Date.now() }) {
  const { deviceId, version, installedAt } = parseUninstallParams(search, now)
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
