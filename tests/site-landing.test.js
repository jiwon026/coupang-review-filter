import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JSDOM, VirtualConsole } from 'jsdom'
import { readFileSync } from 'node:fs'
import { initLanding } from '../site/src/landing/landing.js'
import { SITE_ORIGIN } from '../site/src/landing/config.js'

const PAGE_HTML = readFileSync(new URL('../site/public/index.html', import.meta.url), 'utf8')
const PAGE_URL = 'https://crf.test/'
const NOW = 1_800_000_000_000
const DEVICE_KEY = 'crf_site_device_id'
const OPTOUT_KEY = 'crf_site_optout'
const FAKE_KEY = 'fake-landing-key'
const ENDPOINT = 'https://amplitude.test/httpapi'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'

const HERO_ONLY = 0.1
const HERO_STICKY = 0.9

let uuidCounter = 0
const nextUuid = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`

// 화면 상태를 읽는 대상. 기본 상태와 비교하기 쉽게 hidden 값을 한꺼번에 돌려준다.
const SCREEN_IDS = ['cta-hero', 'store-pending', 'handoff', 'handoff-share', 'sticky', 'optout-notice']
function screenOf(doc) {
  return Object.fromEntries(SCREEN_IDS.map((id) => [id, doc.getElementById(id).hidden]))
}

// 표의 세 줄. true 는 숨겨져 있다는 뜻이다.
const PENDING = { 'cta-hero': true, 'store-pending': false, handoff: true, 'handoff-share': true, sticky: true, 'optout-notice': true }
const DESKTOP_LIVE = { ...PENDING, 'cta-hero': false, 'store-pending': true }
const MOBILE_LIVE = { ...PENDING, handoff: false, 'store-pending': true }

// jsdom 에 없는 IntersectionObserver 를 대신한다. 만든 관찰자를 모두 기록해서 테스트가 콜백을 직접 부른다.
// 끊은 관찰자는 더 알리지 않는다(실제 브라우저와 같다).
function installFakeObserver(window) {
  const observers = []
  window.IntersectionObserver = class {
    constructor(callback, options) {
      this.callback = callback
      this.options = options
      this.observed = []
      this.disconnected = false
      this.disconnectCalls = 0
      observers.push(this)
    }
    observe(target) {
      this.observed.push(target.id)
    }
    unobserve() {}
    disconnect() {
      this.disconnected = true
      this.disconnectCalls += 1
    }
    trigger(entries) {
      if (this.disconnected) return
      this.callback(entries, this)
    }
  }
  return observers
}

const observing = (observers, id) => observers.filter((o) => o.observed.includes(id))
const seen = (ratio) => [{ isIntersecting: ratio > 0, intersectionRatio: ratio }]

function setVisibility(document, state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

function throwingStorageGetter(window) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('denied', 'SecurityError')
    },
  })
}

// 읽기는 되고 쓰기만 던진다. 방문자 번호와 제외 상태를 저장하지 못하는 저장소다.
function throwingSetItem(window) {
  const real = window.localStorage
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => real.getItem(key),
      setItem() {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      removeItem() {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    },
  })
}

function throwingStorageMethods(window) {
  const boom = () => {
    throw new DOMException('quota', 'QuotaExceededError')
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: boom, setItem: boom, removeItem: boom },
  })
}

// 실제 index.html 을 올려 initLanding 을 부른다. 주소는 location 과 document.referrer 로 그대로 반영된다.
function load({
  url = PAGE_URL,
  referrer = '',
  userAgent = DESKTOP_UA,
  navigatorOverrides = {},
  config = {},
  random = HERO_ONLY,
  visibility = 'visible',
  withObserver = true,
  setup,
  beforeInit,
  ...rest
} = {}) {
  const dom = new JSDOM(PAGE_HTML, { url, ...(referrer ? { referrer } : {}), virtualConsole: new VirtualConsole() })
  const { window } = dom
  setVisibility(window.document, visibility)
  const observers = withObserver ? installFakeObserver(window) : []
  if (setup) setup(window)
  if (beforeInit) beforeInit(window.document)
  // 게터를 실행하지 않고 옮겨야 "읽는 것이 던지는" navigator 를 만들 수 있다.
  const navigator = Object.defineProperties(
    { userAgent, maxTouchPoints: 0, webdriver: false },
    Object.getOwnPropertyDescriptors(navigatorOverrides),
  )
  const options = {
    window,
    document: window.document,
    navigator,
    config: { apiKey: FAKE_KEY, endpoint: ENDPOINT, storeLive: true, ...config },
    now: NOW,
    random: () => random,
    randomUUID: nextUuid,
    ...rest,
  }
  initLanding(options)
  return { window, document: window.document, observers, navigator, options }
}

const sentEvents = () => globalThis.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).events[0])
const sentOf = (type) => sentEvents().filter((event) => event.event_type === type)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function click(window, id) {
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true })
  window.document.getElementById(id).dispatchEvent(event)
  return event
}

beforeEach(() => {
  uuidCounter = 0
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})

describe('화면 상태 표', () => {
  it('storeLive false: 화면 종류와 상관없이 심사 중 문구만 보인다', () => {
    expect(screenOf(load({ config: { storeLive: false } }).document)).toEqual(PENDING)
    expect(screenOf(load({ config: { storeLive: false }, userAgent: PHONE_UA }).document)).toEqual(PENDING)
  })

  it('storeLive false 면 모바일이어도 넘기기가 보이지 않는다', () => {
    const { document } = load({ config: { storeLive: false }, userAgent: PHONE_UA, navigatorOverrides: { share: () => Promise.resolve() } })
    expect(document.getElementById('handoff').hidden).toBe(true)
    expect(document.getElementById('handoff-share').hidden).toBe(true)
  })

  it('storeLive true 와 desktop: 설치 버튼이 보이고 심사 중 문구가 숨는다', () => {
    expect(screenOf(load().document)).toEqual(DESKTOP_LIVE)
  })

  it('storeLive true 와 mobile: 넘기기가 보이고 설치 버튼은 숨는다', () => {
    expect(screenOf(load({ userAgent: PHONE_UA }).document)).toEqual(MOBILE_LIVE)
  })

  it('아이패드(맥 UA 와 터치 지점 5)는 mobile 로 본다', () => {
    const { document } = load({ userAgent: IPAD_UA, navigatorOverrides: { maxTouchPoints: 5 } })
    expect(screenOf(document)).toEqual(MOBILE_LIVE)
  })

  it('userAgentData.mobile 이 true 면 mobile 이다', () => {
    const { document } = load({ navigatorOverrides: { userAgentData: { mobile: true } } })
    expect(screenOf(document)).toEqual(MOBILE_LIVE)
  })

  it('navigator.share 가 없으면 공유 버튼이 숨겨져 있고, 있으면 보인다', () => {
    expect(load({ userAgent: PHONE_UA }).document.getElementById('handoff-share').hidden).toBe(true)
    const { document } = load({ userAgent: PHONE_UA, navigatorOverrides: { share: () => Promise.resolve() } })
    expect(document.getElementById('handoff-share').hidden).toBe(false)
  })

  it('설치 버튼의 href 는 스토어 주소이고 유입원과 변형이 실린다', () => {
    const { document } = load({ url: `${PAGE_URL}?utm_source=news`, random: HERO_STICKY })
    for (const id of ['cta-hero', 'cta-sticky']) {
      const href = new URL(document.getElementById(id).getAttribute('href'))
      expect(href.origin + href.pathname).toBe('https://chromewebstore.google.com/detail/diefbidjmimlnigjmkdbghjdhokhhpdk')
      expect(href.searchParams.get('utm_source')).toBe('news')
      expect(href.searchParams.get('utm_medium')).toBe('landing')
      expect(href.searchParams.get('utm_campaign')).toBe('hero_sticky')
    }
    expect(new URL(load({ random: HERO_ONLY }).document.getElementById('cta-hero').href).searchParams.get('utm_campaign')).toBe('hero_only')
  })
})

describe('따라오는 바', () => {
  it('hero_only 에서는 관찰자가 화면 밖을 알려도 #sticky 가 숨겨져 있다', () => {
    const { document, observers } = load({ random: HERO_ONLY })
    for (const observer of observers) observer.trigger(seen(0))
    expect(document.getElementById('sticky').hidden).toBe(true)
    expect(document.body.classList.contains('has-sticky')).toBe(false)
  })

  it('hero_sticky 에서는 히어로 버튼이 화면 밖이면 보이고, 다시 들어오면 숨는다', () => {
    const { document, observers } = load({ random: HERO_STICKY })
    const sticky = document.getElementById('sticky')
    const [hero] = observing(observers, 'cta-hero')
    expect(sticky.hidden).toBe(true)
    hero.trigger(seen(0))
    expect(sticky.hidden).toBe(false)
    expect(document.body.classList.contains('has-sticky')).toBe(true)
    hero.trigger(seen(1))
    expect(sticky.hidden).toBe(true)
    expect(document.body.classList.contains('has-sticky')).toBe(false)
  })

  it('IntersectionObserver 가 없으면 바를 보이지 않는다', () => {
    const { document } = load({ random: HERO_STICKY, withObserver: false })
    expect(document.getElementById('sticky').hidden).toBe(true)
    expect(screenOf(document)).toEqual(DESKTOP_LIVE)
  })

  it('storeLive false 면 hero_sticky 여도 바를 보이지 않는다', () => {
    const { document, observers } = load({ random: HERO_STICKY, config: { storeLive: false } })
    for (const observer of observers) observer.trigger(seen(0))
    expect(document.getElementById('sticky').hidden).toBe(true)
  })

  it('모바일에서는 바를 보이지 않는다', () => {
    const { document, observers } = load({ random: HERO_STICKY, userAgent: PHONE_UA })
    for (const observer of observers) observer.trigger(seen(0))
    expect(document.getElementById('sticky').hidden).toBe(true)
  })
})

describe('Landing Viewed', () => {
  const SECRET_URL = `${PAGE_URL}secret-path-marker?utm_source=News&utm_medium=cpc&utm_campaign=Spring&email=query-marker%40mail.test#fragment-marker`
  const REFERRER = 'https://www.example.org/referrer-path-marker?q=referrer-query-marker'

  it('정확히 한 번 나가고 방문자 번호, 세션, 공통 프로퍼티, 유입 정보가 실린다', () => {
    const { window } = load({ url: SECRET_URL, referrer: REFERRER, random: HERO_STICKY })
    const views = sentOf('Landing Viewed')
    expect(sentEvents()).toHaveLength(1)
    expect(views).toHaveLength(1)
    const [view] = views
    expect(view.device_id).toBe(window.localStorage.getItem(DEVICE_KEY))
    expect(view.device_id).toMatch(UUID)
    expect(view.session_id).toBe(NOW)
    expect(view.event_properties).toEqual({
      surface: 'site',
      device_class: 'desktop',
      entry_source: 'news',
      exp_install_cta: 'hero_sticky',
      store_live: true,
      referrer_domain: 'example.org',
      utm_source: 'news',
      utm_medium: 'cpc',
      utm_campaign: 'spring',
    })
    expect(globalThis.fetch.mock.calls[0][0]).toBe(ENDPOINT)
    expect(globalThis.fetch.mock.calls[0][1].keepalive).toBe(true)
  })

  it('전체 주소, 경로, 다른 쿼리, 조각, 유입 경로가 페이로드에 없다', () => {
    load({ url: SECRET_URL, referrer: REFERRER })
    const bodies = globalThis.fetch.mock.calls.map(([, init]) => init.body)
    expect(bodies).toHaveLength(1)
    for (const marker of ['secret-path-marker', 'query-marker', 'fragment-marker', 'referrer-path-marker', 'referrer-query-marker', 'crf.test', PAGE_URL]) {
      expect(bodies[0], marker).not.toContain(marker)
    }
  })

  it('포트가 있는 주소에서 자기 사이트(처리방침)로 돌아오면 internal 로 본다', () => {
    load({ url: 'https://crf.test:8443/', referrer: 'https://crf.test:8443/privacy' })
    const { event_properties: props } = sentOf('Landing Viewed')[0]
    expect(props.entry_source).toBe('internal')
    expect(props.referrer_domain).toBe('internal')
  })

  it('없는 유입 정보는 싣지 않는다', () => {
    load()
    const { event_properties: props } = sentOf('Landing Viewed')[0]
    for (const key of ['referrer_domain', 'utm_source', 'utm_medium', 'utm_campaign']) expect(props).not.toHaveProperty(key)
    expect(props.entry_source).toBe('direct')
  })

  it('숨김 상태로 시작하면 0번, 보이게 되면 1번, 다시 숨겼다 보여도 1번이다', () => {
    const { document } = load({ visibility: 'hidden' })
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
    setVisibility(document, 'visible')
    document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
    expect(sentOf('Landing Viewed')).toHaveLength(1)
    setVisibility(document, 'hidden')
    document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
    setVisibility(document, 'visible')
    document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
    expect(sentOf('Landing Viewed')).toHaveLength(1)
  })

  it('숨김 상태에서 숨김 알림만 오면 보내지 않는다', () => {
    const { document } = load({ visibility: 'hidden' })
    document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })
})

