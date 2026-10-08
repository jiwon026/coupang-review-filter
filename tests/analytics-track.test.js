import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installChromeMock, grantConsent } from './helpers/chrome-mock.js'
import { assignAll, EXPERIMENTS } from '../extension/src/core/experiment.js'

// 실제 키가 든 로컬 설정 파일을 읽지 않도록 설정 모듈을 통째로 대체한다.
vi.mock('../extension/src/shared/config.local.js', () => ({
  CONFIG: {
    amplitudeApiKey: '0123456789abcdef0123456789abcdef',
    amplitudeEndpoint: 'https://amplitude.test/2/httpapi',
    landingOrigin: 'https://example.test',
  },
}))

const deviceIds = Array.from({ length: 200 }, (_, i) => `device-${i}-${(i * 7919) % 100003}`)

let sent = []
let currentStore = {}

async function loadTrack(deviceId) {
  // 이 파일은 전송 내용을 검증한다. 게이트는 consent.test.js 가 검증하므로 동의한 상태로 준비한다.
  currentStore = grantConsent(installChromeMock({ crf_device_id: deviceId }))
  sent = []
  globalThis.fetch = vi.fn(async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return { ok: true, status: 200 }
  })
  vi.resetModules()
  return import('../extension/src/background/analytics.js')
}

async function trackedProps(deviceId, eventProps = {}) {
  const { track } = await loadTrack(deviceId)
  await track('Banner Rendered', eventProps)
  return sent[0].events[0].event_properties
}

describe('track 의 실험 배정 공통 프로퍼티', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exp_default_filter, exp_banner_copy, exp_onboarding_example 을 모든 이벤트에 싣는다', async () => {
    const props = await trackedProps('device-abc')
    expect(['on', 'off']).toContain(props.exp_default_filter)
    expect(['rating', 'ratio']).toContain(props.exp_banner_copy)
    expect(['show', 'hide']).toContain(props.exp_onboarding_example)
  })

  it('값이 같은 device id 의 assignAll 결과와 같다', async () => {
    const seen = Object.fromEntries(Object.values(EXPERIMENTS).map((experiment) => [experiment.id, new Set()]))
    for (const deviceId of deviceIds.slice(0, 40)) {
      const props = await trackedProps(deviceId)
      const assigned = assignAll(deviceId)
      expect(props.exp_default_filter).toBe(assigned.default_filter)
      expect(props.exp_banner_copy).toBe(assigned.banner_copy)
      expect(props.exp_onboarding_example).toBe(assigned.onboarding_example)
      seen.default_filter.add(props.exp_default_filter)
      seen.banner_copy.add(props.exp_banner_copy)
      seen.onboarding_example.add(props.exp_onboarding_example)
    }
    // 한 변형만 나오는 입력 집합이면 위 비교는 두 변형의 일관성을 보지 못한다(공허 방지).
    for (const experiment of Object.values(EXPERIMENTS)) {
      expect([...seen[experiment.id]].sort()).toEqual([...experiment.variants].sort())
    }
  })

  it('이벤트가 exp_* 나 surface 를 보내도 배정 값과 공통 값이 실린다', async () => {
    const props = await trackedProps('device-abc', {
      exp_default_filter: 'x',
      exp_banner_copy: 'x',
      exp_onboarding_example: 'x',
      surface: 'x',
    })
    const assigned = assignAll('device-abc')
    expect(props.exp_default_filter).toBe(assigned.default_filter)
    expect(props.exp_banner_copy).toBe(assigned.banner_copy)
    expect(props.exp_onboarding_example).toBe(assigned.onboarding_example)
    expect(props.surface).toBe('extension')
  })

  it('이벤트 device_id 도 같은 값이다', async () => {
    const { track } = await loadTrack('device-xyz')
    await track('Banner Rendered')
    expect(sent[0].events[0].device_id).toBe('device-xyz')
  })

  it('기존 공통 프로퍼티와 이벤트 프로퍼티를 유지한다', async () => {
    const props = await trackedProps('device-abc', { review_count: 7 })
    expect(props.surface).toBe('extension')
    expect(props.platform).toBe('desktop')
    expect(props.app_version).toBe('0.1.0')
    expect(props.review_count).toBe(7)
  })
})

