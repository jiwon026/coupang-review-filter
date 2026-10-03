import { describe, it, expect } from 'vitest'
import { STORE_URL, SITE_ORIGIN } from '../site/src/landing/config.js'
import { storeUrl, handoffUrl } from '../site/src/landing/links.js'
import { resolveSource } from '../site/src/landing/source.js'

const OWN_HOST = new URL(SITE_ORIGIN).hostname

describe('storeUrl', () => {
  it('호스트와 경로는 STORE_URL 과 같고 세 UTM 이 실린다', () => {
    const url = new URL(storeUrl({ entrySource: 'clien.net', variant: 'hero_only' }))
    const base = new URL(STORE_URL)
    expect(url.origin).toBe(base.origin)
    expect(url.pathname).toBe(base.pathname)
    expect(url.searchParams.get('utm_source')).toBe('clien.net')
    expect(url.searchParams.get('utm_medium')).toBe('landing')
    expect(url.searchParams.get('utm_campaign')).toBe('hero_only')
  })

  it('entrySource 에 &, 공백, = 가 있어도 쿼리가 깨지지 않는다', () => {
    const entrySource = 'a b&utm_medium=evil=1'
    const url = new URL(storeUrl({ entrySource, variant: 'hero_sticky' }))
    expect(url.searchParams.get('utm_source')).toBe(entrySource)
    expect(url.searchParams.get('utm_medium')).toBe('landing')
    expect(url.searchParams.getAll('utm_medium')).toHaveLength(1)
  })

  it('값이 비어 있으면 그 UTM 은 싣지 않는다(undefined 문자열 방지)', () => {
    const url = new URL(storeUrl({ entrySource: '', variant: undefined }))
    expect(url.searchParams.has('utm_source')).toBe(false)
    expect(url.searchParams.has('utm_campaign')).toBe(false)
    expect(url.searchParams.get('utm_medium')).toBe('landing')
    expect(url.href).not.toContain('undefined')
  })
})

describe('handoffUrl', () => {
  function roundTrip(url) {
    return resolveSource({ search: new URL(url).search, referrer: '', ownHost: OWN_HOST })
  }

  it('사이트 출처가 SITE_ORIGIN 이다', () => {
    const url = new URL(handoffUrl({ channel: 'copy', entrySource: 'clien.net' }))
    expect(url.origin).toBe(SITE_ORIGIN)
    expect(url.pathname).toBe('/')
  })

  it('점이 있는 도메인은 하이픈으로 바꿔 싣고, resolveSource 가 원래 유입원을 읽어 낸다', () => {
    const resolved = roundTrip(handoffUrl({ channel: 'copy', entrySource: 'clien.net' }))
    expect(resolved.utm_source).toBe('handoff')
    expect(resolved.utm_medium).toBe('copy')
    expect(resolved.utm_campaign).toBe('clien-net')
  })

  it('direct 나 internal 같은 값도 그대로 왕복한다', () => {
    expect(roundTrip(handoffUrl({ channel: 'copy', entrySource: 'direct' })).utm_campaign).toBe('direct')
    expect(roundTrip(handoffUrl({ channel: 'copy', entrySource: 'internal' })).utm_campaign).toBe('internal')
  })

  it('다시 넘기는 utm_campaign(clien-net)도 그대로 유지된다', () => {
    expect(roundTrip(handoffUrl({ channel: 'copy', entrySource: 'clien-net' })).utm_campaign).toBe('clien-net')
  })

  it('점을 바꾼 뒤 40자를 넘기는 60자 도메인은 utm_campaign 을 싣지 않는다', () => {
    const domain = `${'a'.repeat(28)}.${'b'.repeat(28)}.kr`
    expect(domain).toHaveLength(60)
    const url = new URL(handoffUrl({ channel: 'copy', entrySource: domain }))
    expect(url.searchParams.has('utm_campaign')).toBe(false)
    const resolved = roundTrip(url.href)
    expect(resolved.utm_source).toBe('handoff')
    expect(resolved.utm_campaign).toBeNull()
  })

  it('점을 바꾼 뒤 정확히 40자인 도메인은 싣는다', () => {
    const domain = `${'a'.repeat(36)}.com`
    expect(domain).toHaveLength(40)
    expect(roundTrip(handoffUrl({ channel: 'copy', entrySource: domain })).utm_campaign).toBe(
      domain.replaceAll('.', '-'),
    )
  })

  it('이상한 문자가 섞인 값은 utm_campaign 을 싣지 않는다', () => {
    const url = new URL(handoffUrl({ channel: 'copy', entrySource: 'a b&c=d' }))
    expect(url.searchParams.has('utm_campaign')).toBe(false)
  })

  it('entrySource 가 비었거나 없으면 utm_campaign 을 싣지 않는다', () => {
    for (const entrySource of ['', undefined, null]) {
      const url = new URL(handoffUrl({ channel: 'copy', entrySource }))
      expect(url.searchParams.has('utm_campaign')).toBe(false)
      expect(url.searchParams.get('utm_source')).toBe('handoff')
      expect(url.searchParams.get('utm_medium')).toBe('copy')
    }
  })
})
