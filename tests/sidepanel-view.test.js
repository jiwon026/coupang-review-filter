import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderPanel, renderConsent } from '../extension/src/sidepanel/view.js'

const summary = {
  total: 40,
  sponsoredCount: 18,
  organicCount: 22,
  sponsoredRatio: 0.45,
  ratingOfficial: 4.6,
  ratingFiltered: 4.2,
  ratingDelta: -0.4,
}

describe('renderPanel', () => {
  let root

  beforeEach(() => {
    const dom = new JSDOM('<body><main id="root"></main></body>')
    globalThis.document = dom.window.document
    root = dom.window.document.getElementById('root')
  })

  it('체험단 제외 평점과 리뷰 평균을 모두 보여준다', () => {
    renderPanel(root, summary)
    expect(root.textContent).toContain('4.2')
    expect(root.textContent).toContain('4.6')
  })

  it('평점 라벨이 계산 범위를 정확히 말한다', () => {
    renderPanel(root, summary)
    expect(root.textContent).toContain('리뷰 평균')
    expect(root.textContent).not.toContain('쿠팡 표시 평점')
    expect(root.textContent).not.toContain('쿠팡 평점')
  })

  it('체험단 비중과 개수를 보여준다', () => {
    renderPanel(root, summary)
    expect(root.textContent).toContain('45%')
    expect(root.textContent).toContain('40')
    expect(root.textContent).toContain('18')
  })

  it('비중 막대 폭이 비중과 같다', () => {
    renderPanel(root, summary)
    expect(root.querySelector('.bar-fill').style.width).toBe('45%')
  })

  it('누적 범위를 밝힌다', () => {
    renderPanel(root, summary)
    expect(root.textContent).toContain('지금까지 확인한 리뷰 40개 기준입니다')
  })

  it('요약이 없으면 안내 문구를 보여준다', () => {
    renderPanel(root, null)
    expect(root.textContent).toContain('리뷰 영역까지 스크롤')
    expect(root.querySelector('.bar-fill')).toBeNull()
  })

  it('체험단 제외 평점을 못 내면 계산 불가라고 쓴다', () => {
    renderPanel(root, { ...summary, organicCount: 0, ratingFiltered: null, ratingDelta: null })
    expect(root.textContent).toContain('계산 불가')
  })

  it('다시 그리면 이전 내용을 지운다', () => {
    renderPanel(root, summary)
    renderPanel(root, { ...summary, total: 50 })
    expect(root.querySelectorAll('h1')).toHaveLength(1)
    expect(root.textContent).toContain('50')
  })

  it('innerHTML을 쓰지 않는다', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../extension/src/sidepanel/view.js', import.meta.url), 'utf8')
    expect(source).not.toMatch(/innerHTML/)
  })
})

const SAVE_ERROR = '설정을 저장하지 못했습니다. 다시 시도해 주세요.'
const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((button) => button.textContent === text)

describe('renderConsent', () => {
  let container
  let calls

  const render = (options = {}) =>
    renderConsent(container, {
      status: 'granted',
      privacyUrl: null,
      onChange: (status) => calls.push(['change', status]),
      onLearnMore: () => calls.push(['learn']),
      ...options,
    })

  beforeEach(() => {
    const dom = new JSDOM('<body><footer id="consent"></footer></body>')
    globalThis.document = dom.window.document
    container = dom.window.document.getElementById('consent')
    calls = []
  })

  it('granted 이면 보내는 중이라고 말하고 보내지 않기 버튼 하나를 둔다', () => {
    render({ status: 'granted' })
    expect(container.textContent).toContain('익명 사용 통계를 보내고 있습니다')
    expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['보내지 않기'])
  })

  it('denied 이면 보내지 않는다고 말하고 보내기 버튼 하나를 둔다', () => {
    render({ status: 'denied' })
    expect(container.textContent).toContain('익명 사용 통계를 보내지 않습니다')
    expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['보내기'])
  })

  it('undecided 이면 아직 고르지 않았다고 말하고 자세히 보고 고르기 버튼 하나를 둔다', () => {
    render({ status: 'undecided' })
    expect(container.textContent).toContain('익명 사용 통계를 보낼지 아직 고르지 않았습니다')
    expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['자세히 보고 고르기'])
  })

  it('보내지 않기를 누르면 onChange("denied") 만 부른다', () => {
    render({ status: 'granted' })
    buttonByText(container, '보내지 않기').click()
    expect(calls).toEqual([['change', 'denied']])
  })

  it('보내기를 누르면 onChange("granted") 만 부른다', () => {
    render({ status: 'denied' })
    buttonByText(container, '보내기').click()
    expect(calls).toEqual([['change', 'granted']])
  })

  it('자세히 보고 고르기를 누르면 onLearnMore 만 부른다', () => {
    render({ status: 'undecided' })
    buttonByText(container, '자세히 보고 고르기').click()
    expect(calls).toEqual([['learn']])
  })

  it('saveFailed 이면 오류 문구를 alert 로 보이고 버튼은 그대로 둔다', () => {
    render({ status: 'granted', saveFailed: true })
    const alert = container.querySelector('[role="alert"]')
    expect(alert.textContent).toBe(SAVE_ERROR)
    expect(buttonByText(container, '보내지 않기')).toBeTruthy()
  })

  it('saveFailed 가 아니면 오류 문구가 없다', () => {
    render({ status: 'granted' })
    expect(container.textContent).not.toContain(SAVE_ERROR)
  })

  it('처리방침 주소가 있으면 새 탭 링크를, 없으면 링크를 그리지 않는다', () => {
    render({ privacyUrl: 'https://site.test/privacy' })
    const link = container.querySelector('a[href="https://site.test/privacy"]')
    expect(link.textContent).toBe('개인정보 처리방침')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener')

    render({ privacyUrl: null })
    expect(container.querySelector('a')).toBeNull()
  })

  it('다시 그려도 이전 내용이 남지 않는다', () => {
    render({ status: 'granted' })
    render({ status: 'denied' })
    expect(container.querySelectorAll('button')).toHaveLength(1)
    expect(container.textContent).not.toContain('보내고 있습니다')
  })

  it('요약 영역을 건드리지 않는다(별도 컨테이너)', () => {
    const dom = new JSDOM('<body><main id="root"></main><footer id="consent"></footer></body>')
    globalThis.document = dom.window.document
    const root = dom.window.document.getElementById('root')
    const consent = dom.window.document.getElementById('consent')
    renderPanel(root, summary)
    const before = root.textContent
    renderConsent(consent, { status: 'denied', privacyUrl: null, onChange() {}, onLearnMore() {} })
    expect(root.textContent).toBe(before)
  })

  it('엠대시와 가운데 점을 쓰지 않는다', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../extension/src/sidepanel/view.js', import.meta.url), 'utf8')
    const banned = new RegExp(`[${String.fromCharCode(0x2014, 0xb7)}]`)
    expect(source).not.toMatch(banned)
  })
})