describe('계측을 보내지 않는 경우에도 화면은 표대로다', () => {
  it('#notrack 으로 열면 0번이고, 조각이 지워지고, 안내에 방문자 번호가 보인다', () => {
    const { window, document } = load({ url: `${PAGE_URL}?utm_source=news#notrack` })
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?utm_source=news')
    const deviceId = window.localStorage.getItem(DEVICE_KEY)
    expect(deviceId).toMatch(UUID)
    const notice = document.getElementById('optout-notice')
    expect(notice.hidden).toBe(false)
    expect(notice.textContent).toBe(`이 브라우저의 방문은 더 기록하지 않습니다. 방문자 번호: ${deviceId}`)
    expect(screenOf(document)).toEqual({ ...DESKTOP_LIVE, 'optout-notice': false })
  })

  it('#notrack 을 저장하지 못하면 영구 제외라고 약속하지 않고 번호도 보이지 않는다', () => {
    const { document } = load({ url: `${PAGE_URL}#notrack`, setup: throwingSetItem })
    const notice = document.getElementById('optout-notice')
    expect(notice.hidden).toBe(false)
    expect(notice.textContent).toBe('이번 방문은 기록하지 않습니다. 이 브라우저는 설정을 저장하지 못해, 다음에도 주소 끝에 #notrack 을 붙여 열어 주세요.')
    expect(notice.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('#notrack 을 저장했으면 기존 안내에 번호가 보인다', () => {
    const { window, document } = load({ url: `${PAGE_URL}#notrack` })
    const deviceId = window.localStorage.getItem(DEVICE_KEY)
    expect(document.getElementById('optout-notice').textContent).toBe(`이 브라우저의 방문은 더 기록하지 않습니다. 방문자 번호: ${deviceId}`)
  })

  it('#notrack 뒤에는 조각 없이 다시 열어도 0번이고, 버튼을 눌러도 0번이다', () => {
    const { window, document, options } = load({ url: `${PAGE_URL}#notrack`, random: HERO_STICKY })
    expect(window.localStorage.getItem(OPTOUT_KEY)).toBe('1')
    initLanding(options)
    for (const id of ['cta-hero', 'cta-sticky']) click(window, id)
    window.document.getElementById('handoff-copy').click()
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
    expect(screenOf(document)).toEqual({ ...DESKTOP_LIVE, 'optout-notice': false })
  })

  it('계측 제외 상태의 모바일도 화면은 표대로이고 0번이다', () => {
    const { document } = load({ url: `${PAGE_URL}#notrack`, userAgent: PHONE_UA })
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
    expect(screenOf(document)).toEqual({ ...MOBILE_LIVE, 'optout-notice': false })
  })

  it('#track 은 제외를 풀고 안내 문구를 보이고 다시 보낸다', () => {
    const { window, document, options } = load({ url: `${PAGE_URL}#notrack` })
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
    window.history.replaceState(null, '', '/#track')
    initLanding(options)
    expect(window.location.hash).toBe('')
    expect(window.localStorage.getItem(OPTOUT_KEY)).toBeNull()
    expect(document.getElementById('optout-notice').textContent).toBe('이 브라우저의 방문을 다시 기록합니다.')
    expect(sentOf('Landing Viewed')).toHaveLength(1)
  })

  it('명령이 아닌 조각은 지우지 않고 안내도 보이지 않는다', () => {
    const { window, document } = load({ url: `${PAGE_URL}#features` })
    expect(window.location.hash).toBe('#features')
    expect(document.getElementById('optout-notice').hidden).toBe(true)
    expect(sentOf('Landing Viewed')).toHaveLength(1)
  })

  it('navigator.webdriver 가 true 면 0번이고 화면은 표대로다', () => {
    const { window, document } = load({ navigatorOverrides: { webdriver: true } })
    click(window, 'cta-hero')
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
    expect(screenOf(document)).toEqual(DESKTOP_LIVE)
  })

  it('apiKey 가 비어 있으면 0번이고 화면은 표대로다', () => {
    const desktop = load({ config: { apiKey: '' } })
    click(desktop.window, 'cta-hero')
    expect(screenOf(desktop.document)).toEqual(DESKTOP_LIVE)
    const mobile = load({ config: { apiKey: '' }, userAgent: PHONE_UA })
    expect(screenOf(mobile.document)).toEqual(MOBILE_LIVE)
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })
})

describe('Install CTA Clicked', () => {
  it('히어로 버튼은 cta_location hero 로 보내고 이동을 막지 않는다', () => {
    const { window } = load()
    const event = click(window, 'cta-hero')
    expect(event.defaultPrevented).toBe(false)
    const clicks = sentOf('Install CTA Clicked')
    expect(clicks).toHaveLength(1)
    expect(clicks[0].event_properties.cta_location).toBe('hero')
    expect(clicks[0].event_properties.surface).toBe('site')
  })

  it('따라오는 바의 버튼은 cta_location sticky 로 보내고 이동을 막지 않는다', () => {
    const { window } = load({ random: HERO_STICKY })
    const event = click(window, 'cta-sticky')
    expect(event.defaultPrevented).toBe(false)
    expect(sentOf('Install CTA Clicked').map((e) => e.event_properties.cta_location)).toEqual(['sticky'])
  })

  it.each([
    ['cta-hero', 'hero'],
    ['cta-sticky', 'sticky'],
  ])('%s: 가운데 버튼(auxclick, button 1)은 한 번 보내고 이동을 막지 않는다', (id, location) => {
    const { window } = load({ random: HERO_STICKY })
    const event = new window.MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    window.document.getElementById(id).dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    const clicks = sentOf('Install CTA Clicked')
    expect(clicks).toHaveLength(1)
    expect(clicks[0].event_properties.cta_location).toBe(location)
  })

  it.each(['cta-hero', 'cta-sticky'])('%s: 오른쪽 버튼(auxclick, button 2)은 보내지 않는다', (id) => {
    const { window } = load({ random: HERO_STICKY })
    window.document.getElementById(id).dispatchEvent(new window.MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 }))
    expect(sentOf('Install CTA Clicked')).toHaveLength(0)
  })

  it('누를 때마다 보낸다', () => {
    const { window } = load()
    click(window, 'cta-hero')
    click(window, 'cta-hero')
    expect(sentOf('Install CTA Clicked')).toHaveLength(2)
  })

  it('이벤트는 keepalive 로 나간다', () => {
    const { window } = load()
    click(window, 'cta-hero')
    const calls = globalThis.fetch.mock.calls
    expect(calls.at(-1)[1].keepalive).toBe(true)
  })
})

describe('Demo Viewed', () => {
  it('윗변이 화면 세로 가운데에 닿는 기준으로 관찰한다', () => {
    const { observers } = load()
    const [demo] = observing(observers, 'demo')
    expect(demo.options).toEqual({ rootMargin: '0px 0px -50% 0px', threshold: 0 })
  })

  it('교차하지 않는다는 알림에는 보내지 않는다', () => {
    const { observers } = load()
    const [demo] = observing(observers, 'demo')
    demo.trigger([{ isIntersecting: false, intersectionRatio: 0 }])
    expect(sentOf('Demo Viewed')).toHaveLength(0)
    expect(demo.disconnected).toBe(false)
  })

  it('보이는 비율이 아주 작아도(0.01) 교차하면 한 번 보내고 관찰을 끊는다', () => {
    const { observers } = load()
    const [demo] = observing(observers, 'demo')
    demo.trigger([{ isIntersecting: true, intersectionRatio: 0.01 }])
    expect(sentOf('Demo Viewed')).toHaveLength(1)
    expect(demo.disconnected).toBe(true)
    demo.trigger(seen(0.9))
    expect(sentOf('Demo Viewed')).toHaveLength(1)
  })

  it('한 번의 알림에 항목이 여럿 들어와도 한 번만 보낸다', () => {
    const { observers } = load()
    observing(observers, 'demo')[0].trigger([...seen(0.7), ...seen(0.8)])
    expect(sentOf('Demo Viewed')).toHaveLength(1)
  })

  it('IntersectionObserver 가 없어도 던지지 않고 나머지는 동작한다', () => {
    const { document } = load({ withObserver: false })
    expect(sentOf('Landing Viewed')).toHaveLength(1)
    expect(screenOf(document)).toEqual(DESKTOP_LIVE)
  })
})

describe('넘기기', () => {
  const mobile = (extra = {}, options = {}) => load({ userAgent: PHONE_UA, navigatorOverrides: extra, ...options })

  function handoffParams(writeText) {
    return new URL(writeText.mock.calls[0][0]).searchParams
  }

  it('복사: 넘기기 주소를 쓰고 이벤트를 보내고 상태 문구를 보인다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const { window, document } = mobile({ clipboard: { writeText } })
    click(window, 'handoff-copy')
    await flush()
    expect(writeText).toHaveBeenCalledTimes(1)
    const url = new URL(writeText.mock.calls[0][0])
    expect(url.origin).toBe(SITE_ORIGIN)
    expect(url.searchParams.get('utm_source')).toBe('handoff')
    expect(url.searchParams.get('utm_medium')).toBe('copy')
    expect(url.searchParams.get('utm_campaign')).toBe('direct')
    const requests = sentOf('Handoff Link Requested')
    expect(requests).toHaveLength(1)
    expect(requests[0].event_properties.channel).toBe('copy')
    expect(document.getElementById('handoff-status').textContent).toBe('복사했습니다')
  })

  it('복사가 거부되면 실패 문구를 보이고 이벤트는 그래도 한 번 나간다', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const { window, document } = mobile({ clipboard: { writeText } })
    click(window, 'handoff-copy')
    await flush()
    expect(document.getElementById('handoff-status').textContent).toBe('복사하지 못했습니다. 주소창의 주소를 직접 복사해 주세요')
    expect(sentOf('Handoff Link Requested')).toHaveLength(1)
  })

  it('클립보드 API 가 없어도 실패 문구를 보이고 던지지 않는다', async () => {
    const { window, document } = mobile({ clipboard: undefined })
    click(window, 'handoff-copy')
    await flush()
    expect(document.getElementById('handoff-status').textContent).toBe('복사하지 못했습니다. 주소창의 주소를 직접 복사해 주세요')
    expect(sentOf('Handoff Link Requested')).toHaveLength(1)
  })

  it('이벤트는 복사가 끝나기 전, 버튼을 누른 시점에 나간다', () => {
    const writeText = vi.fn(() => new Promise(() => {}))
    const { window } = mobile({ clipboard: { writeText } })
    click(window, 'handoff-copy')
    expect(sentOf('Handoff Link Requested').map((e) => e.event_properties.channel)).toEqual(['copy'])
  })

  it('공유: 제목과 넘기기 주소로 부르고 channel share 로 보낸다', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const { window } = mobile({ share })
    click(window, 'handoff-share')
    await flush()
    expect(share).toHaveBeenCalledTimes(1)
    const [data] = share.mock.calls[0]
    expect(data.title).toBe('체험단 리뷰 제거기 for 쿠팡')
    expect(new URL(data.url).searchParams.get('utm_medium')).toBe('share')
    expect(sentOf('Handoff Link Requested').map((e) => e.event_properties.channel)).toEqual(['share'])
  })

  it('사용자가 공유 창을 닫아 AbortError 로 거부돼도 던지지 않고 아무것도 보이지 않는다', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError'))
    const { window, document } = mobile({ share })
    click(window, 'handoff-share')
    await flush()
    expect(document.getElementById('handoff-status').textContent).toBe('')
    expect(sentOf('Handoff Link Requested')).toHaveLength(1)
  })

  it('handoff 로 들어온 방문자가 다시 복사하면 원래 유입원(utm_campaign)을 넘긴다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const { window } = mobile(
      { clipboard: { writeText } },
      { url: `${PAGE_URL}?utm_source=handoff&utm_medium=copy&utm_campaign=clien-net` },
    )
    click(window, 'handoff-copy')
    await flush()
    expect(handoffParams(writeText).get('utm_campaign')).toBe('clien-net')
    expect(handoffParams(writeText).get('utm_source')).toBe('handoff')
  })

  it('처리방침에서 돌아온 방문(internal)은 원래 유입원으로 넘기지 않는다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const { window } = mobile({ clipboard: { writeText } }, { referrer: `${PAGE_URL}privacy` })
    expect(sentOf('Landing Viewed')[0].event_properties.entry_source).toBe('internal')
    click(window, 'handoff-copy')
    await flush()
    expect(handoffParams(writeText).has('utm_campaign')).toBe(false)
    expect(handoffParams(writeText).get('utm_source')).toBe('handoff')
  })

  it('#handoff-status 가 없어도 복사 실패가 처리되지 않은 거부로 번지지 않고 이벤트는 한 번 나간다', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
      const { window } = mobile({ clipboard: { writeText } }, { beforeInit: (doc) => doc.getElementById('handoff-status').remove() })
      click(window, 'handoff-copy')
      await flush()
      await flush()
      expect(unhandled).not.toHaveBeenCalled()
      expect(sentOf('Handoff Link Requested')).toHaveLength(1)
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('handoff 가 아닌 유입은 entry_source 를 넘긴다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const { window } = mobile({ clipboard: { writeText } }, { url: `${PAGE_URL}?utm_source=news` })
    click(window, 'handoff-copy')
    await flush()
    expect(handoffParams(writeText).get('utm_campaign')).toBe('news')
  })
})

