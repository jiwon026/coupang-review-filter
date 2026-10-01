import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const fixture = readFileSync(new URL('./fixtures/review-section.html', import.meta.url), 'utf8')

// 가짜 타이머를 쓰는 테스트에서도 DOM 변경 콜백과 Promise 가 돌도록 한 턴을 넘긴다.
async function tick() {
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0)
  else await new Promise((resolve) => setTimeout(resolve, 0))
}

let lastDom = null
let sentMessages = []
let variantCallbacks = []

// variants: 'manual' 이면 응답을 붙잡아 두고 deliver 로 보낸다. 'none' 이면 응답하지 않는다.
// 객체면 그 값으로 즉시(동기) 응답한다.
async function boot(html, { variants = { default_filter: 'off', banner_copy: 'rating' } } = {}) {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'https://www.coupang.com/vp/products/1' })
  lastDom = dom
  sentMessages = []
  variantCallbacks = []
  globalThis.chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message, callback) {
        sentMessages.push(message)
        if (message?.type !== 'crf:get-variant') return undefined
        if (variants === 'manual') variantCallbacks.push(callback)
        else if (variants !== 'none') callback?.({ variants })
        return undefined
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

async function deliver(variants) {
  for (const callback of variantCallbacks) callback({ variants })
  await tick()
}

function banners(doc) {
  return doc.querySelectorAll('[data-crf-banner="1"]')
}

function trackedOfType(eventType) {
  return sentMessages.filter((message) => message?.type === 'crf:track' && message.eventType === eventType)
}

function trackedTypes() {
  return sentMessages.filter((message) => message?.type === 'crf:track').map((message) => message.eventType)
}

const star = '<i class="twc-bg-full-star"></i>'
const ON = { default_filter: 'on', banner_copy: 'rating' }
const OFF = { default_filter: 'off', banner_copy: 'rating' }

function review(id, text, stars = 4) {
  const idNode = id === null ? '' : `<div data-review-id="${id}">도움이 돼요</div>`
  return `<article>${star.repeat(stars)}<div>${text}</div>${idNode}</article>`
}

function sortButtons(active) {
  const cls = (key) => (key === active ? 'twc-font-bold' : 'twc-font-normal')
  return `<button class="${cls('best')}">베스트순</button><button class="${cls('latest')}">최신순</button>`
}

function page(sort, ids) {
  return `${sortButtons(sort)}${ids.map((id) => review(id, `리뷰 ${id}`)).join('')}`
}

async function showPage(doc, sort, ids) {
  doc.querySelector('#sdpReview').innerHTML = page(sort, ids)
  await tick()
}

describe('변형 확정 전 관측(F2)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('리뷰가 이미 있는 채 시작해 on 변형이 늦게 오면 도착 뒤에 filter_state on 으로 1건 보낸다', async () => {
    const doc = await boot(fixture, { variants: 'manual' })
    expect(banners(doc)).toHaveLength(1)
    expect(trackedOfType('Banner Rendered')).toHaveLength(0)

    await deliver(ON)

    const events = trackedOfType('Banner Rendered')
    expect(events).toHaveLength(1)
    expect(events[0].properties.filter_state).toBe('on')
    expect(events[0].properties.pages_seen).toBe(1)
    expect(doc.querySelectorAll('#sdpReview .crf-hidden')).toHaveLength(2)
  })

  it('off 변형이면 filter_state off 로 보낸다', async () => {
    await boot(fixture, { variants: 'manual' })
    await deliver(OFF)

    const events = trackedOfType('Banner Rendered')
    expect(events).toHaveLength(1)
    expect(events[0].properties.filter_state).toBe('off')
  })

  it('응답이 없으면 3초 뒤 기본값으로 확정해 1건 보낸다', async () => {
    vi.useFakeTimers()
    await boot(fixture, { variants: 'none' })
    await vi.advanceTimersByTimeAsync(2999)
    expect(trackedOfType('Banner Rendered')).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    const events = trackedOfType('Banner Rendered')
    expect(events).toHaveLength(1)
    expect(events[0].properties.filter_state).toBe('off')
  })

  it('lastError 와 함께 응답 없이 콜백이 오면 기다리지 않고 기본값으로 확정한다', async () => {
    await boot(fixture, { variants: 'manual' })
    chrome.runtime.lastError = { message: 'Receiving end does not exist.' }
    for (const callback of variantCallbacks) callback(undefined)
    chrome.runtime.lastError = undefined
    await tick()

    const events = trackedOfType('Banner Rendered')
    expect(events).toHaveLength(1)
    expect(events[0].properties.filter_state).toBe('off')
  })

  it('확정 전 토글은 사용자의 선택이 이기고 Filter Toggled 는 확정 뒤 확정된 default_state 로 보낸다', async () => {
    const doc = await boot(fixture, { variants: 'manual' })
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()
    expect(trackedOfType('Filter Toggled')).toHaveLength(0)

    await deliver(ON)

    expect(banners(doc)[0].querySelector('.crf-toggle').getAttribute('aria-pressed')).toBe('false')
    expect(doc.querySelectorAll('#sdpReview .crf-hidden')).toHaveLength(0)
    const toggled = trackedOfType('Filter Toggled')
    expect(toggled.map((event) => event.properties.to_state)).toEqual(['on', 'off'])
    expect(toggled.map((event) => event.properties.default_state)).toEqual(['on', 'on'])
    expect(trackedOfType('Banner Rendered')[0].properties.filter_state).toBe('off')
    expect(trackedTypes()).toEqual(['Banner Rendered', 'Filter Toggled', 'Filter Toggled'])
  })

  it('관측 1건은 응답이 두 번 오거나 대기 시간이 지나도 정확히 한 번만 나간다', async () => {
    vi.useFakeTimers()
    const doc = await boot(fixture, { variants: 'manual' })
    await vi.advanceTimersByTimeAsync(100)
    await deliver(ON)
    await deliver(ON)
    await vi.advanceTimersByTimeAsync(5000)
    doc.body.appendChild(doc.createElement('div'))
    await tick()

    expect(trackedOfType('Banner Rendered')).toHaveLength(1)
  })

  it('대기 시간이 지나 기본값으로 확정된 뒤 늦게 온 변형은 화면도 기록도 바꾸지 않는다', async () => {
    vi.useFakeTimers()
    const doc = await boot(fixture, { variants: 'manual' })
    await vi.advanceTimersByTimeAsync(3000)
    await deliver(ON)

    expect(banners(doc)[0].querySelector('.crf-toggle').getAttribute('aria-pressed')).toBe('false')
    expect(doc.querySelectorAll('#sdpReview .crf-hidden')).toHaveLength(0)
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()
    expect(trackedOfType('Filter Toggled')[0].properties.default_state).toBe('off')
  })

  it('확정 뒤의 새 관측은 그 순간의 필터 상태로 바로 보낸다', async () => {
    const doc = await boot(fixture, { variants: ON })
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()
    await showPage(doc, 'best', ['500', '501'])

    const events = trackedOfType('Banner Rendered')
    expect(events.map((event) => event.properties.filter_state)).toEqual(['on', 'off'])
  })

  it('대기 중에도 pages_seen 은 관측이 생길 때 늘어난다', async () => {
    const doc = await boot(fixture, { variants: 'manual' })
    await showPage(doc, 'best', ['500', '501'])
    expect(trackedOfType('Banner Rendered')).toHaveLength(0)

    await deliver(ON)
    const events = trackedOfType('Banner Rendered')
    expect(events.map((event) => event.properties.pages_seen)).toEqual([1, 2])
    expect(events.map((event) => event.properties.filter_state)).toEqual(['on', 'on'])
  })
})

