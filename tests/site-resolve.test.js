import { describe, it, expect } from 'vitest'
import { resolveSite } from '../extension/src/content/sites/index.js'
import { coupang } from '../extension/src/content/sites/coupang.js'
import { musinsa } from '../extension/src/content/sites/musinsa.js'

describe('resolveSite', () => {
  it('www.coupang.com 은 쿠팡 부품이다', () => {
    expect(resolveSite('www.coupang.com')).toBe(coupang)
  })

  it('www.musinsa.com 은 무신사 부품이다', () => {
    expect(resolveSite('www.musinsa.com')).toBe(musinsa)
  })

  it.each([
    ['이름에 coupang 이 들어간 다른 호스트', 'evil-coupang.com'],
    ['쿠팡 호스트로 시작하는 다른 호스트', 'coupang.com.evil.net'],
    ['www 가 없는 호스트', 'coupang.com'],
    ['www 가 없는 무신사 호스트', 'musinsa.com'],
    ['무신사 모바일 호스트', 'm.musinsa.com'],
    ['무신사 호스트로 시작하는 다른 호스트', 'www.musinsa.com.evil.net'],
    ['빈 문자열', ''],
  ])('%s 는 null', (_label, hostname) => {
    expect(resolveSite(hostname)).toBeNull()
  })

  it('문자열이 아니어도 던지지 않고 null', () => {
    expect(resolveSite(undefined)).toBeNull()
    expect(resolveSite(null)).toBeNull()
  })
})