describe('저장소와 계측이 실패해도 화면은 표대로다', () => {
  const FAILURES = [
    ['localStorage 를 읽는 것 자체가 던진다', throwingStorageGetter],
    ['localStorage 의 모든 메서드가 던진다', throwingStorageMethods],
  ]

  it.each(FAILURES)('%s: desktop', (_name, setup) => {
    const { document } = load({ setup })
    expect(screenOf(document)).toEqual(DESKTOP_LIVE)
    expect(document.getElementById('cta-hero').getAttribute('href')).toContain('utm_campaign=')
  })

  it.each(FAILURES)('%s: mobile', (_name, setup) => {
    expect(screenOf(load({ setup, userAgent: PHONE_UA }).document)).toEqual(MOBILE_LIVE)
  })

  it.each(FAILURES)('%s: storeLive false', (_name, setup) => {
    expect(screenOf(load({ setup, config: { storeLive: false } }).document)).toEqual(PENDING)
  })

  it.each(FAILURES)('%s: Landing Viewed 는 나가고 공통 프로퍼티 넷이 모두 실제 값이다', (_name, setup) => {
    load({ setup, random: HERO_STICKY })
    const views = sentOf('Landing Viewed')
    expect(views).toHaveLength(1)
    const props = views[0].event_properties
    expect(props.device_class).toBe('desktop')
    expect(props.entry_source).toBe('direct')
    expect(['hero_only', 'hero_sticky']).toContain(props.exp_install_cta)
    expect(props.store_live).toBe(true)
    expect(views[0].device_id).toMatch(UUID)
    // undefined 는 JSON 에서 사라지므로 키가 직렬화된 본문에 실제로 있는지도 본다.
    const body = globalThis.fetch.mock.calls[0][1].body
    for (const key of ['device_class', 'entry_source', 'exp_install_cta', 'store_live']) expect(body).toContain(`"${key}":`)
  })

  it.each(FAILURES)('%s: 저장소가 던져도 모바일의 넘기기 복사는 동작한다', async (_name, setup) => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const { window, document } = load({ setup, userAgent: PHONE_UA, navigatorOverrides: { clipboard: { writeText } } })
    click(window, 'handoff-copy')
    await flush()
    expect(document.getElementById('handoff-status').textContent).toBe('복사했습니다')
  })

  it('navigator.webdriver 를 읽는 것이 던져도 화면과 복사 버튼은 동작한다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const navigatorOverrides = { clipboard: { writeText } }
    Object.defineProperty(navigatorOverrides, 'webdriver', {
      enumerable: true,
      get() {
        throw new Error('webdriver')
      },
    })
    const { window, document } = load({ userAgent: PHONE_UA, navigatorOverrides })
    expect(screenOf(document)).toEqual(MOBILE_LIVE)
    click(window, 'handoff-copy')
    await flush()
    expect(document.getElementById('handoff-status').textContent).toBe('복사했습니다')
  })

  it('IntersectionObserver 의 생성이 던져도 화면은 표대로다', () => {
    const { document } = load({
      random: HERO_STICKY,
      setup(window) {
        window.IntersectionObserver = class {
          constructor() {
            throw new Error('observer')
          }
        }
      },
    })
    expect(screenOf(document)).toEqual(DESKTOP_LIVE)
    expect(sentOf('Landing Viewed')).toHaveLength(1)
  })

  it('document.visibilityState 를 읽는 것이 던져도 화면은 표대로다', () => {
    const { document } = load({
      setup(window) {
        Object.defineProperty(window.document, 'visibilityState', {
          configurable: true,
          get() {
            throw new Error('visibility')
          },
        })
      },
    })
    expect(screenOf(document)).toEqual(DESKTOP_LIVE)
  })

  it('fetch 가 동기적으로 던져도 화면은 표대로이고 버튼은 이동을 막지 않는다', () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error('network')
    })
    const { window, document } = load()
    expect(screenOf(document)).toEqual(DESKTOP_LIVE)
    expect(click(window, 'cta-hero').defaultPrevented).toBe(false)
  })

  it('fetch 가 거부돼도 처리되지 않은 거부가 생기지 않는다', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'))
    const { window, document } = load()
    click(window, 'cta-hero')
    await flush()
    expect(screenOf(document)).toEqual(DESKTOP_LIVE)
  })
})

