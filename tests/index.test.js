import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const fixture = readFileSync(new URL('./fixtures/review-section.html', import.meta.url), 'utf8')

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

let lastDom = null

async function boot(html) {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'https://www.coupang.com/vp/products/1' })
  lastDom = dom
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.MutationObserver = dom.window.MutationObserver
  vi.resetModules()
  await import('../extension/src/content/index.js')
  await tick()
  return dom.window.document
}

function banners(doc) {
  return doc.querySelectorAll('[data-crf-banner="1"]')
}

describe('content 진입점', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('리뷰 컨테이너 앞에 배너를 하나 넣는다', async () => {
    const doc = await boot(fixture)
    expect(banners(doc)).toHaveLength(1)
    expect(banners(doc)[0].nextElementSibling.id).toBe('sdpReview')
  })

  it('체험단 리뷰에만 배지를 붙인다', async () => {
    const doc = await boot(fixture)
    const badged = doc.querySelectorAll('#sdpReview .crf-badge')
    expect(badged).toHaveLength(2)
  })

  it('배너가 제거되면 다음 변경에서 복구한다', async () => {
    const doc = await boot(fixture)
    banners(doc)[0].remove()
    expect(banners(doc)).toHaveLength(0)

    doc.body.appendChild(doc.createElement('div'))
    await tick()

    expect(banners(doc)).toHaveLength(1)
  })

  it('같은 개수의 다른 리뷰로 교체되면 배너를 갱신한다', async () => {
    const doc = await boot(fixture)
    const before = banners(doc)[0].textContent

    const container = doc.querySelector('#sdpReview')
    container.innerHTML = `
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>다음 페이지의 첫 리뷰입니다</div>
        <div data-review-id="7000001">도움이 돼요</div>
      </article>
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>두 번째 리뷰입니다</div>
        <div data-review-id="7000002">도움이 돼요</div>
      </article>
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>세 번째 리뷰입니다</div>
        <div data-review-id="7000003">도움이 돼요</div>
      </article>
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>네 번째 리뷰입니다</div>
        <div data-review-id="7000004">도움이 돼요</div>
      </article>
      <article>
        <div>별점이 없는 항목입니다</div>
        <div data-review-id="7000005">도움이 돼요</div>
      </article>
    `
    await tick()

    expect(banners(doc)).toHaveLength(1)
    expect(banners(doc)[0].textContent).not.toBe(before)
  })

  it('토글을 눌러도 배너는 하나로 유지된다', async () => {
    const doc = await boot(fixture)
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()
    expect(banners(doc)).toHaveLength(1)
  })

  it('리뷰 컨테이너가 없으면 아무것도 넣지 않는다', async () => {
    const doc = await boot('<div>리뷰 없음</div>')
    expect(banners(doc)).toHaveLength(0)
  })

  it('로드와 렌더를 콘솔로 알린다', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await boot(fixture)
    const messages = spy.mock.calls.map((call) => String(call[0]))
    expect(messages.some((m) => m.includes('콘텐츠 스크립트 로드됨'))).toBe(true)
    expect(messages.some((m) => m.includes('리뷰 4건, 체험단 2건'))).toBe(true)
    spy.mockRestore()
  })

  it('리뷰가 교체되면 총계를 누적한다', async () => {
    const doc = await boot(fixture)
    expect(banners(doc)[0].textContent).toContain('리뷰 4개')

    const container = doc.querySelector('#sdpReview')
    container.innerHTML = `
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>다음 페이지 리뷰입니다</div>
        <div data-review-id="8000001">도움이 돼요</div>
      </article>
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>또 다른 리뷰입니다</div>
        <div data-review-id="8000002">도움이 돼요</div>
      </article>
    `
    await tick()

    expect(banners(doc)[0].textContent).toContain('리뷰 6개')
  })

  it('같은 리뷰가 다시 파싱돼도 총계가 늘지 않는다', async () => {
    const doc = await boot(fixture)
    const container = doc.querySelector('#sdpReview')
    const original = container.innerHTML

    container.innerHTML = `
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>다른 페이지 리뷰입니다</div>
        <div data-review-id="8000001">도움이 돼요</div>
      </article>
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>또 다른 리뷰입니다</div>
        <div data-review-id="8000002">도움이 돼요</div>
      </article>
    `
    await tick()
    expect(banners(doc)[0].textContent).toContain('리뷰 6개')

    container.innerHTML = original
    await tick()

    expect(banners(doc)[0].textContent).toContain('리뷰 6개')
  })

  it('상품이 바뀌면 누적을 비운다', async () => {
    const doc = await boot(fixture)
    expect(banners(doc)[0].textContent).toContain('리뷰 4개')

    lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })

    const container = doc.querySelector('#sdpReview')
    container.innerHTML = `
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>다른 상품의 리뷰입니다</div>
        <div data-review-id="9900001">도움이 돼요</div>
      </article>
    `
    await tick()

    expect(banners(doc)[0].textContent).toContain('리뷰 1개')
    expect(banners(doc)[0].textContent).not.toContain('리뷰 5개')
  })

  it('누적 범위를 문구로 밝힌다', async () => {
    const doc = await boot(fixture)
    expect(banners(doc)[0].textContent).toContain('지금까지 확인한 리뷰')
  })

  it('id 없는 리뷰만 있으면 누적하지 않고 현재 화면만 센다', async () => {
    const article = (label, stars) => `
      <article>
        ${'<i class="twc-bg-full-star"></i>'.repeat(stars)}
        <div>${label}</div>
      </article>`

    const doc = await boot(
      `<div id="sdpReview">${article('1쪽 첫 리뷰', 2)}${article('1쪽 둘째 리뷰', 3)}${article('1쪽 셋째 리뷰', 4)}</div>`,
    )
    expect(banners(doc)[0].textContent).toContain('리뷰 3개')

    doc.querySelector('#sdpReview').innerHTML =
      `${article('2쪽 첫 리뷰', 2)}${article('2쪽 둘째 리뷰', 3)}`
    await tick()

    expect(banners(doc)[0].textContent).toContain('리뷰 2개')
  })

  it('id 있는 리뷰가 섞여 있으면 그것만 누적한다', async () => {
    const doc = await boot(fixture)
    expect(banners(doc)[0].textContent).toContain('리뷰 4개')

    doc.querySelector('#sdpReview').innerHTML = `
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>id 있는 새 리뷰</div>
        <div data-review-id="8100001">도움이 돼요</div>
      </article>
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>id 없는 새 리뷰</div>
      </article>
    `
    await tick()

    expect(banners(doc)[0].textContent).toContain('리뷰 5개')
  })

  it('나중의 더 완전한 파싱이 이전 값을 덮어쓴다', async () => {
    const doc = await boot(`<div id="sdpReview">
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>아직 체험단 표기가 안 채워진 리뷰</div>
        <div data-review-id="8200001">도움이 돼요</div>
      </article>
    </div>`)
    expect(banners(doc)[0].textContent).toContain('체험단 리뷰가 없습니다')

    doc.querySelector('[data-review-id="8200001"]').insertAdjacentHTML(
      'beforebegin',
      '<div>쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.</div>',
    )
    await tick()

    expect(banners(doc)[0].textContent).toContain('체험단 1개')
  })

  it('배지 삽입이 추가 렌더를 유발하지 않는다', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const doc = await boot(fixture)

    const renderLines = () =>
      spy.mock.calls.map((call) => String(call[0])).filter((m) => m.includes('리뷰 ') && m.includes('체험단 '))

    expect(renderLines()).toHaveLength(1)

    doc.querySelector('#sdpReview').innerHTML = `
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>다음 페이지 리뷰입니다</div>
        <div>쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.</div>
        <div data-review-id="8300001">도움이 돼요</div>
      </article>
    `
    await tick()

    expect(renderLines()).toHaveLength(2)
    spy.mockRestore()
  })
})
