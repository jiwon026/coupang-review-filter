import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

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

function setScroll(dom, { scrollY, viewportHeight, documentHeight }) {
  Object.defineProperty(dom.window, 'scrollY', { value: scrollY, configurable: true })
  Object.defineProperty(dom.window, 'innerHeight', { value: viewportHeight, configurable: true })
  Object.defineProperty(dom.window.document.documentElement, 'scrollHeight', {
    value: documentHeight,
    configurable: true,
  })
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
    expect(events[0].properties.error_message).toBe('렌더가 깨졌습니다')
    expect(events[0].properties.product_id).toBe('1')
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

  it('error_message 는 120자를 넘지 않는다', async () => {
    globalThis.__crfRenderError = new Error('가'.repeat(500))
    await boot(fixture)

    const events = errorEvents('RenderException')
    expect(events).toHaveLength(1)
    expect(events[0].properties.error_message).toHaveLength(120)
  })

  it('이름이나 메시지가 없는 값을 던져도 기본값으로 보낸다', async () => {
    globalThis.__crfRenderError = { toString: () => 'x' }
    await boot(fixture)

    const events = errorEvents('RenderException')
    expect(events).toHaveLength(1)
    expect(events[0].properties.error_name).toBe('Unknown')
    expect(events[0].properties.error_message).toBe('')
  })

  it('보고 경로에서 예외가 나도 밖으로 던지지 않고 한 번만 경고한다', async () => {
    globalThis.__crfDetectSortFails = true
    const doc = await boot(fixture)
    await touchDom(doc)

    expect(uncaught).toEqual([])
    const warnings = console.warn.mock.calls.filter((call) =>
      String(call[0]).includes('이벤트를 백그라운드로 보내지 못했습니다'),
    )
    expect(warnings).toHaveLength(1)
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
