import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeUtm, referrerDomain, resolveSource } from '../site/src/landing/source.js'

const OWN_HOST = 'site.test'

describe('normalizeUtm', () => {
  it('대문자는 소문자로 바꾼다', () => {
    expect(normalizeUtm('Clien')).toBe('clien')
  })

  it('영문, 숫자, 밑줄, 하이픈은 통과한다', () => {
    expect(normalizeUtm('a_b-1')).toBe('a_b-1')
  })

  it('40자는 통과하고 41자는 null 이다', () => {
    expect(normalizeUtm('a'.repeat(40))).toBe('a'.repeat(40))
    expect(normalizeUtm('a'.repeat(41))).toBeNull()
  })

  it('빈 문자열은 null 이다', () => {
    expect(normalizeUtm('')).toBeNull()
  })

  it('공백, 이메일, 한글 같은 자유 텍스트는 null 이다', () => {
    expect(normalizeUtm('a b')).toBeNull()
    expect(normalizeUtm('a@b.com')).toBeNull()
    expect(normalizeUtm('한글')).toBeNull()
  })

  it('앞뒤에 줄바꿈이나 공백이 붙은 값은 null 이다', () => {
    expect(normalizeUtm('clien\n')).toBeNull()
    expect(normalizeUtm(' clien')).toBeNull()
  })

  it('문자열이 아니면 null 이다', () => {
    expect(normalizeUtm(null)).toBeNull()
    expect(normalizeUtm(undefined)).toBeNull()
    expect(normalizeUtm(123)).toBeNull()
    expect(normalizeUtm(['clien'])).toBeNull()
  })
})

describe('referrerDomain', () => {
  it('경로와 쿼리를 버리고 www 를 뗀 호스트만 돌려준다', () => {
    const result = referrerDomain('https://www.clien.net/service/board/park/123?x=1', OWN_HOST)
    expect(result).toBe('clien.net')
    expect(result).not.toContain('/')
    expect(result).not.toContain('123')
    expect(result).not.toContain('x=1')
  })

  it('m. 도 뗀다', () => {
    expect(referrerDomain('https://m.ppomppu.co.kr/', OWN_HOST)).toBe('ppomppu.co.kr')
  })

  it('호스트를 소문자로 바꾼다', () => {
    expect(referrerDomain('https://WWW.Clien.NET/a', OWN_HOST)).toBe('clien.net')
  })

  it('http 도 받는다', () => {
    expect(referrerDomain('http://clien.net/a', OWN_HOST)).toBe('clien.net')
  })

  it('http, https 가 아닌 프로토콜은 null 이다', () => {
    expect(referrerDomain('android-app://com.kakao.talk', OWN_HOST)).toBeNull()
    expect(referrerDomain('ftp://clien.net/', OWN_HOST)).toBeNull()
    expect(referrerDomain('javascript:alert(1)', OWN_HOST)).toBeNull()
  })

  it('빈 문자열, 파싱할 수 없는 값, 문자열이 아닌 값은 null 이다', () => {
    expect(referrerDomain('', OWN_HOST)).toBeNull()
    expect(referrerDomain('not a url', OWN_HOST)).toBeNull()
    expect(referrerDomain(undefined, OWN_HOST)).toBeNull()
    expect(referrerDomain(null, OWN_HOST)).toBeNull()
  })

  it('자기 호스트면 internal 이다', () => {
    expect(referrerDomain('https://site.test/privacy', OWN_HOST)).toBe('internal')
    expect(referrerDomain('https://www.site.test/privacy', OWN_HOST)).toBe('internal')
  })
})