describe('track 의 세션', () => {
  const T0 = 1_700_000_000_000

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('이벤트 최상위 session_id 는 세션 시작 시각이고 time 과 같은 시계를 쓴다', async () => {
    const { track } = await loadTrack('device-abc')
    const now = vi.spyOn(Date, 'now').mockReturnValue(T0)
    await track('Banner Rendered')
    now.mockReturnValue(T0 + 60 * 1000)
    await track('Filter Toggled')

    expect(sent[0].events[0].session_id).toBe(T0)
    expect(sent[0].events[0].time).toBe(T0)
    expect(sent[1].events[0].session_id).toBe(T0)
    expect(sent[1].events[0].time).toBe(T0 + 60 * 1000)
  })

  it('30분 넘게 쉬고 난 이벤트는 새 session_id 를 싣는다', async () => {
    const { track } = await loadTrack('device-abc')
    const now = vi.spyOn(Date, 'now').mockReturnValue(T0)
    await track('Banner Rendered')
    now.mockReturnValue(T0 + 31 * 60 * 1000)
    await track('Banner Rendered')

    expect(sent[1].events[0].session_id).toBe(T0 + 31 * 60 * 1000)
  })

  it('options.time 이 주어지면 이벤트 time 과 세션 판정에 그 값을 쓴다', async () => {
    const { track } = await loadTrack('device-abc')
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 5000)
    await track('Extension Installed', { consent_source: 'onboarding' }, { time: T0 })

    expect(sent[0].events[0].time).toBe(T0)
    expect(sent[0].events[0].session_id).toBe(T0)
    expect(sent[0].events[0].event_properties.consent_source).toBe('onboarding')
  })

  it.each([
    ['options 없음', undefined],
    ['빈 options', {}],
    ['문자열', { time: '1700000000000' }],
    ['NaN', { time: Number.NaN }],
    ['null', { time: null }],
  ])('options.time 이 유한한 수가 아니면(%s) Date.now() 를 쓴다', async (_label, options) => {
    const { track } = await loadTrack('device-abc')
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 5000)
    await track('Banner Rendered', {}, options)

    expect(sent[0].events[0].time).toBe(T0 + 5000)
    expect(sent[0].events[0].session_id).toBe(T0 + 5000)
  })

  it('세션 저장소가 실패하면 경고하고 session_id -1 로 이벤트는 보낸다', async () => {
    const { track } = await loadTrack('device-abc')
    chrome.storage.session.get = () => Promise.reject(new Error('읽기 실패'))
    await track('Banner Rendered')

    expect(sent).toHaveLength(1)
    expect(sent[0].events[0].session_id).toBe(-1)
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('track 의 최상위 기기 속성', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('전송 본문 이벤트 최상위에 manifest 버전과 Chrome Extension 을 싣는다', async () => {
    const { track } = await loadTrack('device-abc')
    await track('Banner Rendered')

    const event = sent[0].events[0]
    expect(event.app_version).toBe('0.1.0')
    expect(event.platform).toBe('Chrome Extension')
    expect(event.event_properties.platform).toBe('desktop')
    expect(event.event_properties.app_version).toBe('0.1.0')
  })
})

const RAW_PRODUCT_ID = '7590830589'
const RAW_REVIEW_ID = '1020990898'

// 솔트 저장소 읽기에만 끼어든다. 동의와 기기 번호 읽기는 그대로 둔다.
function interceptSaltRead(handler) {
  const originalGet = chrome.storage.local.get.bind(chrome.storage.local)
  chrome.storage.local.get = async (keys) => {
    const list = Array.isArray(keys) ? keys : [keys]
    if (list.includes('crf_salt')) await handler()
    return originalGet(keys)
  }
}

describe('track 의 식별자 최소화', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('상품 번호와 리뷰 번호를 product_key 와 page_key 로 바꿔 보내고 원문은 어디에도 없다', async () => {
    const { track } = await loadTrack('device-abc')
    await track('Banner Rendered', {
      product_id: RAW_PRODUCT_ID,
      page_first_review_id: RAW_REVIEW_ID,
      review_sort: 'best',
    })

    const props = sent[0].events[0].event_properties
    expect(props.product_key).toMatch(/^[0-9a-f]{16}$/)
    expect(props.page_key).toMatch(/^[0-9a-f]{16}$/)
    expect('product_id' in props).toBe(false)
    expect('page_first_review_id' in props).toBe(false)
    expect(props.review_sort).toBe('best')

    const body = JSON.stringify(sent[0])
    expect(body).not.toContain(RAW_PRODUCT_ID)
    expect(body).not.toContain(RAW_REVIEW_ID)
  })

  it('해시가 실패하면 product_key 는 null 이고 본문에 원문이 없다', async () => {
    const { track } = await loadTrack('device-abc')
    interceptSaltRead(async () => {
      throw new Error('솔트 읽기 실패')
    })
    await track('Banner Rendered', { product_id: RAW_PRODUCT_ID, page_first_review_id: RAW_REVIEW_ID })

    expect(sent).toHaveLength(1)
    const props = sent[0].events[0].event_properties
    expect(props.product_key).toBeNull()
    expect(props.page_key).toBeNull()
    expect('product_id' in props).toBe(false)
    expect('page_first_review_id' in props).toBe(false)
    const body = JSON.stringify(sent[0])
    expect(body).not.toContain(RAW_PRODUCT_ID)
    expect(body).not.toContain(RAW_REVIEW_ID)
  })

  it('product_id 가 없는 이벤트는 product_key 와 page_key 키가 생기지 않는다', async () => {
    const props = await trackedProps('device-abc', { review_sort: 'best' })
    expect('product_key' in props).toBe(false)
    expect('page_key' in props).toBe(false)
  })

  it('무신사 접두가 붙은 번호와 붙지 않은 같은 번호의 product_key, page_key 가 다르고 원문은 어디에도 없다', async () => {
    const { track } = await loadTrack('device-abc')
    await track('Banner Rendered', { product_id: `musinsa:${RAW_PRODUCT_ID}`, page_first_review_id: `musinsa:${RAW_REVIEW_ID}` })
    await track('Banner Rendered', { product_id: RAW_PRODUCT_ID, page_first_review_id: RAW_REVIEW_ID })

    const [musinsa, coupang] = sent.map((body) => body.events[0].event_properties)
    expect(musinsa.product_key).toMatch(/^[0-9a-f]{16}$/)
    expect(coupang.product_key).toMatch(/^[0-9a-f]{16}$/)
    expect(musinsa.product_key).not.toBe(coupang.product_key)
    expect(musinsa.page_key).not.toBe(coupang.page_key)
    for (const props of [musinsa, coupang]) {
      expect('product_id' in props).toBe(false)
      expect('page_first_review_id' in props).toBe(false)
    }

    const body = JSON.stringify(sent)
    expect(body).not.toContain(RAW_PRODUCT_ID)
    expect(body).not.toContain(RAW_REVIEW_ID)
    expect(body).not.toContain('musinsa:')
  })

  it('미동의 상태(denied, undecided)에서는 보내지도 솔트를 만들지도 않는다', async () => {
    const { track } = await loadTrack('device-abc')
    const { setConsent } = await import('../extension/src/background/consent.js')

    await setConsent('denied')
    await track('Banner Rendered', { product_id: RAW_PRODUCT_ID })
    expect(sent).toHaveLength(0)
    expect(currentStore.crf_salt).toBeUndefined()

    delete currentStore.crf_consent
    await track('Banner Rendered', { product_id: RAW_PRODUCT_ID })
    expect(sent).toHaveLength(0)
    expect(currentStore.crf_salt).toBeUndefined()
  })
})

