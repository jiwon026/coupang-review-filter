import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { sortButtonsHtml } from './helpers/sort-buttons.js'

const fixture = readFileSync(new URL('./fixtures/review-section.html', import.meta.url), 'utf8')

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// 렌더 예외와 보고 경로의 예외를 심기 위해 두 모듈의 한 함수만 조건부로 던지게 감싼다.
vi.mock('../extension/src/content/filter.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    markSponsored: (...args) => {
      if (globalThis.__crfRenderError) throw globalThis.__crfRenderError
      return actual.markSponsored(...args)
    },
  }
})

vi.mock('../extension/src/content/sort.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    detectSort: (...args) => {
      if (globalThis.__crfDetectSortFails) throw new Error('정렬 판별 실패')
      return actual.detectSort(...args)
    },
  }
})

let lastDom = null
let sentMessages = []
let uncaught = []

async function boot(html) {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'https://www.coupang.com/vp/products/1' })
  lastDom = dom
  sentMessages = []
  uncaught = []
  dom.window.addEventListener('error', (event) => {
    uncaught.push(event.error)
    event.preventDefault()
  })
  globalThis.chrome = {
    runtime: {
      sendMessage(message, callback) {
        sentMessages.push(message)
        if (message?.type === 'crf:get-variant') {
          callback?.({ variants: { default_filter: 'off', banner_copy: 'rating' } })
          return undefined
        }
        // MV3 에서 수신 측이 없으면 동기 예외가 아니라 거부된 Promise 가 돌아온다.
        if (globalThis.__crfSendRejects) {
          return Promise.reject(new Error('Receiving end does not exist.'))
        }
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

function banners(doc) {
  return doc.querySelectorAll('[data-crf-banner="1"]')
}

function errorEvents(errorType) {
  return sentMessages.filter(
    (message) =>
      message?.type === 'crf:track' &&
      message.eventType === 'Extension Error' &&
      (errorType === undefined || message.properties.error_type === errorType),
  )
}

async function touchDom(doc) {
  doc.body.appendChild(doc.createElement('div'))
  await tick()
}

// 스크롤 이벤트 없이 값만 바꾼다(새 페이지가 이미 다른 위치에 있는 상황을 흉내 낸다).
function defineScroll(dom, { scrollY, viewportHeight, documentHeight }) {
  Object.defineProperty(dom.window, 'scrollY', { value: scrollY, configurable: true })
  Object.defineProperty(dom.window, 'innerHeight', { value: viewportHeight, configurable: true })
  Object.defineProperty(dom.window.document.documentElement, 'scrollHeight', {
    value: documentHeight,
    configurable: true,
  })
}

function setScroll(dom, position) {
  defineScroll(dom, position)
  dom.window.dispatchEvent(new dom.window.Event('scroll'))
}

function pagehide(dom) {
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
}

const article = (inner) => `<div id="sdpReview"><article>${inner}</article></div>`
const star = '<i class="twc-bg-full-star"></i>'

describe('렌더 예외 보고', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    globalThis.__crfRenderError = new TypeError('렌더가 깨졌습니다')
    globalThis.__crfDetectSortFails = false
  })

  afterEach(() => {
    delete globalThis.__crfRenderError
    delete globalThis.__crfDetectSortFails
    vi.restoreAllMocks()
  })

  it('렌더 중 예외가 나도 밖으로 던지지 않고 Extension Error 1건을 보낸다', async () => {
    await boot(fixture)
    expect(uncaught).toEqual([])

    const events = errorEvents('RenderException')
    expect(events).toHaveLength(1)
    expect(events[0].properties.error_name).toBe('TypeError')
    expect(events[0].properties.product_id).toBe('1')
  })

  it('렌더 예외 이벤트에 error_message 키가 없고 예외 메시지 원문이 어디에도 실리지 않는다', async () => {
    globalThis.__crfRenderError = new TypeError('리뷰 본문이 섞인 메시지 7590830589')
    await boot(fixture)

    const events = errorEvents('RenderException')
    expect(events).toHaveLength(1)
    expect('error_message' in events[0].properties).toBe(false)
    expect(Object.keys(events[0].properties).sort()).toEqual(['error_name', 'error_type', 'product_id', 'review_sort'])
    expect(JSON.stringify(events[0])).not.toContain('리뷰 본문이 섞인 메시지')
    expect(JSON.stringify(events[0])).not.toContain('7590830589')
  })

  it('DOM 변경으로 렌더가 다시 불려도 던지지 않는다', async () => {
    const doc = await boot(fixture)
    await touchDom(doc)
    await touchDom(doc)
    expect(uncaught).toEqual([])
  })

  it('같은 예외가 MutationObserver 로 여러 번 나도 1건만 보낸다', async () => {
    const doc = await boot(fixture)
    for (let i = 0; i < 5; i += 1) await touchDom(doc)

    expect(errorEvents('RenderException')).toHaveLength(1)
  })

  it('같은 상품 안에서도 다른 예외 종류는 따로 보낸다', async () => {
    const doc = await boot(fixture)
    globalThis.__crfRenderError = new RangeError('다른 예외')
    await touchDom(doc)

    expect(errorEvents('RenderException')).toHaveLength(2)
  })

  it('상품을 바꾼 뒤 같은 예외는 다시 1건 보낸다', async () => {
    const doc = await boot(fixture)
    await touchDom(doc)
    expect(errorEvents('RenderException')).toHaveLength(1)

    lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
    await touchDom(doc)
    await touchDom(doc)

    const events = errorEvents('RenderException')
    expect(events).toHaveLength(2)
    expect(events[1].properties.product_id).toBe('999')
  })

  it('이름이 없는 값을 던져도 기본 이름으로 보내고 error_message 키는 없다', async () => {
    globalThis.__crfRenderError = { toString: () => 'x' }
    await boot(fixture)

    const events = errorEvents('RenderException')
    expect(events).toHaveLength(1)
    expect(events[0].properties.error_name).toBe('Unknown')
    expect('error_message' in events[0].properties).toBe(false)
  })

  it('보고 경로에서 예외가 나도 밖으로 던지지 않고 한 번만 경고한다', async () => {
    globalThis.__crfDetectSortFails = true
    const doc = await boot(fixture)
    await touchDom(doc)
    // 렌더 예외가 걷힌 뒤에도 정렬 판별은 계속 던진다. 보고 경로의 실패가 배너를 막으면 안 된다.
    delete globalThis.__crfRenderError
    await touchDom(doc)

    expect(uncaught).toEqual([])
    expect(banners(doc)).toHaveLength(1)
    const warnings = console.warn.mock.calls.filter((call) =>
      String(call[0]).includes('백그라운드에 메시지를 보내지 못했습니다'),
    )
    expect(warnings).toHaveLength(1)
  })

  it('정렬 판별이 던져도 배너는 1개이고 토글 뒤 다시 그리기도 정상이다', async () => {
    delete globalThis.__crfRenderError
    globalThis.__crfDetectSortFails = true
    const doc = await boot(fixture)
    expect(banners(doc)).toHaveLength(1)

    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    expect(uncaught).toEqual([])
    expect(banners(doc)).toHaveLength(1)
    expect(banners(doc)[0].querySelector('.crf-toggle').getAttribute('aria-pressed')).toBe('true')
    expect(doc.querySelectorAll('#sdpReview .crf-hidden')).toHaveLength(2)
  })

  it('예외가 나도 이후 정상 렌더는 배너를 그린다', async () => {
    const doc = await boot(fixture)
    expect(doc.querySelectorAll('[data-crf-banner="1"]')).toHaveLength(0)

    delete globalThis.__crfRenderError
    await touchDom(doc)

    expect(doc.querySelectorAll('[data-crf-banner="1"]')).toHaveLength(1)
  })

  it('예외가 나는 동안에는 Banner Rendered 를 보내지 않는다', async () => {
    await boot(fixture)
    const rendered = sentMessages.filter(
      (message) => message?.type === 'crf:track' && message.eventType === 'Banner Rendered',
    )
    expect(rendered).toHaveLength(0)
  })
})

