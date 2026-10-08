import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const musinsaFixture = readFileSync(
  new URL('./fixtures/musinsa-review-section.html', import.meta.url),
  'utf8',
)
const coupangFixture = readFileSync(new URL('./fixtures/review-section.html', import.meta.url), 'utf8')
const css = readFileSync(new URL('../extension/src/content/content.css', import.meta.url), 'utf8')

const PRODUCT_URL = 'https://www.musinsa.com/products/4633343'
const REVIEW_URL = 'https://www.musinsa.com/review/goods/4633343'
const COUPANG_URL = 'https://www.coupang.com/vp/products/1'

const CONTAINER = '[class*="GoodsReviewListSection__Container"]'
const LIST = '[class*="GoodsReviewStaticList__Container"]'
const SPONSORED_FILTER = '[data-filter-value="체험단"]'
const NOTICE = '이 후기는 제품을 무상으로 제공받아 직접 사용해 본 후 작성되었습니다.'
const NOTE = '체험단 후기만 모아 보는 중입니다'
const UNKNOWN_NOTE = '무신사 화면이 바뀌어 지금은 숨기기를 쓸 수 없습니다'

const ON = { default_filter: 'on', banner_copy: 'rating' }
const OFF = { default_filter: 'off', banner_copy: 'rating' }

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const EXTENSION_ID = 'test-extension-id'

let lastDom = null
let sentMessages = []
// 콘텐츠 스크립트가 chrome.runtime.onMessage 에 붙인 리스너.
let messageListeners = []
// 콘텐츠 스크립트가 MutationObserver.observe 에 넘긴 옵션.
let observeOptions = []

