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

  it('제목은 화면용 이름 체험단 리뷰 제거기다', () => {
    renderPanel(root, summary)
    expect(root.querySelector('h1').textContent).toBe('체험단 리뷰 제거기')
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
    expect(root.querySelector('.scope').textContent).toBe('지금까지 본 리뷰 40개 기준입니다')
  })

  it('요약에 범위 안내가 있으면 범위 줄에 이어 쓴다', () => {
    renderPanel(root, { ...summary, scopeHint: '스크롤해서 더 보면 숫자가 늘어납니다' })
    expect(root.querySelectorAll('.scope')).toHaveLength(1)
    expect(root.querySelector('.scope').textContent).toBe(
      '지금까지 본 리뷰 40개 기준입니다. 스크롤해서 더 보면 숫자가 늘어납니다',
    )
  })

  it('범위 안내가 문자열이 아니거나 비었으면 앞 문장만 쓴다', () => {
    for (const scopeHint of [undefined, null, 7, true, {}, ['안내'], '']) {
      renderPanel(root, { ...summary, scopeHint })
      expect(root.querySelector('.scope').textContent).toBe('지금까지 본 리뷰 40개 기준입니다')
    }
  })

  it('범위 안내는 60자까지만 받는다', () => {
    renderPanel(root, { ...summary, scopeHint: '가'.repeat(60) })
    expect(root.querySelector('.scope').textContent).toBe(`지금까지 본 리뷰 40개 기준입니다. ${'가'.repeat(60)}`)

    renderPanel(root, { ...summary, scopeHint: '가'.repeat(61) })
    expect(root.querySelector('.scope').textContent).toBe('지금까지 본 리뷰 40개 기준입니다')
  })

  it('범위 안내는 글자로만 넣는다(태그를 만들지 않는다)', () => {
    renderPanel(root, { ...summary, scopeHint: '<b>굵게</b>' })
    expect(root.querySelector('.scope').children).toHaveLength(0)
    expect(root.querySelector('.scope').textContent).toBe('지금까지 본 리뷰 40개 기준입니다. <b>굵게</b>')
  })

  it('요약이 없으면 안내 문구를 보여준다', () => {
    renderPanel(root, null)
    expect(root.textContent).toContain('리뷰 영역까지 스크롤')
    expect(root.querySelector('.empty').textContent).toBe('쿠팡이나 무신사 상품 페이지에서 리뷰 영역까지 스크롤해 주세요.')
    expect(root.children).toHaveLength(1)
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
const DEVICE_ID = '3f2c1a9e-5b7d-4c8a-9e1f-0a2b4c6d8e0f'
const DETAILS = '보내는 내용 보기'
const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((button) => button.textContent === text)
// 동의를 켜고 끄는(또는 고르러 가는) 주 버튼. 보내는 내용 보기 링크와 구분한다.
const actionButtons = (root) => [...root.querySelectorAll('button.consent-action')].map((button) => button.textContent)

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
    expect(actionButtons(container)).toEqual(['보내지 않기'])
  })

  it('denied 이면 보내지 않는다고 말하고 보내기 버튼 하나를 둔다', () => {
    render({ status: 'denied' })
    expect(container.textContent).toContain('익명 사용 통계를 보내지 않습니다')
    expect(actionButtons(container)).toEqual(['보내기'])
  })

  it('undecided 이면 아직 고르지 않았다고 말하고 자세히 보고 고르기 버튼 하나를 둔다', () => {
    render({ status: 'undecided' })
    expect(container.textContent).toContain('익명 사용 통계를 보낼지 아직 고르지 않았습니다')
    expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['자세히 보고 고르기'])
  })

  // 패널의 보내기는 다시 알리지 않고 바로 켠다. 무엇을 보내는지 다시 볼 수 있는 길을 같은 구역에 둔다.
  it.each(['granted', 'denied'])('%s 이면 보내는 내용 보기 링크를 두고, 누르면 onLearnMore 만 부른다', (status) => {
    render({ status })
    const details = buttonByText(container, DETAILS)
    expect(details).toBeTruthy()
    expect(details.getAttribute('type')).toBe('button')
    expect(details.classList.contains('consent-action')).toBe(false)

    details.click()
    expect(calls).toEqual([['learn']])
  })

  it('undecided 에서는 자세히 보고 고르기가 같은 일을 하므로 보내는 내용 보기 링크를 따로 두지 않는다', () => {
    render({ status: 'undecided' })
    expect(buttonByText(container, DETAILS)).toBeUndefined()
  })

  it.each(['granted', 'denied'])('%s 에서 saving 이어도 보내는 내용 보기는 누를 수 있다', (status) => {
    render({ status, saving: true })
    expect(buttonByText(container, DETAILS).disabled).toBe(false)
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

  it.each(['granted', 'denied', 'undecided'])('saving 이면 %s 의 버튼이 disabled 이고 아니면 활성이다', (status) => {
    render({ status, saving: true })
    expect(container.querySelector('button').disabled).toBe(true)
    render({ status, saving: false })
    expect(container.querySelector('button').disabled).toBe(false)
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
    render({ status: 'granted', deviceId: DEVICE_ID })
    render({ status: 'denied' })
    expect(container.querySelectorAll('button.consent-action')).toHaveLength(1)
    expect(container.querySelectorAll('section')).toHaveLength(1)
    expect(container.textContent).not.toContain('보내고 있습니다')
    expect(container.textContent).not.toContain(DEVICE_ID)
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

  // 삭제 요청에 쓰는 익명 기기 번호. 한 번이라도 동의한 사용자에게만 백그라운드가 알려 준다.
  describe('익명 기기 번호', () => {
    it.each(['granted', 'denied'])('deviceId 가 있으면 %s 에서 구역 맨 아래에 번호와 안내를 보여 준다', (status) => {
      render({ status, deviceId: DEVICE_ID, privacyUrl: 'https://site.test/privacy' })
      const section = container.querySelector('section.consent')
      const [device, note] = [...section.children].slice(-2)

      expect(device.className).toBe('consent-device')
      expect(device.textContent).toBe(`익명 기기 번호: ${DEVICE_ID}`)
      expect(note.className).toBe('consent-device-note')
      expect(note.textContent).toBe('통계 삭제를 요청할 때 이 번호를 알려 주세요.')
    })

    it('번호만 따로 선택해 복사할 수 있게 번호만 담은 요소를 둔다', () => {
      render({ status: 'denied', deviceId: DEVICE_ID })
      const id = container.querySelector('.consent-device-id')
      expect(id.textContent).toBe(DEVICE_ID)
      expect(id.children).toHaveLength(0)
    })

    it('스타일시트가 번호를 한 번에 선택되게(user-select: all) 하고 작은 글씨로 둔다', async () => {
      const { readFileSync } = await import('node:fs')
      const css = readFileSync(new URL('../extension/src/sidepanel/style.css', import.meta.url), 'utf8')
      expect(css).toMatch(/\.consent-device-id\s*\{[^}]*user-select:\s*all/)
      expect(css).toMatch(/\.consent-device,\s*\.consent-device-note\s*\{[^}]*font-size:\s*11px/)
    })

    it.each([
      ['없음', undefined],
      ['null', null],
      ['빈 문자열', ''],
      ['문자열이 아님', 12345],
    ])('deviceId 가 %s 이면 번호 줄과 안내가 없다', (_label, deviceId) => {
      render({ status: 'denied', deviceId })
      expect(container.querySelector('.consent-device')).toBeNull()
      expect(container.querySelector('.consent-device-note')).toBeNull()
      expect(container.textContent).not.toContain('익명 기기 번호')
      expect(container.textContent).not.toContain('통계 삭제를 요청할 때')
    })

    it('번호는 textContent 로만 넣는다(마크업으로 해석하지 않는다)', () => {
      render({ status: 'denied', deviceId: '<b>x</b>' })
      const id = container.querySelector('.consent-device-id')
      expect(id.textContent).toBe('<b>x</b>')
      expect(id.children).toHaveLength(0)
    })
  })

  it('엠대시와 가운데 점을 쓰지 않는다', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../extension/src/sidepanel/view.js', import.meta.url), 'utf8')
    const banned = new RegExp(`[${String.fromCharCode(0x2014, 0xb7)}]`)
    expect(source).not.toMatch(banned)
  })
})