describe('sendMessage 가 거부된 Promise 를 돌려줄 때', () => {
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete globalThis.__crfRenderError
    globalThis.__crfDetectSortFails = false
    globalThis.__crfSendRejects = true
    unhandled.length = 0
    process.on('unhandledRejection', onUnhandled)
  })

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled)
    delete globalThis.__crfSendRejects
    delete globalThis.__crfDetectSortFails
    vi.restoreAllMocks()
  })

  const sendWarnings = () =>
    console.warn.mock.calls.filter((call) =>
      String(call[0]).includes('백그라운드에 메시지를 보내지 못했습니다'),
    )

  it('거부돼도 배너를 렌더하고 미처리 거부를 남기지 않으며 경고는 정확히 한 번이다', async () => {
    const doc = await boot(fixture)
    await tick()

    expect(doc.querySelectorAll('[data-crf-banner="1"]')).toHaveLength(1)
    expect(sentMessages.filter((message) => message?.type === 'crf:track').length).toBeGreaterThan(0)
    expect(unhandled).toEqual([])
    expect(sendWarnings()).toHaveLength(1)
  })

  it('이후 렌더에서 다시 거부돼도 추가 경고 없이 렌더를 계속한다', async () => {
    const doc = await boot(fixture)
    await tick()
    expect(sendWarnings()).toHaveLength(1)

    doc.querySelector('#sdpReview').insertAdjacentHTML('beforeend', '<div>변경</div>')
    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    expect(banners(doc)).toHaveLength(1)
    expect(unhandled).toEqual([])
    expect(sendWarnings()).toHaveLength(1)
  })
})