// 콘텐츠 스크립트는 불러올 때의 호스트로 쇼핑몰을 정한다. 그래서 주소를 먼저 정하고 모듈을 새로 부른다.
async function boot(html, { url = PRODUCT_URL, variants = OFF } = {}) {
  const dom = new JSDOM(`<body>${html}</body>`, { url })
  lastDom = dom
  sentMessages = []
  messageListeners = []
  globalThis.chrome = {
    runtime: {
      id: EXTENSION_ID,
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      sendMessage(message, callback) {
        sentMessages.push(message)
        if (message?.type === 'crf:get-variant') callback?.({ variants })
        return undefined
      },
    },
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.MutationObserver = dom.window.MutationObserver
  observeOptions = []
  const observe = dom.window.MutationObserver.prototype.observe
  dom.window.MutationObserver.prototype.observe = function (target, options) {
    observeOptions.push(options)
    return observe.call(this, target, options)
  }
  vi.resetModules()
  await import('../extension/src/content/index.js')
  await tick()
  return dom.window.document
}

function banners(doc) {
  return doc.querySelectorAll('[data-crf-banner="1"]')
}

function tracked() {
  return sentMessages.filter((message) => message?.type === 'crf:track')
}

function trackedOfType(eventType) {
  return tracked().filter((message) => message.eventType === eventType)
}

function summaries() {
  return sentMessages.filter((message) => message?.type === 'crf:summary-updated')
}

// 사이드 패널이 chrome.tabs.sendMessage 로 보낸 것처럼 콘텐츠 스크립트의 리스너를 부른다.
// 리스너가 돌려준 값과 응답 함수를 부른 횟수를 돌려준다.
async function deliver(message, sender = { id: EXTENSION_ID }) {
  let responses = 0
  const returned = messageListeners.map((listener) =>
    listener(message, sender, () => {
      responses += 1
    }),
  )
  await tick()
  return { returned, responses }
}

const setFilter = (hidden, sender) => deliver({ type: 'crf:set-filter', hidden }, sender)

function card(id, { sponsored = false, rating = '5' } = {}) {
  const label = sponsored
    ? `<div class="ExperienceLabelInfo__Wrapper-sc-mno345-0 pOiUy"><span>체험단</span><span>${NOTICE}</span></div>`
    : ''
  return (
    `<div data-section-name="review" data-content-id="${id}">` +
    `<span class="StarsScore__Container-sc-jkl012-0 zXcVb">${rating}</span>${label}<p>본문</p></div>`
  )
}

// 화면의 카드를 통째로 바꾼다. 무신사가 탭을 바꾸거나 목록을 이어 그릴 때와 같다.
async function showCards(doc, cards) {
  doc.querySelector(LIST).innerHTML = cards.join('')
  await tick()
}

async function touchDom(doc) {
  doc.body.appendChild(doc.createElement('div'))
  await tick()
}

async function setSponsoredOnly(doc, selected) {
  doc.querySelector(SPONSORED_FILTER).className = selected
    ? 'border border-black'
    : 'border border-gray-300'
  await touchDom(doc)
}

// 주소와 화면만 바뀌는 이동. 새로 불러오지 않는다.
async function moveTo(doc, pathname) {
  lastDom.window.history.pushState({}, '', pathname)
  await touchDom(doc)
}

function sponsoredCard(doc) {
  return doc.querySelector('[data-content-id="90000001"]')
}

describe('무신사에서의 콘텐츠 스크립트', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.doUnmock('../extension/src/content/sites/musinsa.js')
    vi.restoreAllMocks()
  })

  describe('그리기', () => {
    it('배너가 후기 구역 바로 앞에 한 번 들어간다', async () => {
      const doc = await boot(musinsaFixture)

      expect(banners(doc)).toHaveLength(1)
      expect(banners(doc)[0].nextElementSibling).toBe(doc.querySelector(CONTAINER))

      await touchDom(doc)
      expect(banners(doc)).toHaveLength(1)
    })

    it('체험단 카드에만 배지가 붙는다', async () => {
      const doc = await boot(musinsaFixture)

      expect(doc.querySelectorAll('.crf-badge')).toHaveLength(1)
      expect(sponsoredCard(doc).querySelector('.crf-badge')).not.toBeNull()
    })

    it('숨김 버튼을 누르면 체험단 카드만 접고 다시 누르면 편다', async () => {
      const doc = await boot(musinsaFixture)

      banners(doc)[0].querySelector('.crf-toggle').click()
      await tick()
      expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(1)
      expect(doc.querySelectorAll('.crf-hidden')).toHaveLength(0)

      banners(doc)[0].querySelector('.crf-toggle').click()
      await tick()
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
      expect(doc.querySelectorAll('.crf-hidden')).toHaveLength(0)
    })

    it('후기 전체보기 주소에서도 같은 상품 번호로 동작한다', async () => {
      const doc = await boot(musinsaFixture, { url: REVIEW_URL })

      expect(banners(doc)).toHaveLength(1)
      expect(doc.querySelectorAll('.crf-badge')).toHaveLength(1)
      const rendered = trackedOfType('Banner Rendered')
      expect(rendered).toHaveLength(1)
      expect(rendered[0].properties.product_id).toBe('musinsa:4633343')
      expect(rendered[0].properties.site).toBe('musinsa')
    })
  })

  describe('범위 안내', () => {
    const scopes = (doc) =>
      [...banners(doc)[0].querySelectorAll('.crf-scope')].map((node) => node.textContent)

    it('상품 페이지의 범위 줄은 후기 전체보기로 가라고 알리고 요약에도 같은 안내가 실린다', async () => {
      const doc = await boot(musinsaFixture)

      expect(scopes(doc)).toEqual(['지금까지 본 리뷰 3개 기준입니다. 후기 전체보기에서 더 보면 숫자가 늘어납니다'])
      expect(summaries().at(-1).summary.scopeHint).toBe('후기 전체보기에서 더 보면 숫자가 늘어납니다')
    })

    it('후기 전체보기의 범위 줄은 스크롤하라고 알리고 요약에도 같은 안내가 실린다', async () => {
      const doc = await boot(musinsaFixture, { url: REVIEW_URL })

      expect(scopes(doc)).toEqual(['지금까지 본 리뷰 3개 기준입니다. 스크롤해서 더 보면 숫자가 늘어납니다'])
      expect(summaries().at(-1).summary.scopeHint).toBe('스크롤해서 더 보면 숫자가 늘어납니다')
    })

    it('체험단이 없는 상품에서는 헤드라인 아래에 안내만 보인다', async () => {
      const doc = await boot(musinsaFixture.replace(NOTICE, '안내'))

      expect(banners(doc)[0].querySelector('.crf-headline').textContent).toBe(
        '지금까지 본 리뷰 3개 중 체험단 리뷰가 없습니다',
      )
      expect(scopes(doc)).toEqual(['후기 전체보기에서 더 보면 숫자가 늘어납니다'])
    })

    // 조건 보기에서는 누적하지 않으므로 더 봐도 숫자가 늘지 않는다.
    it('조건 보기에서는 범위 줄에 앞 문장만 쓰고 요약에 안내를 싣지 않는다', async () => {
      const doc = await boot(musinsaFixture)
      await setSponsoredOnly(doc, true)

      expect(scopes(doc)).toEqual(['지금까지 본 리뷰 3개 기준입니다'])
      expect('scopeHint' in summaries().at(-1).summary).toBe(false)

      await setSponsoredOnly(doc, false)
      expect(scopes(doc)).toEqual(['지금까지 본 리뷰 3개 기준입니다. 후기 전체보기에서 더 보면 숫자가 늘어납니다'])
    })
  })

  describe('패널에서 온 숨김 요청', () => {
    const toggleOf = (doc) => banners(doc)[0].querySelector('.crf-toggle')

    it('리스너를 하나 붙이고 요약에 숨김 설정과 숨길 수 있는지를 싣는다', async () => {
      await boot(musinsaFixture)

      expect(messageListeners).toHaveLength(1)
      expect(summaries().at(-1).summary.hidden).toBe(false)
      expect(summaries().at(-1).summary.canToggle).toBe(true)
    })

    it('기본 숨김 변형이면 요약의 hidden 이 true 다', async () => {
      await boot(musinsaFixture, { variants: ON })

      expect(summaries().at(-1).summary.hidden).toBe(true)
      expect(summaries().at(-1).summary.canToggle).toBe(true)
    })

    it('숨기라는 요청을 받으면 체험단 카드를 접고 배너와 요약을 맞추고 Filter Toggled 를 한 번 보낸다', async () => {
      const doc = await boot(musinsaFixture)

      const { returned, responses } = await setFilter(true)

      expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(1)
      expect(toggleOf(doc).textContent).toBe('체험단 리뷰 다시 보기')
      expect(toggleOf(doc).getAttribute('aria-pressed')).toBe('true')
      const toggled = trackedOfType('Filter Toggled')
      expect(toggled).toHaveLength(1)
      expect(toggled[0].properties.toggle_source).toBe('panel')
      expect(toggled[0].properties.to_state).toBe('on')
      expect(toggled[0].properties.default_state).toBe('off')
      expect(toggled[0].properties.site).toBe('musinsa')
      expect(summaries().at(-1).summary.hidden).toBe(true)
      expect(summaries().at(-1).summary.canToggle).toBe(true)
      // 응답을 보내지 않는다.
      expect(returned.every((value) => value === false || value === undefined)).toBe(true)
      expect(responses).toBe(0)
    })

    it('다시 보이라는 요청을 받으면 편다', async () => {
      const doc = await boot(musinsaFixture, { variants: ON })
      expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)

      await setFilter(false)

      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
      expect(toggleOf(doc).textContent).toBe('체험단 리뷰 숨기기')
      const toggled = trackedOfType('Filter Toggled')
      expect(toggled).toHaveLength(1)
      expect(toggled[0].properties.to_state).toBe('off')
      expect(toggled[0].properties.default_state).toBe('on')
      expect(toggled[0].properties.toggle_source).toBe('panel')
      expect(summaries().at(-1).summary.hidden).toBe(false)
    })

    it('배너 버튼으로 누르면 toggle_source 가 banner 이고 프로퍼티는 그것 하나만 늘었다', async () => {
      const doc = await boot(musinsaFixture)

      toggleOf(doc).click()
      await tick()

      const toggled = trackedOfType('Filter Toggled')
      expect(toggled).toHaveLength(1)
      expect(toggled[0].properties.toggle_source).toBe('banner')
      expect(Object.keys(toggled[0].properties).sort()).toEqual([
        'default_state',
        'pages_seen',
        'product_id',
        'review_sort',
        'seconds_since_render',
        'site',
        'to_state',
        'toggle_source',
      ])
      expect(summaries().at(-1).summary.hidden).toBe(true)
    })

    it('패널과 배너의 Filter Toggled 는 toggle_source 말고는 같은 프로퍼티를 싣는다', async () => {
      const doc = await boot(musinsaFixture)

      await setFilter(true)
      toggleOf(doc).click()
      await tick()

      const [fromPanel, fromBanner] = trackedOfType('Filter Toggled')
      expect(Object.keys(fromPanel.properties).sort()).toEqual(Object.keys(fromBanner.properties).sort())
      expect(fromPanel.properties.toggle_source).toBe('panel')
      expect(fromBanner.properties.toggle_source).toBe('banner')
      expect(fromBanner.properties.to_state).toBe('off')
    })

    it('이미 같은 값이면 아무것도 하지 않는다', async () => {
      const doc = await boot(musinsaFixture)
      const before = sentMessages.length

      await setFilter(false)

      expect(sentMessages).toHaveLength(before)
      expect(trackedOfType('Filter Toggled')).toHaveLength(0)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)

      await setFilter(true)
      const afterFirst = sentMessages.length
      await setFilter(true)

      expect(sentMessages).toHaveLength(afterFirst)
      expect(trackedOfType('Filter Toggled')).toHaveLength(1)
    })

    it('hidden 이 boolean 이 아니면 무시한다', async () => {
      const doc = await boot(musinsaFixture)
      const before = sentMessages.length

      for (const hidden of ['true', 1, null, undefined, {}]) await setFilter(hidden)

      expect(sentMessages).toHaveLength(before)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
      expect(toggleOf(doc).getAttribute('aria-pressed')).toBe('false')
    })

    it('다른 확장이 보냈거나 보낸 쪽을 모르면 무시한다', async () => {
      const doc = await boot(musinsaFixture)
      const before = sentMessages.length

      for (const sender of [{ id: 'another-extension-id' }, {}, null]) await setFilter(true, sender)

      expect(sentMessages).toHaveLength(before)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
      expect(toggleOf(doc).getAttribute('aria-pressed')).toBe('false')
    })

    it('다른 종류의 메시지는 hidden 이 실려 있어도 무시한다', async () => {
      const doc = await boot(musinsaFixture)
      const before = sentMessages.length

      await deliver({ type: 'crf:summary-updated', hidden: true })
      await deliver({ hidden: true })
      await deliver(null)

      expect(sentMessages).toHaveLength(before)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
    })

    it('조건 보기에서는 요청을 무시하고 요약의 canToggle 이 false 다', async () => {
      const doc = await boot(musinsaFixture)
      await setSponsoredOnly(doc, true)
      expect(toggleOf(doc)).toBeNull()
      expect(summaries().at(-1).summary.canToggle).toBe(false)
      expect(summaries().at(-1).summary.hidden).toBe(false)
      const before = sentMessages.length

      await setFilter(true)

      expect(sentMessages).toHaveLength(before)
      expect(trackedOfType('Filter Toggled')).toHaveLength(0)

      // 나온 뒤에도 숨김 설정은 그대로 꺼져 있다.
      await setSponsoredOnly(doc, false)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
      expect(toggleOf(doc).getAttribute('aria-pressed')).toBe('false')
      expect(summaries().at(-1).summary.canToggle).toBe(true)

      // 숨김 버튼이 돌아왔으므로 이제는 받는다.
      await setFilter(true)
      expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)
    })

    it('조건 상태를 모를 때도 요청을 무시한다', async () => {
      const doc = await boot(musinsaFixture)
      doc.querySelector(SPONSORED_FILTER).className = 'border border-neutral-200'
      await touchDom(doc)
      expect(summaries().at(-1).summary.canToggle).toBe(false)

      await setFilter(true)

      expect(trackedOfType('Filter Toggled')).toHaveLength(0)
    })

    it('체험단이 0건이면 요청을 무시하고 요약의 canToggle 이 false 다', async () => {
      const doc = await boot(musinsaFixture.replace(NOTICE, '안내'))
      expect(toggleOf(doc)).toBeNull()
      expect(summaries().at(-1).summary.canToggle).toBe(false)
      const before = sentMessages.length

      await setFilter(true)

      expect(sentMessages).toHaveLength(before)
      expect(trackedOfType('Filter Toggled')).toHaveLength(0)
    })

    it('대상 페이지를 벗어나 배너가 지워지면 그 뒤의 요청은 무시한다', async () => {
      const doc = await boot(musinsaFixture)
      await moveTo(doc, '/main/musinsa/ranking')
      expect(banners(doc)).toHaveLength(0)
      const before = sentMessages.length

      await setFilter(true)

      expect(sentMessages).toHaveLength(before)
    })

    it('아직 그리기 전이면 요청을 무시한다', async () => {
      await boot('<div></div>')
      const before = sentMessages.length

      await setFilter(true)

      expect(sentMessages).toHaveLength(before)
    })

    it('변형이 확정되기 전에 패널로 숨겼으면 도착한 변형이 그 선택을 덮지 않는다', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const dom = new JSDOM(`<body>${musinsaFixture}</body>`, { url: PRODUCT_URL })
        lastDom = dom
        sentMessages = []
        messageListeners = []
        let answerVariant = null
        globalThis.chrome = {
          runtime: {
            id: EXTENSION_ID,
            onMessage: { addListener: (fn) => messageListeners.push(fn) },
            sendMessage(message, callback) {
              sentMessages.push(message)
              if (message?.type === 'crf:get-variant') answerVariant = callback
              return undefined
            },
          },
        }
        globalThis.window = dom.window
        globalThis.document = dom.window.document
        globalThis.MutationObserver = dom.window.MutationObserver
        vi.resetModules()
        await import('../extension/src/content/index.js')
        const doc = dom.window.document

        for (const listener of messageListeners) listener({ type: 'crf:set-filter', hidden: true }, { id: EXTENSION_ID }, () => {})
        expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)

        answerVariant({ variants: OFF })
        expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)
        const toggled = trackedOfType('Filter Toggled')
        expect(toggled).toHaveLength(1)
        expect(toggled[0].properties.toggle_source).toBe('panel')
        expect(toggled[0].properties.default_state).toBe('off')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('이벤트의 쇼핑몰과 번호', () => {
    it('보낸 모든 이벤트에 site 와 접두 붙은 상품 번호가 실린다', async () => {
      const doc = await boot(
        `${musinsaFixture}<button type="button" data-button-id="basket_btn">장바구니</button>`,
      )
      banners(doc)[0].querySelector('.crf-toggle').click()
      await tick()
      doc.querySelector('[data-button-id="basket_btn"]').click()
      await tick()

      expect(tracked().map((message) => message.eventType)).toEqual([
        'Banner Rendered',
        'Filter Toggled',
        'Purchase Intent Clicked',
      ])
      for (const message of tracked()) {
        expect(message.properties.site).toBe('musinsa')
        expect(message.properties.product_id).toBe('musinsa:4633343')
      }
      expect(trackedOfType('Purchase Intent Clicked')[0].properties.intent_kind).toBe('cart')
    })

    it('Banner Rendered 는 접두 붙은 첫 카드 번호와 무신사의 정렬을 싣는다', async () => {
      await boot(musinsaFixture)

      const rendered = trackedOfType('Banner Rendered')
      expect(rendered).toHaveLength(1)
      expect(rendered[0].properties.page_first_review_id).toBe('musinsa:90000001')
      expect(rendered[0].properties.review_sort).toBe('useful')
      expect(rendered[0].properties.review_count).toBe(3)
      expect(rendered[0].properties.sponsored_count).toBe(1)
    })

    it('요약 메시지에 site 가 실린다', async () => {
      await boot(musinsaFixture)

      expect(summaries().length).toBeGreaterThanOrEqual(1)
      for (const message of summaries()) {
        expect(message.summary.site).toBe('musinsa')
      }
      expect(summaries().at(-1).summary.total).toBe(3)
      expect(summaries().at(-1).summary.sponsoredCount).toBe(1)
    })

    it('떠나는 상품의 건강 신호에도 접두 붙은 번호가 실린다', async () => {
      const doc = await boot(musinsaFixture)
      await showCards(doc, [card('91000001', { rating: '5.0' })])

      // 처음 상품은 별점을 읽었으므로 신호가 없다.
      // 카드는 있는데 별점을 한 번도 읽지 못한 상품(555)에 들렀다가 다른 상품으로 넘어간다.
      await moveTo(doc, '/products/555')
      expect(trackedOfType('Extension Error')).toHaveLength(0)
      await moveTo(doc, '/products/556')

      const errors = trackedOfType('Extension Error')
      expect(errors).toHaveLength(1)
      expect(errors[0].properties.error_type).toBe('ReviewRatingNotFound')
      expect(errors[0].properties.product_id).toBe('musinsa:555')
      expect(errors[0].properties.site).toBe('musinsa')
    })
  })

  describe('묶음 관측', () => {
    const fresh = (from, count) =>
      Array.from({ length: count }, (_, index) => card(String(from + index)))

    it('첫 렌더에서 한 번 보내고 새 번호가 10개 쌓일 때 다음을 보낸다', async () => {
      const doc = await boot(musinsaFixture)
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)
      expect(trackedOfType('Banner Rendered')[0].properties.pages_seen).toBe(1)

      // 새 번호 3개.
      await showCards(doc, fresh(101, 3))
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)

      // 새 번호 3개와 이미 본 번호 하나. 합쳐 6개.
      await showCards(doc, [...fresh(104, 3), card('101')])
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)

      // 합쳐 9개.
      await showCards(doc, fresh(107, 3))
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)

      // 이미 본 번호만 다시 나오면 세지 않는다. 첫 렌더에서 본 번호도 같다.
      await showCards(doc, [card('101'), card('109'), card('90000002', { rating: '4' })])
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)

      // 열 번째 새 번호.
      await showCards(doc, [card('110'), card('109')])
      const rendered = trackedOfType('Banner Rendered')
      expect(rendered).toHaveLength(2)
      expect(rendered[1].properties.pages_seen).toBe(2)
      expect(rendered[1].properties.sort_pages_seen).toBe(2)
      expect(rendered[1].properties.review_count).toBe(13)
      expect(rendered[1].properties.page_review_count).toBe(2)
      expect(rendered[1].properties.page_first_review_id).toBe('musinsa:110')

      // 보낸 뒤에는 다시 0 부터 센다.
      await showCards(doc, fresh(201, 9))
      expect(trackedOfType('Banner Rendered')).toHaveLength(2)
      await showCards(doc, fresh(210, 1))
      expect(trackedOfType('Banner Rendered')).toHaveLength(3)
      expect(trackedOfType('Banner Rendered')[2].properties.pages_seen).toBe(3)
    })

    it('이벤트를 보내지 않는 동안에도 배지와 배너 숫자와 요약은 카드가 바뀔 때마다 갱신한다', async () => {
      const doc = await boot(musinsaFixture, { variants: ON })
      expect(banners(doc)[0].textContent).toContain('리뷰 3개 중 체험단 1개')

      await showCards(doc, [card('101', { sponsored: true }), card('102'), card('103')])

      expect(trackedOfType('Banner Rendered')).toHaveLength(1)
      expect(banners(doc)[0].textContent).toContain('리뷰 6개 중 체험단 2개')
      expect(summaries().at(-1).summary.total).toBe(6)
      expect(summaries().at(-1).summary.sponsoredCount).toBe(2)
      const added = doc.querySelector('[data-content-id="101"]')
      expect(added.querySelector('.crf-badge')).not.toBeNull()
      expect(added.classList.contains('crf-collapsed')).toBe(true)
    })

    it('한 번에 10개가 넘게 새로 보여도 한 번만 보낸다', async () => {
      const doc = await boot(musinsaFixture)

      await showCards(doc, fresh(101, 12))

      const rendered = trackedOfType('Banner Rendered')
      expect(rendered).toHaveLength(2)
      expect(rendered[1].properties.pages_seen).toBe(2)
    })
  })

  describe('체험단 후기만 모아 보는 조건', () => {
    it('조건을 고르면 숨기지 않고 안내 글을 보여 주며 나오면 다시 접는다', async () => {
      const doc = await boot(musinsaFixture, { variants: ON })
      expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)
      expect(banners(doc)[0].querySelector('.crf-toggle')).not.toBeNull()

      await setSponsoredOnly(doc, true)

      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
      expect(sponsoredCard(doc).querySelector('.crf-badge')).not.toBeNull()
      expect(banners(doc)).toHaveLength(1)
      expect(banners(doc)[0].querySelector('.crf-note').textContent).toBe(NOTE)
      expect(banners(doc)[0].querySelector('.crf-toggle')).toBeNull()

      await setSponsoredOnly(doc, false)

      expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(1)
      expect(banners(doc)[0].querySelector('.crf-note')).toBeNull()
      expect(banners(doc)[0].querySelector('.crf-toggle').getAttribute('aria-pressed')).toBe('true')
    })

    const sponsoredBatch = (from, count) =>
      Array.from({ length: count }, (_, index) => card(String(from + index), { sponsored: true }))

    // 조건 버튼과 카드를 한 번에 바꾼다.
    async function switchView(doc, className, cards) {
      doc.querySelector(SPONSORED_FILTER).className = className
      await showCards(doc, cards)
    }

    it('조건 안에서 새 카드가 10장 나와도 누적하지 않고 Banner Rendered 를 보내지 않는다', async () => {
      const doc = await boot(musinsaFixture)
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)
      const trackedBefore = tracked().length
      const summariesBefore = summaries().length

      await switchView(doc, 'border border-black', sponsoredBatch(101, 10))

      expect(tracked()).toHaveLength(trackedBefore)
      // 요약은 들어가기 전의 누적 그대로 다시 보낸다.
      expect(summaries().length).toBeGreaterThan(summariesBefore)
      expect(summaries().at(-1).summary.site).toBe('musinsa')
      expect(summaries().at(-1).summary.total).toBe(3)
      expect(summaries().at(-1).summary.sponsoredCount).toBe(1)
      for (const message of summaries()) expect(message.summary.total).toBe(3)
      // 화면의 숫자도 조건에 들어가기 전의 누적 그대로다. 배지는 붙인다.
      expect(banners(doc)[0].textContent).toContain('리뷰 3개 중 체험단 1개')
      expect(banners(doc)[0].querySelector('.crf-note').textContent).toBe(NOTE)
      expect(doc.querySelectorAll('.crf-badge')).toHaveLength(10)

      // 조건 안에서 카드가 더 바뀌어도 같다.
      await showCards(doc, sponsoredBatch(111, 10))
      expect(tracked()).toHaveLength(trackedBefore)
      expect(summaries().at(-1).summary.total).toBe(3)
    })

    it('조건에서 나온 뒤의 Banner Rendered 에는 조건 안에서만 본 번호가 없다', async () => {
      const doc = await boot(musinsaFixture)
      await switchView(doc, 'border border-black', sponsoredBatch(101, 10))

      // 나오면서 새 일반 후기 10장과 이미 본 체험단 후기 한 장이 보인다.
      const fresh = Array.from({ length: 10 }, (_, index) => card(String(201 + index)))
      await switchView(doc, 'border border-gray-300', [
        card('90000001', { sponsored: true }),
        ...fresh,
      ])

      const rendered = trackedOfType('Banner Rendered')
      expect(rendered).toHaveLength(2)
      expect(rendered[1].properties.review_count).toBe(13)
      expect(rendered[1].properties.sponsored_count).toBe(1)
      expect(rendered[1].properties.pages_seen).toBe(2)
      expect(rendered[1].properties.sort_pages_seen).toBe(2)
      expect(summaries().at(-1).summary.total).toBe(13)
      expect(banners(doc)[0].textContent).toContain('리뷰 13개 중 체험단 1개')
    })

    it('조건 안에서 본 번호는 묶음 관측의 세던 수에도 넣지 않는다', async () => {
      const doc = await boot(musinsaFixture)
      // 새 번호 9개를 세어 둔다.
      const nine = Array.from({ length: 9 }, (_, index) => card(String(201 + index)))
      await showCards(doc, nine)
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)

      await switchView(doc, 'border border-black', sponsoredBatch(101, 10))
      await switchView(doc, 'border border-gray-300', nine)
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)

      // 열 번째 새 번호에서 나간다.
      await showCards(doc, [card('210')])
      const rendered = trackedOfType('Banner Rendered')
      expect(rendered).toHaveLength(2)
      expect(rendered[1].properties.review_count).toBe(13)
    })

    it('누적이 빈 채로 조건 보기면 안내 글만 있는 배너를 보이고 아무것도 보내지 않는다', async () => {
      const doc = await boot(musinsaFixture.replace('border-gray-300', 'border-black'), {
        variants: ON,
      })

      expect(banners(doc)).toHaveLength(1)
      expect([...banners(doc)[0].children].map((child) => child.className)).toEqual(['crf-note'])
      expect(banners(doc)[0].textContent).toBe(NOTE)
      expect(doc.querySelectorAll('.crf-badge')).toHaveLength(1)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
      expect(tracked()).toHaveLength(0)
      expect(summaries()).toHaveLength(0)

      // 나오면 지금 화면의 카드를 누적하고 원래 숨김 설정을 적용한다.
      await setSponsoredOnly(doc, false)

      const rendered = trackedOfType('Banner Rendered')
      expect(rendered).toHaveLength(1)
      expect(rendered[0].properties.pages_seen).toBe(1)
      expect(rendered[0].properties.review_count).toBe(3)
      expect(rendered[0].properties.filter_state).toBe('on')
      expect(summaries().at(-1).summary.total).toBe(3)
      expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)
      expect(banners(doc)[0].querySelector('.crf-note')).toBeNull()
    })

    it('조건 안에서 누른 구매 버튼은 들어가기 전의 누적을 싣는다', async () => {
      const doc = await boot(
        `${musinsaFixture}<button type="button" data-button-id="basket_btn">장바구니</button>`,
      )
      await switchView(doc, 'border border-black', sponsoredBatch(101, 10))

      doc.querySelector('[data-button-id="basket_btn"]').click()
      await tick()

      const clicked = trackedOfType('Purchase Intent Clicked')
      expect(clicked).toHaveLength(1)
      expect(clicked[0].properties.review_count).toBe(3)
      expect(clicked[0].properties.pages_seen).toBe(1)
    })

    describe('조건 버튼의 상태를 모를 때', () => {
      it('숨기지 않고 다른 안내 글을 보이며 SponsoredFilterUnknown 을 상품당 한 번 보낸다', async () => {
        const doc = await boot(musinsaFixture, { variants: ON })
        expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)
        const renderedBefore = trackedOfType('Banner Rendered').length

        // 두 class 가 모두 없다.
        doc.querySelector(SPONSORED_FILTER).className = 'border border-neutral-200'
        await touchDom(doc)

        expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
        expect(sponsoredCard(doc).querySelector('.crf-badge')).not.toBeNull()
        expect(banners(doc)[0].querySelector('.crf-toggle')).toBeNull()
        expect(banners(doc)[0].querySelector('.crf-note').textContent).toBe(UNKNOWN_NOTE)
        expect(banners(doc)[0].textContent).toContain('리뷰 3개 중 체험단 1개')

        // 모르는 동안 카드가 바뀌어도 누적하지 않고 오류도 다시 보내지 않는다.
        await showCards(doc, sponsoredBatch(101, 10))
        await showCards(doc, sponsoredBatch(111, 10))

        const errors = trackedOfType('Extension Error')
        expect(errors).toHaveLength(1)
        expect(errors[0].properties.error_type).toBe('SponsoredFilterUnknown')
        expect(errors[0].properties.site).toBe('musinsa')
        expect(errors[0].properties.product_id).toBe('musinsa:4633343')
        expect(trackedOfType('Banner Rendered')).toHaveLength(renderedBefore)
        expect(summaries().at(-1).summary.total).toBe(3)
      })

      it('두 class 가 모두 있어도 모르는 상태다', async () => {
        const doc = await boot(musinsaFixture, { variants: ON })

        doc.querySelector(SPONSORED_FILTER).className = 'border border-black border-gray-300'
        await touchDom(doc)

        expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
        expect(banners(doc)[0].querySelector('.crf-note').textContent).toBe(UNKNOWN_NOTE)
        expect(trackedOfType('Extension Error')).toHaveLength(1)
      })

      it('다른 상품으로 넘어가면 다시 한 번 보낸다', async () => {
        const doc = await boot(musinsaFixture.replace('border-gray-300', 'border-neutral-200'))
        expect(trackedOfType('Extension Error')).toHaveLength(1)
        expect(banners(doc)[0].textContent).toBe(UNKNOWN_NOTE)

        await moveTo(doc, '/products/777')

        const errors = trackedOfType('Extension Error').filter(
          (message) => message.properties.error_type === 'SponsoredFilterUnknown',
        )
        expect(errors).toHaveLength(2)
        expect(errors[1].properties.product_id).toBe('musinsa:777')
      })

      it('조건을 고르기만 한 동안에는 오류를 보내지 않는다', async () => {
        const doc = await boot(musinsaFixture)
        await setSponsoredOnly(doc, true)
        expect(trackedOfType('Extension Error')).toHaveLength(0)
      })
    })

    it('어떤 이벤트에도 sponsored_only_view 가 없다', async () => {
      const doc = await boot(
        `${musinsaFixture}<button type="button" data-button-id="basket_btn">장바구니</button>`,
      )
      banners(doc)[0].querySelector('.crf-toggle').click()
      await tick()
      await switchView(doc, 'border border-black', sponsoredBatch(101, 10))
      await switchView(doc, 'border border-neutral-200', sponsoredBatch(111, 10))
      await switchView(doc, 'border border-gray-300', sponsoredBatch(121, 10))
      doc.querySelector('[data-button-id="basket_btn"]').click()
      await tick()

      expect(new Set(tracked().map((message) => message.eventType))).toEqual(
        new Set(['Banner Rendered', 'Filter Toggled', 'Extension Error', 'Purchase Intent Clicked']),
      )
      for (const message of tracked()) {
        expect('sponsored_only_view' in message.properties).toBe(false)
      }
    })

    it('조건 읽기가 던져도 배지와 배너는 동작한다', async () => {
      vi.doMock('../extension/src/content/sites/musinsa.js', async (importOriginal) => {
        const actual = await importOriginal()
        return {
          ...actual,
          musinsa: {
            ...actual.musinsa,
            sponsoredFilterState: () => {
              throw new Error('조건 읽기 실패')
            },
          },
        }
      })

      const doc = await boot(musinsaFixture, { variants: ON })

      expect(banners(doc)).toHaveLength(1)
      expect(doc.querySelectorAll('.crf-badge')).toHaveLength(1)
      expect(sponsoredCard(doc).classList.contains('crf-collapsed')).toBe(true)
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)
      expect(trackedOfType('Extension Error')).toHaveLength(0)
    })
  })

  describe('화면만 바꾸는 이동', () => {
    it('대상 페이지가 아닌 주소로 바뀌면 배너를 지우고 이벤트를 더 보내지 않는다', async () => {
      const doc = await boot(musinsaFixture)
      expect(banners(doc)).toHaveLength(1)
      const sentBefore = tracked().length
      const summariesBefore = summaries().length

      await moveTo(doc, '/main/musinsa/ranking')

      expect(banners(doc)).toHaveLength(0)

      // 후기 구역이 남아 있고 카드가 바뀌어도 그리지 않는다.
      await showCards(doc, [card('101'), card('102')])
      expect(banners(doc)).toHaveLength(0)
      expect(doc.querySelector('[data-content-id="101"] .crf-badge')).toBeNull()
      expect(tracked()).toHaveLength(sentBefore)
      expect(summaries()).toHaveLength(summariesBefore)
    })

    it('대상 페이지가 아닌 주소에서 떠날 때 건강 신호를 보내지 않는다', async () => {
      const doc = await boot('<div>후기 구역이 없는 화면</div>')
      await moveTo(doc, '/main/musinsa/ranking')

      Object.defineProperty(lastDom.window, 'scrollY', { value: 900, configurable: true })
      Object.defineProperty(lastDom.window, 'innerHeight', { value: 100, configurable: true })
      Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 1000, configurable: true })
      lastDom.window.dispatchEvent(new lastDom.window.Event('scroll'))
      lastDom.window.dispatchEvent(new lastDom.window.Event('pagehide'))
      await tick()

      expect(tracked()).toHaveLength(0)
    })

    it('다른 상품 주소로 바뀌면 누적과 관측 횟수가 0 에서 다시 시작한다', async () => {
      const doc = await boot(musinsaFixture)
      // 앞 상품에서 새 번호 9개를 세어 둔다. 다음 상품으로 넘어가면 버린다.
      await showCards(
        doc,
        Array.from({ length: 9 }, (_, index) => card(String(101 + index))),
      )
      expect(trackedOfType('Banner Rendered')).toHaveLength(1)

      await moveTo(doc, '/main/musinsa/ranking')
      lastDom.window.history.pushState({}, '', '/products/777')
      await showCards(doc, [card('301', { sponsored: true }), card('302')])

      expect(banners(doc)).toHaveLength(1)
      expect(banners(doc)[0].textContent).toContain('리뷰 2개 중 체험단 1개')
      const rendered = trackedOfType('Banner Rendered')
      expect(rendered).toHaveLength(2)
      expect(rendered[1].properties.product_id).toBe('musinsa:777')
      expect(rendered[1].properties.pages_seen).toBe(1)
      expect(rendered[1].properties.review_count).toBe(2)

      // 앞 상품에서 세던 9개가 남아 있으면 여기서 한 번 더 나간다.
      await showCards(doc, [card('303'), card('304')])
      expect(trackedOfType('Banner Rendered')).toHaveLength(2)
    })
  })

  // 후기 전체보기는 스크롤할 때 카드 요소를 새로 만들지 않고 번호 속성만 바꿔 다시 쓰기도 한다.
  describe('번호 속성만 바뀌는 카드', () => {
    it('관찰 옵션에 번호 속성이 들어 있다', async () => {
      await boot(musinsaFixture)
      expect(observeOptions).toEqual([
        { childList: true, subtree: true, attributes: true, attributeFilter: ['data-content-id'] },
      ])
    })

    it('카드의 번호 속성만 새 번호로 바꿔도(자식 변화 없이) 누적 수가 늘어난다', async () => {
      const doc = await boot(musinsaFixture)
      expect(summaries().at(-1).summary.total).toBe(3)
      const summariesBefore = summaries().length

      doc.querySelector('[data-content-id="90000002"]').setAttribute('data-content-id', '90000102')
      await tick()

      expect(summaries().length).toBeGreaterThan(summariesBefore)
      expect(summaries().at(-1).summary.total).toBe(4)
    })

    it('번호가 아닌 다른 속성만 바뀌면 다시 읽지 않는다', async () => {
      const doc = await boot(musinsaFixture)
      const summariesBefore = summaries().length

      doc.querySelector('[data-content-id="90000002"]').setAttribute('data-index', '7')
      await tick()

      expect(summaries()).toHaveLength(summariesBefore)
    })
  })

  // 다시 쓰인 카드에는 앞 후기에 붙인 배지와 접힘이 남아 있다. 판정이 바뀌면 함께 정리한다.
  describe('다시 쓰인 카드의 표시와 숨김', () => {
    it('체험단이던 카드가 일반 후기로 다시 쓰이면 배지와 접힘이 없다', async () => {
      const doc = await boot(musinsaFixture, { variants: ON })
      const element = sponsoredCard(doc)
      expect(element.querySelectorAll('.crf-badge')).toHaveLength(1)
      expect(element.classList.contains('crf-collapsed')).toBe(true)

      element.setAttribute('data-content-id', '90000101')
      element.querySelector('[class*="ExperienceLabelInfo__Wrapper"]').remove()
      await tick()

      expect(element.querySelector('.crf-badge')).toBeNull()
      expect(element.classList.contains('crf-collapsed')).toBe(false)
      expect(doc.querySelectorAll('.crf-badge')).toHaveLength(0)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
      expect(summaries().at(-1).summary.total).toBe(4)
      expect(summaries().at(-1).summary.sponsoredCount).toBe(1)
    })

    it('배지가 남은 채로 들어온 일반 후기는 체험단으로 세지 않는다', async () => {
      const doc = await boot(musinsaFixture)
      const element = sponsoredCard(doc)

      // 무신사가 내용을 배지 뒤에 이어 붙여 배지 글자가 글 가운데에 남는 경우.
      element.setAttribute('data-content-id', '90000101')
      element.querySelector('[class*="ExperienceLabelInfo__Wrapper"]').remove()
      const body = doc.createElement('p')
      body.textContent = '본문 5'
      element.appendChild(body)
      await tick()

      expect(summaries().at(-1).summary.total).toBe(4)
      expect(summaries().at(-1).summary.sponsoredCount).toBe(1)
      expect(element.querySelector('.crf-badge')).toBeNull()
    })

    it('일반이던 카드가 체험단 후기로 다시 쓰이면 배지가 하나 붙고 접힌다', async () => {
      const doc = await boot(musinsaFixture, { variants: ON })
      const element = doc.querySelector('[data-content-id="90000002"]')
      expect(element.querySelector('.crf-badge')).toBeNull()

      element.setAttribute('data-content-id', '90000102')
      const label = doc.createElement('div')
      label.className = 'ExperienceLabelInfo__Wrapper-sc-mno345-0 pOiUy'
      label.textContent = NOTICE
      element.appendChild(label)
      await tick()
      await touchDom(doc)

      expect(element.querySelectorAll('.crf-badge')).toHaveLength(1)
      expect(element.classList.contains('crf-collapsed')).toBe(true)
      expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(2)
    })
  })

  describe('스타일', () => {
    it('접는 class 는 카드를 없애지 않고 높이 1px 로 둔다', () => {
      const rule = /\.crf-collapsed\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
      expect(rule).toContain('height: 1px !important')
      expect(rule).toContain('overflow: hidden !important')
      expect(rule).toContain('visibility: hidden !important')
      expect(rule).not.toContain('display')
      expect(css).toMatch(/\.crf-note\s*\{/)
    })
  })
})

