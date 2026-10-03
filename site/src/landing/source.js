const UTM_VALUE = /^[a-z0-9_-]{1,40}$/i
const HOST_PREFIX = /^(?:www|m)\./
const WEB_PROTOCOLS = new Set(['http:', 'https:'])

// 주소는 누구나 만들 수 있다. 짧은 영문 토큰만 받아 자유 텍스트(이메일, 한글, 공백)가 통계에 섞이지 않게 한다.
export function normalizeUtm(value) {
  if (typeof value !== 'string' || !UTM_VALUE.test(value)) return null
  return value.toLowerCase()
}

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(HOST_PREFIX, '')
}

// 유입 주소에서 호스트만 남긴다. 경로와 쿼리에는 개인 정보가 실릴 수 있어 읽지 않는다.
// ownHost 는 포트 없는 호스트 이름이어야 한다(URL.hostname 과 비교한다).
// 자기 호스트면 'internal' 이다(처리방침에서 돌아온 경우를 외부 유입과 구분한다).
export function referrerDomain(referrer, ownHost) {
  if (typeof referrer !== 'string' || referrer === '') return null
  let url
  try {
    url = new URL(referrer)
  } catch {
    return null
  }
  if (!WEB_PROTOCOLS.has(url.protocol)) return null
  const host = normalizeHost(url.hostname)
  if (host === '') return null
  if (typeof ownHost === 'string' && host === normalizeHost(ownHost)) return 'internal'
  return host
}

// 쿼리에서는 utm 세 개만 읽는다. 그 밖의 값(이메일 등)은 결과에 담지 않는다.
// entry_source 의 우선순위는 utm_source, 유입 도메인, 'direct' 순이다.
export function resolveSource({ search = '', referrer = '', ownHost } = {}) {
  const query = new URLSearchParams(search)
  const utmSource = normalizeUtm(query.get('utm_source'))
  const domain = referrerDomain(referrer, ownHost)
  return {
    utm_source: utmSource,
    utm_medium: normalizeUtm(query.get('utm_medium')),
    utm_campaign: normalizeUtm(query.get('utm_campaign')),
    referrer_domain: domain,
    entry_source: utmSource ?? domain ?? 'direct',
  }
}
