import { describe, it, expect, beforeEach, vi, onTestFinished } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const fixture = readFileSync(new URL('./fixtures/review-section.html', import.meta.url), 'utf8')

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

let lastDom = null
let sentMessages = []

async function boot(html, { variants = { default_filter: 'off', banner_copy: 'rating' } } = {}) {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'https://www.coupang.com/vp/products/1' })
  lastDom = dom
  sentMessages = []
  globalThis.chrome = {
    runtime: {
      sendMessage(message, callback) {
        sentMessages.push(message)
        if (message?.type === 'crf:get-variant') {
          callback?.({ variants })
        }
      },
    },
  }
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

function trackedEvents() {
  return sentMessages.filter((message) => message?.type === 'crf:track')
}

function trackedOfType(eventType) {
  return trackedEvents().filter((message) => message.eventType === eventType)
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

  it('로드와 렌더를 콘솔로 알린다(디버그 빌드)', async () => {
    vi.stubGlobal('__CRF_DEBUG__', true)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await boot(fixture)
    const messages = spy.mock.calls.map((call) => String(call[0]))
    expect(messages.some((m) => m.includes('콘텐츠 스크립트 로드됨'))).toBe(true)
    expect(messages.some((m) => m.includes('리뷰 4건, 체험단 2건'))).toBe(true)
    spy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('운영 빌드(__CRF_DEBUG__ 가 false)에서는 로드와 렌더를 콘솔로 알리지 않는다', async () => {
    vi.stubGlobal('__CRF_DEBUG__', false)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await boot(fixture)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    vi.unstubAllGlobals()
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
    vi.stubGlobal('__CRF_DEBUG__', true)
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
    vi.unstubAllGlobals()
  })

  it('첫 렌더에서 Banner Rendered를 보낸다', async () => {
    await boot(fixture)
    const events = trackedOfType('Banner Rendered')
    expect(events).toHaveLength(1)
    expect(events[0].properties.review_count).toBe(4)
    expect(events[0].properties.sponsored_count).toBe(2)
    expect(events[0].properties.page_review_count).toBe(4)
    expect(events[0].properties.page_sponsored_count).toBe(2)
    expect(events[0].properties.pages_seen).toBe(1)
  })

  it('리뷰 묶음이 바뀌면 Banner Rendered를 다시 보내고 pages_seen이 증가한다', async () => {
    const doc = await boot(fixture)

    doc.querySelector('#sdpReview').innerHTML = `
      <article>
        <i class="twc-bg-full-star"></i>
        <i class="twc-bg-full-star"></i>
        <div>다음 페이지 리뷰입니다</div>
        <div data-review-id="8400001">도움이 돼요</div>
      </article>
    `
    await tick()

    const events = trackedOfType('Banner Rendered')
    expect(events).toHaveLength(2)
    expect(events[1].properties.pages_seen).toBe(2)
    expect(events[1].properties.review_count).toBe(5)
    expect(events[1].properties.page_review_count).toBe(1)
  })

  it('토글하면 Filter Toggled를 보낸다', async () => {
    const doc = await boot(fixture)
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    const events = trackedOfType('Filter Toggled')
    expect(events).toHaveLength(1)
    expect(events[0].properties.to_state).toBe('on')
    expect(events[0].properties.default_state).toBe('off')
  })

  it('변형 응답이 없어도 배너를 렌더한다', async () => {
    // 응답 대기 타이머가 테스트가 끝난 뒤 다른 테스트의 chrome 모의로 이벤트를 보내지 않게 가짜 타이머로 가둔다.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    onTestFinished(() => vi.useRealTimers())
    const dom = new JSDOM(`<body>${fixture}</body>`, {
      url: 'https://www.coupang.com/vp/products/1',
    })
    sentMessages = []
    globalThis.chrome = {
      runtime: {
        sendMessage(message) {
          sentMessages.push(message)
          // 콜백을 부르지 않는다. 응답 유실 상황
        },
      },
    }
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.MutationObserver = dom.window.MutationObserver
    vi.resetModules()
    await import('../extension/src/content/index.js')
    await vi.advanceTimersByTimeAsync(0)

    expect(dom.window.document.querySelectorAll('[data-crf-banner="1"]')).toHaveLength(1)
  })

  it('sendMessage가 던져도 배너를 렌더한다', async () => {
    const dom = new JSDOM(`<body>${fixture}</body>`, {
      url: 'https://www.coupang.com/vp/products/1',
    })
    globalThis.chrome = {
      runtime: {
        sendMessage() {
          throw new Error('Extension context invalidated.')
        },
      },
    }
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.MutationObserver = dom.window.MutationObserver
    vi.resetModules()
    await import('../extension/src/content/index.js')
    await tick()

    expect(dom.window.document.querySelectorAll('[data-crf-banner="1"]')).toHaveLength(1)
  })

  it('콘텐츠 이벤트에 현재 상품 번호를 product_id 로 싣는다', async () => {
    const doc = await boot(fixture)
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    const events = trackedEvents()
    expect(events.length).toBeGreaterThanOrEqual(2)
    for (const event of events) {
      expect(event.properties.product_id).toBe('1')
    }
  })

  it('상품이 바뀐 뒤 보낸 이벤트는 새 상품 번호를 싣는다', async () => {
    const doc = await boot(fixture)
    expect(trackedOfType('Banner Rendered')[0].properties.product_id).toBe('1')

    lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    expect(trackedOfType('Filter Toggled')[0].properties.product_id).toBe('999')
  })

  it('상품 페이지가 아니면 product_id 는 null 이다', async () => {
    const doc = await boot(fixture)
    lastDom.reconfigure({ url: 'https://www.coupang.com/np/search?q=a' })
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    const toggled = trackedOfType('Filter Toggled')[0]
    expect('product_id' in toggled.properties).toBe(true)
    expect(toggled.properties.product_id).toBeNull()
  })

  it('토글은 관측 지표를 늘리지 않는다', async () => {
    const doc = await boot(fixture)
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    expect(trackedOfType('Banner Rendered')).toHaveLength(1)
    expect(trackedOfType('Filter Toggled')).toHaveLength(2)
    expect(trackedOfType('Filter Toggled')[1].properties.pages_seen).toBe(1)
  })

  it('default_filter on 변형이 도착하면 필터를 켜되 관측은 늘리지 않는다', async () => {
    const doc = await boot(fixture, { variants: { default_filter: 'on', banner_copy: 'rating' } })

    expect(banners(doc)[0].querySelector('.crf-toggle').getAttribute('aria-pressed')).toBe('true')
    expect(doc.querySelectorAll('#sdpReview .crf-hidden')).toHaveLength(2)
    expect(trackedOfType('Banner Rendered')).toHaveLength(1)
    expect(trackedOfType('Banner Rendered')[0].properties.pages_seen).toBe(1)
  })

  it('banner_copy ratio 변형이 도착하면 문구를 바꾸되 관측은 늘리지 않는다', async () => {
    const doc = await boot(fixture, { variants: { default_filter: 'off', banner_copy: 'ratio' } })

    expect(banners(doc)[0].textContent).toContain('지금까지 본 리뷰의')
    expect(trackedOfType('Banner Rendered')).toHaveLength(1)
  })

  it('배너 복구는 관측 지표를 늘리지 않는다', async () => {
    const doc = await boot(fixture)
    banners(doc)[0].remove()
    doc.body.appendChild(doc.createElement('div'))
    await tick()

    expect(banners(doc)).toHaveLength(1)
    expect(trackedOfType('Banner Rendered')).toHaveLength(1)
  })

  it('모든 이벤트에 현재 정렬을 싣는다', async () => {
    const withSort = fixture.replace(
      '<div class="sdp-review twc-pb-[24px]">',
      `<button class="twc-font-bold">베스트순</button>
       <button class="twc-font-normal">최신순</button>
       <div class="sdp-review twc-pb-[24px]">`,
    )
    const doc = await boot(withSort)
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    const events = trackedEvents()
    expect(events.length).toBeGreaterThanOrEqual(2)
    for (const event of events) {
      expect(event.properties.review_sort).toBe('best')
    }
  })

  it('구매 버튼을 누르면 본 리뷰 요약과 함께 Purchase Intent Clicked를 보낸다', async () => {
    const withBuyBox = `
      <button class="prod-cart-btn">장바구니 담기</button>
      <button class="prod-buy-btn"><span class="prod-buy-btn__txt">바로구매</span></button>
      ${fixture}`
    const doc = await boot(withBuyBox)
    doc.querySelector('.prod-buy-btn__txt').click()
    await tick()

    const events = trackedOfType('Purchase Intent Clicked')
    expect(events).toHaveLength(1)
    expect(events[0].properties.intent_kind).toBe('buy_now')
    expect(events[0].properties.review_count).toBe(4)
    expect(events[0].properties.pages_seen).toBe(1)
    expect(events[0].properties.filter_state).toBe('off')
  })

  it('구매 버튼 클릭이 관측 지표를 늘리지 않는다', async () => {
    const withBuyBox = `<button class="prod-cart-btn">장바구니 담기</button>${fixture}`
    const doc = await boot(withBuyBox)
    doc.querySelector('.prod-cart-btn').click()
    await tick()

    expect(trackedOfType('Banner Rendered')).toHaveLength(1)
  })

  it('렌더할 때마다 요약을 백그라운드로 보낸다', async () => {
    await boot(fixture)
    const updates = sentMessages.filter((message) => message?.type === 'crf:summary-updated')
    expect(updates.length).toBeGreaterThanOrEqual(1)
    expect(updates[updates.length - 1].summary.total).toBe(4)
  })

  it('자세히 보기는 패널 열기를 요청하고 관측을 늘리지 않는다', async () => {
    const doc = await boot(fixture)
    banners(doc)[0].querySelector('.crf-detail').click()
    await tick()

    const opens = sentMessages.filter((message) => message?.type === 'crf:open-panel')
    expect(opens).toHaveLength(1)
    expect(trackedOfType('Banner Rendered')).toHaveLength(1)
  })

  it('토글해도 패널에 최신 요약이 간다', async () => {
    const doc = await boot(fixture)
    const before = sentMessages.filter((message) => message?.type === 'crf:summary-updated').length
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()
    const after = sentMessages.filter((message) => message?.type === 'crf:summary-updated').length
    expect(after).toBeGreaterThan(before)
  })
})