describe('관측 키와 다시 그리기 키(F3)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('같은 id 리뷰의 글자만 바뀌면 관측은 그대로이고 배너와 요약은 새 판정으로 갱신한다', async () => {
    const doc = await boot(`<div id="sdpReview">${review('8200001', '아직 표기가 안 채워진 리뷰', 5)}</div>`)
    expect(banners(doc)[0].textContent).toContain('체험단 리뷰가 없습니다')

    doc.querySelector('[data-review-id="8200001"]').insertAdjacentHTML(
      'beforebegin',
      '<div>쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.</div>',
    )
    await tick()

    expect(banners(doc)[0].textContent).toContain('체험단 1개')
    const updates = sentMessages.filter((message) => message?.type === 'crf:summary-updated')
    expect(updates[updates.length - 1].summary.sponsoredCount).toBe(1)
    const events = trackedOfType('Banner Rendered')
    expect(events).toHaveLength(1)
    expect(events[0].properties.pages_seen).toBe(1)
  })

  it('도움이 돼요 수나 더보기로 글자 수만 바뀌어도 새 관측이 아니다', async () => {
    const doc = await boot(fixture)
    doc.querySelector('[data-review-id="9001001"]').textContent = '도움이 돼요 12신고하기'
    await tick()
    doc.querySelector('#sdpReview article').insertAdjacentHTML('beforeend', '<div>더보기로 펼친 나머지 본문</div>')
    await tick()

    expect(trackedOfType('Banner Rendered')).toHaveLength(1)
  })

  it('id 가 바뀌면 관측 1건이 생긴다', async () => {
    const doc = await boot(fixture)
    await showPage(doc, 'best', ['8400001'])

    const events = trackedOfType('Banner Rendered')
    expect(events).toHaveLength(2)
    expect(events[1].properties.pages_seen).toBe(2)
  })

  it('안정 id 가 없는 리뷰는 지금처럼 글자 수까지 관측 키로 본다', async () => {
    const doc = await boot(`<div id="sdpReview">${review(null, '아이디 없는 리뷰')}</div>`)
    doc.querySelector('#sdpReview article').insertAdjacentHTML('beforeend', '<div>늦게 붙은 본문</div>')
    await tick()

    expect(trackedOfType('Banner Rendered')).toHaveLength(2)
  })
})