describe('resolveSource', () => {
  const resolve = (search, referrer = '') => resolveSource({ search, referrer, ownHost: OWN_HOST })

  it('UTM 이 있으면 그것이 entry_source 다(유입 도메인이 있어도)', () => {
    expect(resolve('?utm_source=Clien&utm_medium=post&utm_campaign=launch1', 'https://www.ppomppu.co.kr/x')).toEqual({
      utm_source: 'clien',
      utm_medium: 'post',
      utm_campaign: 'launch1',
      referrer_domain: 'ppomppu.co.kr',
      entry_source: 'clien',
    })
  })

  it('UTM 이 없고 유입 도메인만 있으면 도메인이 entry_source 다', () => {
    expect(resolve('', 'https://www.clien.net/a')).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      referrer_domain: 'clien.net',
      entry_source: 'clien.net',
    })
  })

  it('둘 다 없으면 direct 다', () => {
    expect(resolve('', '')).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      referrer_domain: null,
      entry_source: 'direct',
    })
  })

  it('잘못된 utm_source 는 버리고 도메인으로 넘어간다', () => {
    const result = resolve('?utm_source=a@b.com', 'https://m.ppomppu.co.kr/')
    expect(result.utm_source).toBeNull()
    expect(result.entry_source).toBe('ppomppu.co.kr')
  })

  it('잘못된 utm_source 와 유입 도메인이 모두 없으면 direct 다', () => {
    expect(resolve('?utm_source=%ED%95%9C%EA%B8%80').entry_source).toBe('direct')
  })

  it('utm_source=handoff 는 그대로 handoff 이고 원래 유입원은 utm_campaign 에 실려 온다', () => {
    const result = resolve('?utm_source=handoff&utm_campaign=clien')
    expect(result.utm_source).toBe('handoff')
    expect(result.utm_campaign).toBe('clien')
    expect(result.entry_source).toBe('handoff')
  })

  it('처리방침에서 돌아온 경우 referrer_domain 은 internal 이다', () => {
    const result = resolve('', 'https://site.test/privacy')
    expect(result.referrer_domain).toBe('internal')
    expect(result.entry_source).toBe('internal')
  })

  it('search 의 다른 쿼리는 결과 어디에도 없다', () => {
    const result = resolve('?email=a@b.com&utm_source=x', 'https://www.clien.net/a')
    expect(JSON.stringify(result)).not.toContain('a@b.com')
    expect(JSON.stringify(result)).not.toContain('email')
    expect(result.utm_source).toBe('x')
  })

  it('search 가 없거나 빈 값이어도 던지지 않는다', () => {
    expect(resolveSource({ referrer: '', ownHost: OWN_HOST }).entry_source).toBe('direct')
    expect(resolveSource({ search: '', referrer: undefined, ownHost: OWN_HOST }).entry_source).toBe('direct')
  })
})

// 글에 붙여 넣는 링크는 docs/launch/channels.md 의 표에서 가져온다. 표의 값이 랜딩의 검증을 통과하지 못하면
// 그 채널의 유입이 조용히 버려지므로, 문서의 링크를 직접 읽어 검사한다.
describe('유입 채널 문서의 링크', () => {
  const doc = readFileSync(new URL('../docs/launch/channels.md', import.meta.url), 'utf8')
  const links = [...new Set(doc.match(/https:\/\/crf-review-remover\.vercel\.app\/\?[^\s`)]+/g) ?? [])]

  it('표에 채널 링크가 여섯 개 이상 있다', () => {
    expect(links.length).toBeGreaterThanOrEqual(6)
  })

  it('모든 링크의 표식 세 개가 normalizeUtm 을 그대로 통과한다', () => {
    for (const link of links) {
      const params = new URL(link).searchParams
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
        const value = params.get(key)
        expect(value, `${link} 의 ${key}`).not.toBeNull()
        expect(normalizeUtm(value), `${link} 의 ${key}`).toBe(value)
      }
    }
  })

  it('랜딩이 읽으면 entry_source 가 그 채널의 utm_source 가 된다', () => {
    for (const link of links) {
      const url = new URL(link)
      const result = resolveSource({ search: url.search, referrer: '', ownHost: url.hostname })
      expect(result.entry_source, link).toBe(url.searchParams.get('utm_source'))
    }
  })

  it('채널마다 utm_source 가 다르다(같은 링크의 반복은 하나로 센다)', () => {
    const sources = links.map((link) => new URL(link).searchParams.get('utm_source'))
    expect(new Set(sources).size).toBe(sources.length)
  })
})
