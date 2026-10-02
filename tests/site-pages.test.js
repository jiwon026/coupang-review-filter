import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { readFileSync, readdirSync } from 'node:fs'
import { fillContact } from '../site/src/contact.js'

const PUBLIC_DIR = new URL('../site/public/', import.meta.url)
const SRC_DIR = new URL('../site/src/', import.meta.url)
const PAGES = ['index.html', 'privacy.html', 'uninstalled.html']

function load(name) {
  return new JSDOM(readFileSync(new URL(name, PUBLIC_DIR), 'utf8')).window.document
}

describe('처리방침', () => {
  const doc = load('privacy.html')
  const text = doc.body.textContent.replace(/\s+/g, ' ')

  it('이름과 제목을 쓴다', () => {
    expect(doc.querySelector('h1').textContent).toBe('개인정보 처리방침')
    expect(text).toContain('체험단 리뷰 제거기 for 쿠팡(이하 "확장")이 어떤 정보를 다루는지 설명합니다.')
  })

  it('아홉 개 절의 제목이 순서대로 있다', () => {
    const headings = [...doc.querySelectorAll('h2')].map((h) => h.textContent)
    expect(headings).toEqual([
      '1. 확장이 하는 일',
      '2. 동의한 경우에만 보내는 익명 통계',
      '3. 보내지 않는 것',
      '4. 쓰는 목적',
      '5. 보관 위치와 처리 위탁',
      '6. 동의를 바꾸는 방법',
      '7. 확장을 제거할 때',
      '8. 삭제 요청과 문의',
      '9. 쿠팡과의 관계',
    ])
  })

  it('핵심 문장을 그대로 담는다', () => {
    for (const sentence of [
      '리뷰 내용은 어디로도 전송되지 않습니다.',
      '동의하지 않으면 아무것도 보내지 않으며, 모든 기능은 그대로 쓸 수 있습니다.',
      '상품 번호와 리뷰 번호는 기기마다 다른 무작위 값과 섞어 되돌릴 수 없는 값으로 바꾼 뒤에만 보냅니다.',
      '광고에 쓰지 않고, 판매하거나 다른 곳에 넘기지 않습니다.',
      '통계는 분석 서비스 Amplitude(Amplitude, Inc., 미국)에 저장됩니다.',
      '확장 아이콘을 눌러 패널을 열면 맨 아래에서 언제든 켜고 끌 수 있습니다.',
      '동의하지 않은 경우에는 제거 안내 페이지가 열릴 뿐 아무것도 기록되지 않습니다.',
      '이 확장은 쿠팡과 관계가 없는 개인이 만든 도구입니다.',
    ]) {
      expect(text).toContain(sentence)
    }
  })

  it('보내는 정보와 보내지 않는 정보 목록이 각각 6개와 3개다', () => {
    const lists = doc.querySelectorAll('ul')
    expect(lists[0].querySelectorAll('li')).toHaveLength(6)
    expect(lists[1].querySelectorAll('li')).toHaveLength(3)
  })

  // 배포 때 실제 날짜로 바뀐다. 자리표시자와 날짜 형식 둘 다 받는다.
  it('시행일은 배포 시 기재이거나 YYYY-MM-DD 형식의 날짜다', () => {
    expect(doc.querySelector('.effective').textContent).toMatch(/^시행일: (?:배포 시 기재|\d{4}-\d{2}-\d{2})$/)
  })

  it('연락처 자리는 비어 있는 요소이고 contact.js 를 불러온다', () => {
    expect(doc.getElementById('contact').textContent).toBe('')
    expect(doc.querySelector('script[src="/assets/contact.js"]')).not.toBeNull()
  })
})

describe('fillContact', () => {
  it('값이 있으면 textContent 로 채운다', () => {
    const doc = load('privacy.html')
    fillContact(doc, 'a <b>b</b>')
    expect(doc.getElementById('contact').textContent).toBe('a <b>b</b>')
    expect(doc.getElementById('contact').children).toHaveLength(0)
  })

  it('값이 비어 있으면 준비 중을 보여 준다', () => {
    const doc = load('privacy.html')
    fillContact(doc, '')
    expect(doc.getElementById('contact').textContent).toBe('준비 중')
  })
})

describe('임시 첫 화면', () => {
  it('이름, 설명, 안내 문구, 처리방침 링크가 있다', () => {
    const doc = load('index.html')
    expect(doc.querySelector('h1').textContent).toBe('체험단 리뷰 제거기 for 쿠팡')
    expect(doc.body.textContent).toContain('곧 크롬 웹스토어에서 만나요')
    expect(doc.querySelector('a[href="/privacy"]')).not.toBeNull()
  })
})

describe('세 페이지 공통', () => {
  for (const name of PAGES) {
    const html = readFileSync(new URL(name, PUBLIC_DIR), 'utf8')
    const doc = new JSDOM(html).window.document

    it(`${name}: 모바일 뷰포트와 한국어 문서다`, () => {
      expect(doc.documentElement.lang).toBe('ko')
      expect(doc.querySelector('meta[name="viewport"]').content).toContain('width=device-width')
    })

    it(`${name}: 원격 자원과 인라인 스크립트가 없다`, () => {
      const sources = [...doc.querySelectorAll('[src], link[href]')].map(
        (el) => el.getAttribute('src') ?? el.getAttribute('href'),
      )
      for (const source of sources) expect(source.startsWith('/') && !source.startsWith('//')).toBe(true)
      for (const script of doc.querySelectorAll('script')) expect(script.textContent.trim()).toBe('')
    })
  }

  it('스타일시트가 16px 좌우 여백, 다크 모드, 시스템 글꼴, 확정 색을 쓴다', () => {
    const css = readFileSync(new URL('style.css', PUBLIC_DIR), 'utf8')
    expect(css).toContain('padding: 32px 16px 64px')
    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).toContain('system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif')
    for (const color of ['#3c3489', '#afa9ec', '#e24b4a']) expect(css.toLowerCase()).toContain(color)
    expect(css).not.toMatch(/@import|url\(/)
  })
})

describe('사이트 스크립트 경계', () => {
  const files = readdirSync(SRC_DIR).filter((name) => name.endsWith('.js'))

  it('innerHTML 을 쓰지 않는다', () => {
    for (const name of files) {
      expect(readFileSync(new URL(name, SRC_DIR), 'utf8'), name).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/)
    }
  })

  it('확장 소스를 가져오지 않는다', () => {
    for (const name of files) {
      expect(readFileSync(new URL(name, SRC_DIR), 'utf8'), name).not.toMatch(/extension\/|config\.local/)
    }
  })
})
