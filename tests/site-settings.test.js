import { describe, it, expect } from 'vitest'
import { SITE, isLandingConfigured, privacyUrl } from '../extension/src/shared/site.js'

describe('SITE', () => {
  it('공개 설정의 고정값', () => {
    expect(SITE.privacyPath).toBe('/privacy')
    expect(SITE.uninstallPath).toBe('/uninstalled')
    expect(SITE.exampleProductUrl).toBe('https://www.coupang.com/vp/products/7590830589')
  })

  // 실제 주소가 들어와도 깨지지 않게 값이 아니라 형식만 본다. 경로나 끝 슬래시가 없는 https 출처여야 한다.
  it('landingOrigin 은 https 주소 형식이다', () => {
    expect(SITE.landingOrigin).toMatch(/^https:\/\/[^/\s?#]+$/)
    expect(new URL(SITE.landingOrigin).origin).toBe(SITE.landingOrigin)
  })
})

describe('isLandingConfigured', () => {
  it('실제 랜딩 주소는 true', () => {
    expect(isLandingConfigured('https://landing.test')).toBe(true)
    expect(isLandingConfigured('https://coupang-filter.vercel.app')).toBe(true)
  })

  it('비었거나 파싱 불가이거나 example.com 이면 false', () => {
    expect(isLandingConfigured('')).toBe(false)
    expect(isLandingConfigured(undefined)).toBe(false)
    expect(isLandingConfigured(null)).toBe(false)
    expect(isLandingConfigured('nope')).toBe(false)
    expect(isLandingConfigured('https://example.com')).toBe(false)
    expect(isLandingConfigured('https://example.com/path')).toBe(false)
    expect(isLandingConfigured('https://www.example.com')).toBe(false)
  })

  it('example.com 을 접미사로 가진 다른 도메인은 true', () => {
    expect(isLandingConfigured('https://notexample.com')).toBe(true)
  })
})

describe('privacyUrl', () => {
  it('사이트가 설정돼 있으면 origin 에 privacyPath 를 붙인다', () => {
    expect(privacyUrl('https://landing.test')).toBe('https://landing.test/privacy')
  })

  it('사이트가 설정돼 있지 않으면 null', () => {
    expect(privacyUrl('https://example.com')).toBeNull()
    expect(privacyUrl('')).toBeNull()
    expect(privacyUrl('not a url')).toBeNull()
  })

  it('인자가 없으면 SITE.landingOrigin 을 쓴다', () => {
    expect(privacyUrl()).toBe(privacyUrl(SITE.landingOrigin))
    expect(privacyUrl()).toBe(
      isLandingConfigured(SITE.landingOrigin) ? `${SITE.landingOrigin}/privacy` : null,
    )
  })
})

describe('config.example.js', () => {
  it('사이트 주소는 비밀이 아니므로 키 파일 예시에 landingOrigin 을 두지 않는다', async () => {
    const { CONFIG } = await import('../extension/src/shared/config.example.js')
    expect('landingOrigin' in CONFIG).toBe(false)
  })
})