describe('쿠팡에서의 콘텐츠 스크립트(무신사 지원 뒤)', () => {
  it('Banner Rendered 에 site 만 더해지고 번호에는 접두가 없다', async () => {
    await boot(coupangFixture, { url: COUPANG_URL })

    const rendered = trackedOfType('Banner Rendered')
    expect(rendered).toHaveLength(1)
    expect(rendered[0].properties.site).toBe('coupang')
    // 1.0.0 의 프로퍼티에 site 하나만 더해진 것이다.
    expect(Object.keys(rendered[0].properties).sort()).toEqual([
      'filter_state',
      'page_first_review_id',
      'page_review_count',
      'page_sponsored_count',
      'pages_seen',
      'product_id',
      'rating_delta',
      'rating_filtered',
      'rating_official',
      'review_count',
      'review_sort',
      'site',
      'sort_pages_seen',
      'sponsored_count',
      'sponsored_ratio',
    ])
    expect(rendered[0].properties.product_id).toBe('1')
    expect(rendered[0].properties.page_first_review_id).toBe('9001001')
    expect(summaries().at(-1).summary.site).toBe('coupang')
  })

  it('숨기면 체험단 리뷰를 없애고 접는 class 는 쓰지 않는다', async () => {
    const doc = await boot(coupangFixture, { url: COUPANG_URL })

    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    expect(doc.querySelectorAll('.crf-hidden')).toHaveLength(2)
    expect(doc.querySelectorAll('.crf-collapsed')).toHaveLength(0)
    expect(trackedOfType('Filter Toggled')[0].properties.site).toBe('coupang')
    for (const message of tracked()) {
      expect('sponsored_only_view' in message.properties).toBe(false)
    }
  })

  it('범위 줄은 리뷰 페이지를 넘기라고 알리고 요약에도 같은 안내가 실린다', async () => {
    const doc = await boot(coupangFixture, { url: COUPANG_URL })

    expect(banners(doc)[0].querySelector('.crf-scope').textContent).toBe(
      '지금까지 본 리뷰 4개 기준입니다. 리뷰 페이지를 넘기면 숫자가 늘어납니다',
    )
    expect(banners(doc)[0].querySelectorAll('.crf-scope')).toHaveLength(1)
    expect(summaries().at(-1).summary.scopeHint).toBe('리뷰 페이지를 넘기면 숫자가 늘어납니다')
  })

  it('패널에서 온 숨김 요청으로 체험단 리뷰를 없애고 다시 보인다', async () => {
    const doc = await boot(coupangFixture, { url: COUPANG_URL })
    expect(summaries().at(-1).summary.hidden).toBe(false)
    expect(summaries().at(-1).summary.canToggle).toBe(true)

    await setFilter(true)

    expect(doc.querySelectorAll('.crf-hidden')).toHaveLength(2)
    expect(banners(doc)[0].querySelector('.crf-toggle').textContent).toBe('체험단 리뷰 다시 보기')
    expect(summaries().at(-1).summary.hidden).toBe(true)

    await setFilter(false)

    expect(doc.querySelectorAll('.crf-hidden')).toHaveLength(0)
    expect(banners(doc)[0].querySelector('.crf-toggle').textContent).toBe('체험단 리뷰 숨기기')
    expect(summaries().at(-1).summary.hidden).toBe(false)
    const toggled = trackedOfType('Filter Toggled')
    expect(toggled.map((message) => message.properties.to_state)).toEqual(['on', 'off'])
    for (const message of toggled) {
      expect(message.properties.toggle_source).toBe('panel')
      expect(message.properties.site).toBe('coupang')
      expect(message.properties.product_id).toBe('1')
    }
  })

  it('배너 버튼의 Filter Toggled 는 toggle_source 가 banner 다', async () => {
    const doc = await boot(coupangFixture, { url: COUPANG_URL })

    banners(doc)[0].querySelector('.crf-toggle').click()
    await tick()

    const toggled = trackedOfType('Filter Toggled')
    expect(toggled).toHaveLength(1)
    expect(toggled[0].properties.toggle_source).toBe('banner')
  })

  it('다른 확장이 보낸 숨김 요청은 무시한다', async () => {
    const doc = await boot(coupangFixture, { url: COUPANG_URL })

    await setFilter(true, { id: 'another-extension-id' })

    expect(doc.querySelectorAll('.crf-hidden')).toHaveLength(0)
    expect(trackedOfType('Filter Toggled')).toHaveLength(0)
  })

  it('쿠팡의 관찰 옵션은 그대로다(속성을 보지 않는다)', async () => {
    await boot(coupangFixture, { url: COUPANG_URL })

    expect(observeOptions).toEqual([{ childList: true, subtree: true }])
    expect('attributes' in observeOptions[0]).toBe(false)
    expect('attributeFilter' in observeOptions[0]).toBe(false)
  })

  it('쿠팡은 페이지 단위로 관측한다(새 번호가 10개 미만이어도 묶음이 바뀌면 보낸다)', async () => {
    const doc = await boot(coupangFixture, { url: COUPANG_URL })

    doc.querySelector('#sdpReview').innerHTML =
      '<article><i class="twc-bg-full-star"></i><div>리뷰</div><div data-review-id="7000001">도움이 돼요</div></article>'
    await tick()

    const rendered = trackedOfType('Banner Rendered')
    expect(rendered).toHaveLength(2)
    expect(rendered[1].properties.pages_seen).toBe(2)
  })
})