describe('track 의 최소 수집 두 번째 방어선', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 예외 메시지는 자유 텍스트라 리뷰 본문이나 번호가 섞일 수 있다. 콘텐츠 스크립트가 싣지 않지만 들어와도 지운다.
  it.each([
    ['문자열', 'product 7590830589 review 1020990898 failed 리뷰 본문'],
    ['빈 문자열', ''],
    ['숫자', 1234567890],
    ['null', null],
    ['객체', { text: '리뷰 본문' }],
  ])('track 에 error_message(%s)가 들어와도 최종 페이로드에 키가 없다', async (_label, value) => {
    const { track } = await loadTrack('device-abc')
    await track('Extension Error', { error_type: 'RenderException', error_name: 'TypeError', error_message: value })

    expect(sent).toHaveLength(1)
    const props = sent[0].events[0].event_properties
    expect('error_message' in props).toBe(false)
    expect(props.error_type).toBe('RenderException')
    expect(props.error_name).toBe('TypeError')
    const body = JSON.stringify(sent[0])
    expect(body).not.toContain('error_message')
    expect(body).not.toContain('7590830589')
    expect(body).not.toContain('리뷰 본문')
  })

  // 콘텐츠 스크립트가 이미 걸러 보내지만, 메시지는 신뢰 경계 밖에서 오므로 백그라운드가 한 번 더 본다.
  it.each([
    ['공백과 숫자가 섞인 문자열', '리뷰 본문 7590830589'],
    ['41자', 'A'.repeat(41)],
    ['빈 문자열', ''],
    ['숫자', 7590830589],
    ['null', null],
    ['객체', { text: '리뷰 본문' }],
  ])('track 에 고정된 모양이 아닌 error_name(%s)이 들어오면 Unknown 으로 바꿔 보낸다', async (_label, value) => {
    const { track } = await loadTrack('device-abc')
    await track('Extension Error', { error_type: 'RenderException', error_name: value })

    expect(sent).toHaveLength(1)
    const props = sent[0].events[0].event_properties
    expect(props.error_name).toBe('Unknown')
    expect(props.error_type).toBe('RenderException')
    const body = JSON.stringify(sent[0])
    expect(body).not.toContain('7590830589')
    expect(body).not.toContain('리뷰 본문')
  })

  it('영문자만 1~40자인 error_name 은 그대로 보낸다', async () => {
    for (const name of ['TypeError', 'A'.repeat(40)]) {
      const props = await trackedProps('device-abc', { error_type: 'RenderException', error_name: name })
      expect(props.error_name).toBe(name)
    }
  })

  it('error_name 이 없는 이벤트에는 키를 만들지 않는다', async () => {
    const props = await trackedProps('device-abc', { error_type: 'ReviewContainerNotFound' })
    expect('error_name' in props).toBe(false)
  })

  // 쇼핑몰 구분도 메시지로 들어온다. 목록에 없는 값은 그대로 내보내지 않는다.
  it.each([
    ['목록에 없는 문자열', 'evil<script>'],
    ['대문자가 섞인 값', 'Coupang'],
    ['빈 문자열', ''],
    ['null', null],
    ['객체', { text: '리뷰 본문' }],
  ])('track 에 목록에 없는 site(%s)가 들어오면 unknown 으로 바꿔 보낸다', async (_label, value) => {
    const { track } = await loadTrack('device-abc')
    await track('Banner Rendered', { site: value, review_sort: 'best' })

    expect(sent).toHaveLength(1)
    const props = sent[0].events[0].event_properties
    expect(props.site).toBe('unknown')
    expect(props.review_sort).toBe('best')
    const body = JSON.stringify(sent[0])
    expect(body).not.toContain('evil')
    expect(body).not.toContain('리뷰 본문')
  })

  it.each(['coupang', 'musinsa'])('목록에 있는 site(%s)는 그대로 보낸다', async (id) => {
    const props = await trackedProps('device-abc', { site: id })
    expect(props.site).toBe(id)
  })

  it('site 가 없는 이벤트에는 키를 만들지 않는다', async () => {
    const props = await trackedProps('device-abc', { consent_source: 'onboarding' })
    expect('site' in props).toBe(false)
  })

  it('표에 없는 _id 접미사 키는 제거하고 키 이름만 경고한다(실패 시 닫힘)', async () => {
    const props = await trackedProps('device-abc', {
      review_sort: 'best',
      seller_id: '3000111222',
      NewThing_ID: 'abc-secret-value',
    })

    expect('seller_id' in props).toBe(false)
    expect('NewThing_ID' in props).toBe(false)
    expect(props.review_sort).toBe('best')
    const warned = JSON.stringify(console.warn.mock.calls)
    expect(warned).toContain('seller_id')
    expect(warned).not.toContain('3000111222')
    expect(warned).not.toContain('abc-secret-value')
  })

  it('표에 있는 식별자는 해시로 바뀌어 남고 최종 페이로드에 _id 접미사 키는 하나도 없다', async () => {
    const props = await trackedProps('device-abc', {
      product_id: RAW_PRODUCT_ID,
      page_first_review_id: RAW_REVIEW_ID,
      seller_id: '3000111222',
      review_sort: 'best',
    })

    expect(props.product_key).toMatch(/^[0-9a-f]{16}$/)
    expect(props.page_key).toMatch(/^[0-9a-f]{16}$/)
    expect(Object.keys(props).filter((key) => /_id$/i.test(key))).toEqual([])
  })
})

describe('track 의 전송 직전 동의 재확인', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('페이로드를 준비하는 도중 동의가 철회되면 보내지 않는다', async () => {
    const { track } = await loadTrack('device-abc')
    const { setConsent } = await import('../extension/src/background/consent.js')

    let reached
    const reachedSalt = new Promise((resolve) => {
      reached = resolve
    })
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    interceptSaltRead(async () => {
      reached()
      await gate
    })

    // 앞쪽 게이트는 통과해 솔트 조회까지 진행한 뒤, 풀리기 전에 동의를 철회한다.
    const pending = track('Banner Rendered', { product_id: RAW_PRODUCT_ID })
    await reachedSalt
    await setConsent('denied')
    release()
    await pending

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })
})
