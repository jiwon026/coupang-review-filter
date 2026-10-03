import { STORE_URL, SITE_ORIGIN } from './config.js'
import { normalizeUtm } from './source.js'

// 값은 URLSearchParams 가 인코딩하므로 &, 공백, = 가 있어도 쿼리가 깨지지 않는다.
// 비어 있는 값은 'undefined' 문자열이 실리지 않게 아예 붙이지 않는다.
function setIfPresent(params, key, value) {
  if (typeof value === 'string' && value !== '') params.set(key, value)
}

// 스토어 주소에 유입원(utm_source)과 실험 배정(utm_campaign)을 싣는다.
export function storeUrl({ entrySource, variant } = {}) {
  const url = new URL(STORE_URL)
  setIfPresent(url.searchParams, 'utm_source', entrySource)
  url.searchParams.set('utm_medium', 'landing')
  setIfPresent(url.searchParams, 'utm_campaign', variant)
  return url.toString()
}

// 다른 기기로 넘기는 주소. 받는 쪽의 normalizeUtm 이 점이 있는 도메인을 버리므로 점을 하이픈으로 바꿔 싣는다.
// 바꾼 뒤에도 normalizeUtm 을 통과하지 못하면(40자 초과, 이상한 문자) 받는 쪽이 어차피 버리므로 싣지 않는다.
export function handoffUrl({ channel, entrySource } = {}) {
  const url = new URL('/', SITE_ORIGIN)
  url.searchParams.set('utm_source', 'handoff')
  setIfPresent(url.searchParams, 'utm_medium', channel)
  const campaign = normalizeUtm(String(entrySource ?? '').replaceAll('.', '-'))
  if (campaign !== null) url.searchParams.set('utm_campaign', campaign)
  return url.toString()
}