describe('정렬별 첫 페이지(F8)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('정렬을 바꾸면 sort_pages_seen 을 1부터 다시 센다', async () => {
    const doc = await boot(`<div id="sdpReview">${page('best', ['101', '102'])}</div>`)
    await showPage(doc, 'best', ['201', '202'])
    await showPage(doc, 'latest', ['301', '302'])
    await showPage(doc, 'latest', ['401', '402'])

    const events = trackedOfType('Banner Rendered')
    expect(events.map((event) => event.properties.review_sort)).toEqual(['best', 'best', 'latest', 'latest'])
    expect(events.map((event) => event.properties.sort_pages_seen)).toEqual([1, 2, 1, 2])
    expect(events.map((event) => event.properties.pages_seen)).toEqual([1, 2, 3, 4])
  })

  it('page_first_review_id 는 그 페이지 첫 리뷰의 공개 id 다', async () => {
    const doc = await boot(`<div id="sdpReview">${page('best', ['101', '102'])}</div>`)
    await showPage(doc, 'latest', ['301', '302'])

    const events = trackedOfType('Banner Rendered')
    expect(events.map((event) => event.properties.page_first_review_id)).toEqual(['101', '301'])
  })

  it('첫 리뷰가 폴백 id 면 page_first_review_id 는 null 이다', async () => {
    await boot(`<div id="sdpReview">${review(null, '아이디 없는 리뷰')}${review('7', '아이디 있는 리뷰')}</div>`)
    expect(trackedOfType('Banner Rendered')[0].properties.page_first_review_id).toBeNull()
  })

  it('상품이 바뀌면 정렬 카운터도 비운다', async () => {
    const doc = await boot(`<div id="sdpReview">${page('best', ['101'])}</div>`)
    await showPage(doc, 'best', ['201'])

    lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
    await showPage(doc, 'best', ['901'])

    const events = trackedOfType('Banner Rendered')
    expect(events.map((event) => event.properties.sort_pages_seen)).toEqual([1, 2, 1])
  })
})

describe('Purchase Intent Clicked 의 체류 시간(F6)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const buyBox = '<button class="prod-buy-btn"><span class="prod-buy-btn__txt">바로구매</span></button>'

  it('seconds_on_page 는 페이지 체류 시간, seconds_since_render 는 첫 배너 이후 시간이다', async () => {
    const T0 = 1_700_000_000_000
    const now = vi.spyOn(Date, 'now').mockReturnValue(T0)
    const doc = await boot(`${buyBox}${fixture}`)

    now.mockReturnValue(T0 + 12_400)
    vi.spyOn(performance, 'now').mockReturnValue(90_400)
    doc.querySelector('.prod-buy-btn__txt').click()
    await tick()

    const [event] = trackedOfType('Purchase Intent Clicked')
    expect(event.properties.seconds_on_page).toBe(90)
    expect(event.properties.seconds_since_render).toBe(12)
  })

  it('배너 없이 구매를 누르면 seconds_since_render 는 0 이 아니라 null 이다', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(4_600)
    const doc = await boot(`${buyBox}<div>리뷰 없음</div>`)
    doc.querySelector('.prod-buy-btn__txt').click()
    await tick()

    const [event] = trackedOfType('Purchase Intent Clicked')
    expect(event.properties.seconds_since_render).toBeNull()
    expect(event.properties.seconds_on_page).toBe(5)
  })
})