describe('일시 예외 뒤의 관측', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    globalThis.__crfDetectSortFails = false
  })

  afterEach(() => {
    delete globalThis.__crfRenderError
    delete globalThis.__crfDetectSortFails
    vi.restoreAllMocks()
  })

  it('첫 렌더에서 한 번 던지고 다음 렌더가 정상이면 Banner Rendered 정확히 1건, pages_seen 1', async () => {
    globalThis.__crfRenderError = new TypeError('일시 예외')
    const doc = await boot(fixture)
    delete globalThis.__crfRenderError
    await touchDom(doc)
    await touchDom(doc)

    const rendered = sentMessages.filter(
      (message) => message?.type === 'crf:track' && message.eventType === 'Banner Rendered',
    )
    expect(rendered).toHaveLength(1)
    expect(rendered[0].properties.pages_seen).toBe(1)
  })
})

describe('셀렉터 깨짐 신호', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete globalThis.__crfRenderError
    globalThis.__crfDetectSortFails = false
  })

  afterEach(() => {
    delete globalThis.__crfDetectSortFails
    vi.restoreAllMocks()
  })

  describe('ReviewRatingNotFound', () => {
    it('별점이 끝까지 안 붙으면 pagehide 때 최대 item_count 와 함께 1건 보낸다', async () => {
      const doc = await boot(
        '<div id="sdpReview"><article>가</article><article>나</article><article>다</article></div>',
      )
      doc.querySelector('#sdpReview article').remove()
      await touchDom(doc)
      expect(errorEvents('ReviewRatingNotFound')).toHaveLength(0)

      pagehide(lastDom)
      pagehide(lastDom)

      const events = errorEvents('ReviewRatingNotFound')
      expect(events).toHaveLength(1)
      expect(events[0].properties.item_count).toBe(3)
    })

    it('별점이 늦게 붙으면 pagehide 때도 보내지 않는다', async () => {
      const doc = await boot('<div id="sdpReview"><article>가</article></div>')
      expect(errorEvents('ReviewRatingNotFound')).toHaveLength(0)

      doc.querySelector('#sdpReview article').insertAdjacentHTML('afterbegin', star)
      await touchDom(doc)
      pagehide(lastDom)

      expect(errorEvents('ReviewRatingNotFound')).toHaveLength(0)
    })

    it('렌더만으로는(pagehide 없이) 보내지 않는다', async () => {
      const doc = await boot('<div id="sdpReview"><article>가</article></div>')
      await touchDom(doc)
      await touchDom(doc)
      expect(errorEvents('ReviewRatingNotFound')).toHaveLength(0)
    })

    it('정상 리뷰면 보내지 않는다', async () => {
      await boot(fixture)
      pagehide(lastDom)
      expect(errorEvents('ReviewRatingNotFound')).toHaveLength(0)
    })

    it('컨테이너만 있고 리뷰 요소가 없으면 보내지 않는다', async () => {
      await boot('<div id="sdpReview"></div>')
      pagehide(lastDom)
      expect(errorEvents('ReviewRatingNotFound')).toHaveLength(0)
    })

    it('상품이 바뀌면 떠나는 상품의 신호를 전환 시점에 앞 상품 번호로 보내고 새 상품 상태는 깨끗하다', async () => {
      const doc = await boot('<div id="sdpReview"><article>가</article></div>')
      expect(errorEvents('ReviewRatingNotFound')).toHaveLength(0)

      lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
      doc.querySelector('#sdpReview').innerHTML =
        `<article>${star}나<div data-review-id="31">도움</div></article>`
      await touchDom(doc)

      const events = errorEvents('ReviewRatingNotFound')
      expect(events).toHaveLength(1)
      expect(events[0].properties.product_id).toBe('1')

      pagehide(lastDom)
      expect(errorEvents()).toHaveLength(1)
    })

    it('상품이 바뀌어도 앞 상품이 정상이었으면 아무것도 보내지 않는다', async () => {
      const doc = await boot(fixture)
      lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
      await touchDom(doc)
      expect(errorEvents()).toHaveLength(0)
    })
  })

  describe('ReviewIdNotFound', () => {
    it('id 노드가 끝까지 없으면 pagehide 때 최대 review_count 와 함께 1건 보낸다', async () => {
      const doc = await boot(
        `<div id="sdpReview"><article>${star}가</article><article>${star}나</article></div>`,
      )
      await touchDom(doc)
      expect(errorEvents('ReviewIdNotFound')).toHaveLength(0)

      pagehide(lastDom)
      pagehide(lastDom)

      const events = errorEvents('ReviewIdNotFound')
      expect(events).toHaveLength(1)
      expect(events[0].properties.review_count).toBe(2)
    })

    it('id 노드가 늦게 붙으면 pagehide 때도 보내지 않는다', async () => {
      const doc = await boot(`<div id="sdpReview"><article>${star}가</article></div>`)
      doc
        .querySelector('#sdpReview article')
        .insertAdjacentHTML('beforeend', '<div data-review-id="11">도움</div>')
      await touchDom(doc)
      pagehide(lastDom)

      expect(errorEvents('ReviewIdNotFound')).toHaveLength(0)
    })

    it('id 가 한 번 보였다가 사라져도 보내지 않는다(마지막 렌더가 아니라 누적으로 판정)', async () => {
      const doc = await boot(
        `<div id="sdpReview"><article>${star}가<div data-review-id="11">도움</div></article></div>`,
      )
      doc.querySelector('#sdpReview').innerHTML = `<article>${star}로딩 중</article>`
      await touchDom(doc)
      pagehide(lastDom)

      expect(errorEvents('ReviewIdNotFound')).toHaveLength(0)
    })

    it('렌더만으로는(pagehide 없이) 보내지 않는다', async () => {
      const doc = await boot(`<div id="sdpReview"><article>${star}가</article></div>`)
      await touchDom(doc)
      expect(errorEvents('ReviewIdNotFound')).toHaveLength(0)
    })

    it('일부만 id 가 없으면 보내지 않는다', async () => {
      await boot(
        `<div id="sdpReview">
          <article>${star}가<div data-review-id="11">도움</div></article>
          <article>${star}나</article>
        </div>`,
      )
      pagehide(lastDom)
      expect(errorEvents('ReviewIdNotFound')).toHaveLength(0)
    })

    it('모두 id 가 있는 정상 리뷰면 보내지 않는다', async () => {
      await boot(fixture)
      pagehide(lastDom)
      expect(errorEvents('ReviewIdNotFound')).toHaveLength(0)
    })

    it('별점도 없어 파싱된 리뷰가 없으면 IdNotFound 가 아니라 RatingNotFound 만 보낸다', async () => {
      await boot('<div id="sdpReview"><article>가</article></div>')
      pagehide(lastDom)
      expect(errorEvents('ReviewIdNotFound')).toHaveLength(0)
      expect(errorEvents('ReviewRatingNotFound')).toHaveLength(1)
    })

    it('상품이 바뀌면 떠나는 상품의 신호를 전환 시점에 보낸다', async () => {
      const doc = await boot(`<div id="sdpReview"><article>${star}가</article></div>`)
      lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
      doc.querySelector('#sdpReview').innerHTML =
        `<article>${star}나<div data-review-id="31">도움</div></article>`
      await touchDom(doc)

      const events = errorEvents('ReviewIdNotFound')
      expect(events).toHaveLength(1)
      expect(events[0].properties.product_id).toBe('1')
      pagehide(lastDom)
      expect(errorEvents()).toHaveLength(1)
    })

    it('상품 전환 때 보내는 신호는 새 페이지가 아니라 떠나는 상품의 마지막 관측 정렬을 싣는다', async () => {
      const buttons = sortButtonsHtml
      const doc = await boot(`<div id="sdpReview">${buttons('latest')}<article>${star}가</article></div>`)

      lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
      doc.querySelector('#sdpReview').innerHTML =
        `${buttons('best')}<article>${star}나<div data-review-id="31">도움</div></article>`
      await touchDom(doc)

      const [event] = errorEvents('ReviewIdNotFound')
      expect(event.properties.product_id).toBe('1')
      expect(event.properties.review_sort).toBe('latest')
    })
  })

  it('떠나는 상품에 관측이 없었으면 상품 전환 신호의 review_sort 는 unknown 이다', async () => {
    const doc = await boot('<div id="sdpReview"><article>가</article></div>')
    lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
    doc.querySelector('#sdpReview').innerHTML =
      `${sortButtonsHtml('best')}<article>${star}나<div data-review-id="31">도움</div></article>`
    await touchDom(doc)

    const [event] = errorEvents('ReviewRatingNotFound')
    expect(event.properties.product_id).toBe('1')
    expect(event.properties.review_sort).toBe('unknown')
  })

  it('앞앞 상품의 정렬이 관측 없는 다음 상품의 신호로 새지 않는다', async () => {
    const doc = await boot(
      `<div id="sdpReview">${sortButtonsHtml('latest')}` +
        `<article>${star}가<div data-review-id="11">도움</div></article></div>`,
    )
    lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/2' })
    doc.querySelector('#sdpReview').innerHTML = '<article>별점 없음</article>'
    await touchDom(doc)
    lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/3' })
    doc.querySelector('#sdpReview').innerHTML = `<article>${star}다<div data-review-id="31">도움</div></article>`
    await touchDom(doc)

    const [event] = errorEvents('ReviewRatingNotFound')
    expect(event.properties.product_id).toBe('2')
    expect(event.properties.review_sort).toBe('unknown')
  })

  describe('ReviewContainerNotFound', () => {
    it('컨테이너가 없고 70% 까지 스크롤한 뒤 pagehide 가 오면 1건 보낸다', async () => {
      const doc = await boot('<div>리뷰 없음</div>')
      setScroll(lastDom, { scrollY: 630, viewportHeight: 100, documentHeight: 1000 })
      await touchDom(doc)
      expect(errorEvents('ReviewContainerNotFound')).toHaveLength(0)

      pagehide(lastDom)

      const events = errorEvents('ReviewContainerNotFound')
      expect(events).toHaveLength(1)
      expect(events[0].properties.max_scroll_ratio).toBe(0.7)
      expect(events[0].properties.product_id).toBe('1')
    })

    it('30% 까지만 스크롤했으면 보내지 않는다', async () => {
      await boot('<div>리뷰 없음</div>')
      setScroll(lastDom, { scrollY: 270, viewportHeight: 100, documentHeight: 1000 })
      pagehide(lastDom)

      expect(errorEvents('ReviewContainerNotFound')).toHaveLength(0)
    })

    it('컨테이너를 한 번이라도 찾았으면 보내지 않는다', async () => {
      const doc = await boot(fixture)
      setScroll(lastDom, { scrollY: 630, viewportHeight: 100, documentHeight: 1000 })
      doc.querySelector('#sdpReview').remove()
      await touchDom(doc)
      pagehide(lastDom)

      expect(errorEvents('ReviewContainerNotFound')).toHaveLength(0)
    })

    it('한 번 내려갔다 올라와도 최대 위치로 판정한다', async () => {
      await boot('<div>리뷰 없음</div>')
      setScroll(lastDom, { scrollY: 900, viewportHeight: 100, documentHeight: 1000 })
      setScroll(lastDom, { scrollY: 0, viewportHeight: 100, documentHeight: 1000 })
      pagehide(lastDom)

      const events = errorEvents('ReviewContainerNotFound')
      expect(events).toHaveLength(1)
      expect(events[0].properties.max_scroll_ratio).toBe(1)
    })

    it('pagehide 가 여러 번 와도 1건만 보낸다', async () => {
      await boot('<div>리뷰 없음</div>')
      setScroll(lastDom, { scrollY: 630, viewportHeight: 100, documentHeight: 1000 })
      pagehide(lastDom)
      pagehide(lastDom)

      expect(errorEvents('ReviewContainerNotFound')).toHaveLength(1)
    })

    it('pagehide 는 스크롤 이벤트 없이 바뀐 마지막 위치도 반영한다', async () => {
      await boot('<div>리뷰 없음</div>')
      defineScroll(lastDom, { scrollY: 630, viewportHeight: 100, documentHeight: 1000 })
      pagehide(lastDom)

      const events = errorEvents('ReviewContainerNotFound')
      expect(events).toHaveLength(1)
      expect(events[0].properties.max_scroll_ratio).toBe(0.7)
    })

    it('상품 전환 순간의 새 페이지 scrollY 가 커도 떠나는 상품은 누적 스크롤로만 판정한다', async () => {
      const doc = await boot('<div>리뷰 없음</div>')
      setScroll(lastDom, { scrollY: 270, viewportHeight: 100, documentHeight: 1000 })

      lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
      defineScroll(lastDom, { scrollY: 900, viewportHeight: 100, documentHeight: 1000 })
      await touchDom(doc)

      expect(errorEvents('ReviewContainerNotFound')).toHaveLength(0)
    })

    it('상품 전환 시 떠나는 상품의 누적 스크롤이 기준을 넘었으면 앞 상품 번호로 보낸다', async () => {
      const doc = await boot('<div>리뷰 없음</div>')
      setScroll(lastDom, { scrollY: 630, viewportHeight: 100, documentHeight: 1000 })

      lastDom.reconfigure({ url: 'https://www.coupang.com/vp/products/999' })
      defineScroll(lastDom, { scrollY: 0, viewportHeight: 100, documentHeight: 1000 })
      await touchDom(doc)

      const events = errorEvents('ReviewContainerNotFound')
      expect(events).toHaveLength(1)
      expect(events[0].properties.product_id).toBe('1')
      expect(events[0].properties.max_scroll_ratio).toBe(0.7)
    })

    it('문서가 짧아도 스크롤하지 않았으면 보내지 않는다', async () => {
      await boot('<div>리뷰 없음</div>')
      setScroll(lastDom, { scrollY: 0, viewportHeight: 800, documentHeight: 1000 })
      pagehide(lastDom)
      expect(errorEvents('ReviewContainerNotFound')).toHaveLength(0)
    })
  })

  describe('정상 페이지', () => {
    it('정상 리뷰 페이지는 Extension Error 를 하나도 보내지 않는다', async () => {
      const doc = await boot(fixture)
      await touchDom(doc)
      setScroll(lastDom, { scrollY: 900, viewportHeight: 100, documentHeight: 1000 })
      pagehide(lastDom)

      expect(errorEvents()).toHaveLength(0)
    })
  })
})