describe('insert_id 대체 생성', () => {
  const withoutCrypto = (window) => Object.defineProperty(window, 'crypto', { configurable: true, value: undefined })

  it('randomUUID 가 없어도 Landing Viewed 가 비어 있지 않은 insert_id 로 나간다', () => {
    load({ randomUUID: undefined, setup: withoutCrypto })
    const views = sentOf('Landing Viewed')
    expect(views).toHaveLength(1)
    expect(typeof views[0].insert_id).toBe('string')
    expect(views[0].insert_id.length).toBeGreaterThan(0)
    expect(views[0].device_id).toMatch(UUID)
  })

  it('이벤트마다 insert_id 가 다르다', () => {
    const { window } = load({ randomUUID: undefined, setup: withoutCrypto })
    click(window, 'cta-hero')
    click(window, 'cta-hero')
    const ids = sentEvents().map((event) => event.insert_id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(id.length).toBeGreaterThan(0)
  })

  it('주입한 randomUUID 가 던져도 이벤트는 나간다', () => {
    load({
      randomUUID: () => {
        throw new Error('no uuid')
      },
    })
    const [view] = sentOf('Landing Viewed')
    expect(view.insert_id.length).toBeGreaterThan(0)
    expect(view.device_id).toMatch(UUID)
  })

  it('randomUUID 를 주입하지 않으면 window.crypto 의 것을 쓴다', () => {
    load({ randomUUID: undefined })
    const [view] = sentOf('Landing Viewed')
    expect(view.insert_id).toMatch(UUID)
  })
})
