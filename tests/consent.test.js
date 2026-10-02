import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installChromeMock, grantConsent, EXTENSION_ORIGIN } from './helpers/chrome-mock.js'

const mockConfig = vi.hoisted(() => ({
  amplitudeApiKey: '0123456789abcdef0123456789abcdef',
  amplitudeEndpoint: 'https://amplitude.test/2/httpapi',
}))

// 사이트 주소는 커밋되는 공개 설정(site.js)에서 온다. 테스트는 그 모듈의 SITE 만 바꿔 끼운다.
const mockSite = vi.hoisted(() => ({
  landingOrigin: 'https://landing.test',
  privacyPath: '/privacy',
  uninstallPath: '/uninstalled',
  exampleProductUrl: 'https://www.coupang.com/vp/products/7590830589',
}))

// 실제 키가 든 로컬 설정 파일을 읽지 않도록 설정 모듈을 통째로 대체한다.
vi.mock('../extension/src/shared/config.local.js', () => ({ CONFIG: mockConfig }))
vi.mock('../extension/src/shared/site.js', async (importOriginal) => ({
  ...(await importOriginal()),
  SITE: mockSite,
}))

const T0 = 1_700_000_000_000
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

let sent = []

function mockFetch() {
  sent = []
  globalThis.fetch = vi.fn(async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return { ok: true, status: 200 }
  })
}

function sentOfType(eventType) {
  return sent.filter((body) => body.events[0].event_type === eventType)
}

async function loadConsent(initial = {}) {
  const store = installChromeMock({ crf_device_id: 'dev-1', ...initial })
  mockFetch()
  vi.resetModules()
  const consent = await import('../extension/src/background/consent.js')
  return { store, ...consent }
}

async function loadTrack(initial = {}) {
  const store = installChromeMock({ crf_device_id: 'dev-1', ...initial })
  mockFetch()
  vi.resetModules()
  const { track } = await import('../extension/src/background/analytics.js')
  const consent = await import('../extension/src/background/consent.js')
  return { store, track, ...consent }
}

async function loadBackground(initial = {}) {
  const store = installChromeMock({ crf_device_id: 'dev-1', ...initial })
  mockFetch()
  vi.resetModules()
  await import('../extension/src/background/index.js')
  await flush()
  return { chrome: globalThis.chrome, store }
}

// 리스너가 true 를 반환하면 비동기 응답을 기다린다. 응답 횟수도 센다.
function dispatch(chrome, message, sender) {
  const responses = []
  let resolveFirst
  const first = new Promise((resolve) => {
    resolveFirst = resolve
  })
  const returns = chrome.__listeners.map((listener) =>
    listener(message, sender, (value) => {
      responses.push(value)
      resolveFirst(value)
    }),
  )
  return { returns, responses, response: first }
}

const extensionSender = (extra = {}) => ({
  id: 'test-extension-id',
  url: `${EXTENSION_ORIGIN}src/onboarding/index.html`,
  ...extra,
})
const contentScriptSender = () => ({
  id: 'test-extension-id',
  tab: { id: 7, windowId: 1 },
  url: 'https://www.coupang.com/vp/products/123456',
})

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getConsent', () => {
  it('저장값이 없으면 undecided 와 null 시각을 돌려준다', async () => {
    const { getConsent } = await loadConsent()
    expect(await getConsent()).toEqual({ status: 'undecided', decidedAt: null, everGranted: false })
  })

  it('setConsent("granted") 뒤에는 granted 와 그 시각을 돌려준다', async () => {
    const { getConsent, setConsent } = await loadConsent()
    await setConsent('granted', T0)
    expect(await getConsent()).toEqual({ status: 'granted', decidedAt: T0, everGranted: true })
  })

  it('저장값이 알 수 없는 상태면 undecided 로 본다(동의한 적이 있다는 기록은 그대로 읽는다)', async () => {
    const { getConsent } = await loadConsent({
      crf_consent: { status: 'maybe', decidedAt: T0, everGranted: true },
    })
    expect(await getConsent()).toEqual({ status: 'undecided', decidedAt: null, everGranted: true })
  })

  it('everGranted 는 한 번이라도 동의했는지다. 거절만 했으면 false, 동의했다가 꺼도 true', async () => {
    const { getConsent, setConsent } = await loadConsent()
    await setConsent('denied', T0)
    expect((await getConsent()).everGranted).toBe(false)
    await setConsent('granted', T0 + 1)
    await setConsent('denied', T0 + 2)
    expect(await getConsent()).toEqual({ status: 'denied', decidedAt: T0 + 2, everGranted: true })
  })

  it('everGranted 저장값이 true 가 아니면(없거나 다른 형) false 로 본다', async () => {
    const { getConsent } = await loadConsent({ crf_consent: { status: 'denied', decidedAt: T0, everGranted: 'yes' } })
    expect((await getConsent()).everGranted).toBe(false)
  })
})

describe('setConsent', () => {
  it('첫 granted 는 firstGrant true 이고 시각을 돌려준다', async () => {
    const { setConsent } = await loadConsent()
    expect(await setConsent('granted', T0)).toEqual({
      status: 'granted',
      decidedAt: T0,
      firstGrant: true,
      everGranted: true,
    })
  })

  it('denied 는 firstGrant false 이고, 동의한 적이 없으면 everGranted 도 false', async () => {
    const { setConsent } = await loadConsent()
    expect(await setConsent('denied', T0)).toEqual({
      status: 'denied',
      decidedAt: T0,
      firstGrant: false,
      everGranted: false,
    })
  })

  it('동의했다가 끄면 everGranted 는 true 로 남는다', async () => {
    const { setConsent } = await loadConsent()
    await setConsent('granted', T0)
    expect((await setConsent('denied', T0 + 1)).everGranted).toBe(true)
  })

  it('denied 뒤에 다시 granted 해도 firstGrant 는 false', async () => {
    const { setConsent } = await loadConsent()
    expect((await setConsent('granted', T0)).firstGrant).toBe(true)
    expect((await setConsent('denied', T0 + 1)).firstGrant).toBe(false)
    expect((await setConsent('granted', T0 + 2)).firstGrant).toBe(false)
  })

  it('워커가 재시작돼도(모듈 다시 불러오기, 저장소 유지) firstGrant 는 false', async () => {
    const first = await loadConsent()
    expect((await first.setConsent('granted', T0)).firstGrant).toBe(true)
    await first.setConsent('denied', T0 + 1)

    vi.resetModules()
    const restarted = await import('../extension/src/background/consent.js')
    expect((await restarted.setConsent('granted', T0 + 2)).firstGrant).toBe(false)
  })

  it('동시에 granted 를 두 번 불러도 firstGrant 는 한 번만 true', async () => {
    const { setConsent } = await loadConsent()
    const results = await Promise.all([setConsent('granted', T0), setConsent('granted', T0 + 1)])
    expect(results.filter((result) => result.firstGrant)).toHaveLength(1)
  })

  it('granted 와 denied 밖의 값은 던진다', async () => {
    const { setConsent, getConsent } = await loadConsent()
    await expect(setConsent('maybe', T0)).rejects.toThrow()
    await expect(setConsent('undecided', T0)).rejects.toThrow()
    expect((await getConsent()).status).toBe('undecided')
  })
})

describe('isCollectionAllowed', () => {
  it('granted 에서만 true', async () => {
    const { isCollectionAllowed, setConsent } = await loadConsent()
    expect(await isCollectionAllowed()).toBe(false)
    await setConsent('denied', T0)
    expect(await isCollectionAllowed()).toBe(false)
    await setConsent('granted', T0 + 1)
    expect(await isCollectionAllowed()).toBe(true)
  })
})

describe('track 의 동의 게이트', () => {
  it('undecided 에서는 fetch 를 부르지 않는다', async () => {
    const { track } = await loadTrack()
    await track('Banner Rendered')
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('denied 에서는 fetch 를 부르지 않는다', async () => {
    const { track, setConsent } = await loadTrack()
    await setConsent('denied', T0)
    await track('Banner Rendered')
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('granted 에서는 fetch 를 한 번 부른다', async () => {
    const { track, setConsent } = await loadTrack()
    await setConsent('granted', T0)
    await track('Banner Rendered')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('granted 였다가 denied 로 바꾸면 그 뒤로는 fetch 를 부르지 않는다', async () => {
    const { track, setConsent } = await loadTrack()
    await setConsent('granted', T0)
    await track('Banner Rendered')
    await setConsent('denied', T0 + 1)
    await track('Banner Rendered')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('미동의 상태의 이벤트는 쌓아 두었다가 나중에 보내지도 않는다', async () => {
    const { track, setConsent } = await loadTrack()
    await track('Banner Rendered')
    await setConsent('granted', T0)
    await flush()
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('미동의 상태에서는 경고도 찍지 않는다(정상 상태)', async () => {
    const { track } = await loadTrack()
    await track('Banner Rendered')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('동의 저장소 읽기가 실패하면 fetch 를 부르지 않는다(실패 시 닫힘)', async () => {
    const { track, store } = await loadTrack()
    grantConsent(store)
    const originalGet = chrome.storage.local.get
    chrome.storage.local.get = (keys) =>
      (Array.isArray(keys) ? keys : [keys]).includes('crf_consent')
        ? Promise.reject(new Error('읽기 실패'))
        : originalGet(keys)
    await track('Banner Rendered')
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })
})

describe('SET_CONSENT 와 GET_CONSENT 메시지', () => {
  it('확장 페이지의 granted 는 상태를 바꾸고 Extension Installed 1건을 보낸다', async () => {
    const { chrome, store } = await loadBackground({ crf_installed_at: T0 - 90_400 })
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    const dispatched = dispatch(
      chrome,
      { type: 'crf:set-consent', status: 'granted', source: 'onboarding' },
      extensionSender(),
    )
    const response = await dispatched.response
    await flush()

    expect(dispatched.returns).toContain(true)
    expect(response).toEqual({ consent: { status: 'granted', decidedAt: T0, deviceId: 'dev-1' } })
    expect(store.crf_consent.status).toBe('granted')
    const installed = sentOfType('Extension Installed')
    expect(installed).toHaveLength(1)
    expect(installed[0].events[0].event_properties.consent_source).toBe('onboarding')
    expect(installed[0].events[0].event_properties.seconds_since_install).toBe(90)
  })

  it('설치 시각이 없으면 seconds_since_install 은 null', async () => {
    const { chrome } = await loadBackground()
    await dispatch(chrome, { type: 'crf:set-consent', status: 'granted', source: 'panel' }, extensionSender())
      .response
    await flush()

    const props = sentOfType('Extension Installed')[0].events[0].event_properties
    expect(props.consent_source).toBe('panel')
    expect(props.seconds_since_install).toBeNull()
  })

  it('source 가 onboarding 과 panel 밖이면 unknown 으로 기록한다', async () => {
    const { chrome } = await loadBackground()
    await dispatch(chrome, { type: 'crf:set-consent', status: 'granted', source: 'hacker' }, extensionSender())
      .response
    await flush()
    expect(sentOfType('Extension Installed')[0].events[0].event_properties.consent_source).toBe('unknown')
  })

  it('tab 이 있는 확장 페이지 발신(탭으로 열린 온보딩)도 받는다', async () => {
    const { chrome } = await loadBackground()
    const response = await dispatch(
      chrome,
      { type: 'crf:set-consent', status: 'granted', source: 'onboarding' },
      extensionSender({ tab: { id: 9, windowId: 1 } }),
    ).response
    expect(response.consent.status).toBe('granted')
  })

  it('껐다가 다시 켜도 Extension Installed 는 총 1건', async () => {
    const { chrome } = await loadBackground()
    const send = (status) =>
      dispatch(chrome, { type: 'crf:set-consent', status, source: 'panel' }, extensionSender()).response
    // 첫 동의의 이벤트는 응답과 나란히 나간다. 사용자가 다시 누를 때까지의 시간만큼 기다린다.
    await send('granted')
    await flush()
    expect(sentOfType('Extension Installed')).toHaveLength(1)
    await send('denied')
    await flush()
    await send('granted')
    await flush()

    expect(sentOfType('Extension Installed')).toHaveLength(1)
  })

  it('denied 는 이벤트를 보내지 않는다', async () => {
    const { chrome, store } = await loadBackground()
    const response = await dispatch(
      chrome,
      { type: 'crf:set-consent', status: 'denied', source: 'onboarding' },
      extensionSender(),
    ).response
    await flush()

    expect(response.consent.status).toBe('denied')
    expect(store.crf_consent.status).toBe('denied')
    expect(sent).toHaveLength(0)
  })

  it('콘텐츠 스크립트 발신은 invalid 로 응답하고 상태를 바꾸지 않는다', async () => {
    const { chrome, store } = await loadBackground()
    const dispatched = dispatch(
      chrome,
      { type: 'crf:set-consent', status: 'granted', source: 'onboarding' },
      contentScriptSender(),
    )
    const response = await dispatched.response
    await flush()

    expect(response).toEqual({ error: 'invalid' })
    expect('crf_consent' in store).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('발신자 url 이 없어도 invalid', async () => {
    const { chrome, store } = await loadBackground()
    const response = await dispatch(chrome, { type: 'crf:set-consent', status: 'granted' }, {}).response
    expect(response).toEqual({ error: 'invalid' })
    expect('crf_consent' in store).toBe(false)
  })

  it('status 가 granted 나 denied 가 아니면 invalid 이고 상태는 그대로', async () => {
    const { chrome, store } = await loadBackground()
    for (const status of ['maybe', 'undecided', undefined]) {
      const response = await dispatch(
        chrome,
        { type: 'crf:set-consent', status, source: 'panel' },
        extensionSender(),
      ).response
      expect(response).toEqual({ error: 'invalid' })
    }
    expect('crf_consent' in store).toBe(false)
  })

  it('동의가 바뀔 때마다 제거 주소를 다시 설정한다', async () => {
    const { chrome } = await loadBackground()
    const before = chrome.__calls.setUninstallURL.length
    await dispatch(chrome, { type: 'crf:set-consent', status: 'granted', source: 'panel' }, extensionSender())
      .response
    await flush()
    await dispatch(chrome, { type: 'crf:set-consent', status: 'denied', source: 'panel' }, extensionSender())
      .response
    await flush()
    expect(chrome.__calls.setUninstallURL.length - before).toBe(2)
  })

  it('저장이 실패해도 응답은 정확히 한 번 보낸다', async () => {
    const { chrome } = await loadBackground()
    chrome.storage.local.set = () => Promise.reject(new Error('저장 실패'))
    const dispatched = dispatch(
      chrome,
      { type: 'crf:set-consent', status: 'granted', source: 'panel' },
      extensionSender(),
    )
    const response = await dispatched.response
    await flush()

    expect(response).toEqual({ error: 'failed' })
    expect(dispatched.responses).toHaveLength(1)
  })

  it('저장에 성공하면 CONSENT_CHANGED 를 새 상태로 정확히 1건 알린다', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    const { chrome } = await loadBackground()
    await dispatch(chrome, { type: 'crf:set-consent', status: 'granted', source: 'panel' }, extensionSender())
      .response
    await flush()

    expect(chrome.__calls.runtimeSent).toEqual([
      { type: 'crf:consent-changed', consent: { status: 'granted', decidedAt: T0, deviceId: 'dev-1' } },
    ])

    await dispatch(chrome, { type: 'crf:set-consent', status: 'denied', source: 'panel' }, extensionSender())
      .response
    await flush()
    expect(chrome.__calls.runtimeSent).toHaveLength(2)
    expect(chrome.__calls.runtimeSent[1].consent.status).toBe('denied')
  })

  it('검증 실패(잘못된 값, 콘텐츠 스크립트 발신)에서는 CONSENT_CHANGED 를 알리지 않는다', async () => {
    const { chrome } = await loadBackground()
    await dispatch(chrome, { type: 'crf:set-consent', status: 'maybe', source: 'panel' }, extensionSender()).response
    await dispatch(chrome, { type: 'crf:set-consent', status: 'granted', source: 'panel' }, contentScriptSender())
      .response
    await flush()
    expect(chrome.__calls.runtimeSent).toHaveLength(0)
  })

  it('저장 실패에서는 CONSENT_CHANGED 를 알리지 않는다', async () => {
    const { chrome } = await loadBackground()
    chrome.storage.local.set = () => Promise.reject(new Error('저장 실패'))
    await dispatch(chrome, { type: 'crf:set-consent', status: 'granted', source: 'panel' }, extensionSender())
      .response
    await flush()
    expect(chrome.__calls.runtimeSent).toHaveLength(0)
  })

  it.each([
    ['동기 예외', () => { throw new Error('Extension context invalidated.') }],
    ['Promise 거부(받는 쪽 없음)', () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'))],
  ])('알림 전송이 실패(%s)해도 응답, 제거 주소 갱신, Extension Installed 는 정상이다', async (_label, failing) => {
    const { chrome, store } = await loadBackground({ crf_installed_at: T0 - 1000 })
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    chrome.runtime.sendMessage = failing
    const before = chrome.__calls.setUninstallURL.length

    const dispatched = dispatch(
      chrome,
      { type: 'crf:set-consent', status: 'granted', source: 'panel' },
      extensionSender(),
    )
    const response = await dispatched.response
    await flush()

    expect(response).toEqual({ consent: { status: 'granted', decidedAt: T0, deviceId: 'dev-1' } })
    expect(dispatched.responses).toHaveLength(1)
    expect(store.crf_consent.status).toBe('granted')
    expect(chrome.__calls.setUninstallURL.length - before).toBe(1)
    expect(sentOfType('Extension Installed')).toHaveLength(1)
  })

  it('제거 주소 설정이 끝나지 않아도 첫 동의의 Extension Installed 는 나간다(기다리지 않고 먼저 시작한다)', async () => {
    const { chrome } = await loadBackground({ crf_installed_at: T0 - 1000 })
    chrome.runtime.setUninstallURL = () => new Promise(() => {})

    await dispatch(chrome, { type: 'crf:set-consent', status: 'granted', source: 'onboarding' }, extensionSender())
      .response
    await flush()
    await flush()

    expect(sentOfType('Extension Installed')).toHaveLength(1)
  })

  it('Extension Installed 의 time 과 seconds_since_install 은 동의 저장 시각(decidedAt) 기준이다', async () => {
    const { chrome, store } = await loadBackground({ crf_installed_at: T0 - 90_400 })
    // 부를 때마다 1초씩 가는 시계. 저장 뒤에 시각을 다시 읽으면 decidedAt 과 달라진다.
    let clock = T0
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000))

    const response = await dispatch(
      chrome,
      { type: 'crf:set-consent', status: 'granted', source: 'onboarding' },
      extensionSender(),
    ).response
    await flush()
    await flush()

    const decidedAt = store.crf_consent.decidedAt
    expect(response.consent.decidedAt).toBe(decidedAt)
    const installed = sentOfType('Extension Installed')
    expect(installed).toHaveLength(1)
    expect(installed[0].events[0].time).toBe(decidedAt)
    expect(installed[0].events[0].event_properties.seconds_since_install).toBe(
      Math.round((decidedAt - (T0 - 90_400)) / 1000),
    )
  })

  it('백그라운드는 CONSENT_CHANGED 에 응답하지 않는다', async () => {
    const { chrome } = await loadBackground()
    const dispatched = dispatch(
      chrome,
      { type: 'crf:consent-changed', consent: { status: 'granted', decidedAt: T0 } },
      extensionSender(),
    )
    await flush()
    expect(dispatched.returns.every((value) => value === false || value === undefined)).toBe(true)
    expect(dispatched.responses).toHaveLength(0)
  })

  it('GET_CONSENT 는 { consent } 로 응답한다', async () => {
    const { chrome } = await loadBackground()
    const dispatched = dispatch(chrome, { type: 'crf:get-consent' }, extensionSender())
    expect(dispatched.returns).toContain(true)
    expect(await dispatched.response).toEqual({ consent: { status: 'undecided', decidedAt: null, deviceId: null } })

    await dispatch(chrome, { type: 'crf:set-consent', status: 'denied', source: 'panel' }, extensionSender())
      .response
    const after = await dispatch(chrome, { type: 'crf:get-consent' }, extensionSender()).response
    expect(after.consent.status).toBe('denied')
  })

  it('GET_CONSENT 는 읽기가 실패해도 정확히 한 번 응답하고 실패 표지를 단다', async () => {
    const { chrome } = await loadBackground()
    chrome.storage.local.get = () => Promise.reject(new Error('읽기 실패'))
    const dispatched = dispatch(chrome, { type: 'crf:get-consent' }, extensionSender())
    const response = await dispatched.response
    await flush()
    expect(response).toEqual({ consent: { status: 'undecided', decidedAt: null, deviceId: null }, error: 'failed' })
    expect(dispatched.responses).toHaveLength(1)
  })

  it('GET_CONSENT 는 읽기에 성공하면 error 필드를 싣지 않는다', async () => {
    const { chrome } = await loadBackground()
    const response = await dispatch(chrome, { type: 'crf:get-consent' }, extensionSender()).response
    expect('error' in response).toBe(false)
  })

  it('다른 확장 id 의 페이지에서 온 SET_CONSENT 는 invalid 이고 상태를 바꾸지 않는다', async () => {
    const { chrome, store } = await loadBackground()
    const response = await dispatch(
      chrome,
      { type: 'crf:set-consent', status: 'granted', source: 'onboarding' },
      { id: 'other-extension-id', url: 'chrome-extension://other-extension-id/src/onboarding/index.html' },
    ).response
    await flush()

    expect(response).toEqual({ error: 'invalid' })
    expect('crf_consent' in store).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('id 가 같은 접두사로 시작하는 다른 확장의 주소도 invalid', async () => {
    const { chrome, store } = await loadBackground()
    const response = await dispatch(
      chrome,
      { type: 'crf:set-consent', status: 'granted', source: 'onboarding' },
      { url: 'chrome-extension://test-extension-id-evil/src/onboarding/index.html' },
    ).response
    expect(response).toEqual({ error: 'invalid' })
    expect('crf_consent' in store).toBe(false)
  })
})

// 삭제 요청에 쓰는 익명 기기 번호. 보낸 데이터가 있을 수 있는 사용자(한 번이라도 동의)에게만 알려 준다.
describe('동의 응답의 기기 번호(deviceId)', () => {
  const getConsentReply = (chrome) => dispatch(chrome, { type: 'crf:get-consent' }, extensionSender()).response
  const setConsentReply = (chrome, status) =>
    dispatch(chrome, { type: 'crf:set-consent', status, source: 'panel' }, extensionSender()).response

  it('한 번도 동의하지 않았으면(undecided) GET_CONSENT 의 deviceId 는 null 이고 기기 번호를 만들지도 않는다', async () => {
    const { chrome, store } = await loadBackground()
    delete store.crf_device_id

    const response = await getConsentReply(chrome)
    await flush()

    expect(response.consent.deviceId).toBeNull()
    expect('crf_device_id' in store).toBe(false)
  })

  it('거절만 한 사용자는 저장된 기기 번호가 있어도 GET_CONSENT, SET_CONSENT 응답, CONSENT_CHANGED 모두 deviceId 가 null 이다', async () => {
    const { chrome, store } = await loadBackground()
    expect(store.crf_device_id).toBe('dev-1')

    const saved = await setConsentReply(chrome, 'denied')
    await flush()
    const read = await getConsentReply(chrome)

    expect(saved.consent).toEqual({ status: 'denied', decidedAt: expect.any(Number), deviceId: null })
    expect(read.consent).toEqual({ status: 'denied', decidedAt: expect.any(Number), deviceId: null })
    expect(chrome.__calls.runtimeSent).toHaveLength(1)
    expect(chrome.__calls.runtimeSent[0].consent.deviceId).toBeNull()
  })

  it('동의한 상태에서는 GET_CONSENT 응답에 deviceId 가 실린다', async () => {
    const { chrome } = await loadBackground({ crf_consent: { status: 'granted', decidedAt: T0, everGranted: true } })
    expect((await getConsentReply(chrome)).consent).toEqual({ status: 'granted', decidedAt: T0, deviceId: 'dev-1' })
  })

  it('동의했다가 끈 상태(denied)에서도 GET_CONSENT, SET_CONSENT 응답, CONSENT_CHANGED 에 deviceId 가 실린다', async () => {
    const { chrome } = await loadBackground({ crf_consent: { status: 'granted', decidedAt: T0, everGranted: true } })

    const saved = await setConsentReply(chrome, 'denied')
    await flush()
    const read = await getConsentReply(chrome)

    expect(saved.consent.status).toBe('denied')
    expect(saved.consent.deviceId).toBe('dev-1')
    expect(read.consent.status).toBe('denied')
    expect(read.consent.deviceId).toBe('dev-1')
    expect(chrome.__calls.runtimeSent.at(-1).consent).toEqual({
      status: 'denied',
      decidedAt: expect.any(Number),
      deviceId: 'dev-1',
    })
  })

  it('기기 번호를 읽지 못해도 정확히 한 번 응답하고 deviceId 는 null 이다', async () => {
    const { chrome } = await loadBackground({ crf_consent: { status: 'denied', decidedAt: T0, everGranted: true } })
    const originalGet = chrome.storage.local.get
    chrome.storage.local.get = (keys) =>
      (Array.isArray(keys) ? keys : [keys]).includes('crf_device_id')
        ? Promise.reject(new Error('읽기 실패'))
        : originalGet(keys)

    const dispatched = dispatch(chrome, { type: 'crf:get-consent' }, extensionSender())
    const response = await dispatched.response
    await flush()

    expect(response).toEqual({ consent: { status: 'denied', decidedAt: T0, deviceId: null } })
    expect(dispatched.responses).toHaveLength(1)
  })

  // 저장소는 TRUSTED_CONTEXTS 로 닫혀 있다. 이 응답이 그 경계를 우회해 쿠팡 페이지 안의 코드에 번호를 주면 안 된다.
  describe('GET_CONSENT 의 발신자', () => {
    const everGranted = (status) => ({ crf_consent: { status, decidedAt: T0, everGranted: true } })
    const getConsentFrom = (chrome, sender) => dispatch(chrome, { type: 'crf:get-consent' }, sender)

    it.each(['granted', 'denied'])('확장 페이지 발신에는 번호를 준다(%s)', async (status) => {
      const { chrome } = await loadBackground(everGranted(status))
      expect((await getConsentFrom(chrome, extensionSender()).response).consent).toEqual({
        status,
        decidedAt: T0,
        deviceId: 'dev-1',
      })
    })

    it('탭으로 열린 확장 페이지(온보딩) 발신에도 번호를 준다', async () => {
      const { chrome } = await loadBackground(everGranted('granted'))
      const response = await getConsentFrom(chrome, extensionSender({ tab: { id: 9, windowId: 1 } })).response
      expect(response.consent.deviceId).toBe('dev-1')
    })

    it.each(['granted', 'denied'])(
      '콘텐츠 스크립트 발신에는 deviceId 가 null 이고 status 와 decidedAt 은 그대로 준다(%s)',
      async (status) => {
        const { chrome } = await loadBackground(everGranted(status))
        const dispatched = getConsentFrom(chrome, contentScriptSender())
        const response = await dispatched.response
        await flush()

        expect(response).toEqual({ consent: { status, decidedAt: T0, deviceId: null } })
        expect(dispatched.responses).toHaveLength(1)
        expect(JSON.stringify(response)).not.toContain('dev-1')
      },
    )

    it.each([
      ['다른 확장 id 의 주소', { id: 'other-extension-id', url: 'chrome-extension://other-extension-id/src/sidepanel/index.html' }],
      ['id 가 같은 접두사로 시작하는 다른 확장', { url: 'chrome-extension://test-extension-id-evil/src/sidepanel/index.html' }],
      ['주소 없는 발신자', { id: 'test-extension-id' }],
      ['발신자 없음', undefined],
    ])('%s 에는 deviceId 가 null 이다', async (_label, sender) => {
      const { chrome } = await loadBackground(everGranted('granted'))
      const response = await getConsentFrom(chrome, sender).response
      expect(response.consent).toEqual({ status: 'granted', decidedAt: T0, deviceId: null })
    })

    it('콘텐츠 스크립트 발신에는 기기 번호를 읽지도 만들지도 않는다', async () => {
      const { chrome, store } = await loadBackground(everGranted('denied'))
      delete store.crf_device_id

      const response = await getConsentFrom(chrome, contentScriptSender()).response
      await flush()

      expect(response.consent.deviceId).toBeNull()
      expect('crf_device_id' in store).toBe(false)
    })
  })

  it('기기 번호는 이벤트 프로퍼티에 새로 실리지 않는다', async () => {
    const { chrome } = await loadBackground()
    await setConsentReply(chrome, 'granted')
    await flush()
    await flush()

    expect(sent.length).toBeGreaterThan(0)
    for (const body of sent) {
      expect(JSON.stringify(body.events[0].event_properties)).not.toContain('dev-1')
    }
  })
})

describe('TRACK 메시지 경로의 동의 게이트', () => {
  const trackMessage = { type: 'crf:track', eventType: 'Banner Rendered', properties: { review_sort: 'BEST' } }

  it('undecided 에서는 fetch 를 부르지 않는다', async () => {
    const { chrome } = await loadBackground()
    dispatch(chrome, trackMessage, contentScriptSender())
    await flush()
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('denied 에서는 fetch 를 부르지 않는다', async () => {
    const { chrome, store } = await loadBackground({
      crf_consent: { status: 'denied', decidedAt: T0, everGranted: false },
    })
    expect(store.crf_consent.status).toBe('denied')
    dispatch(chrome, trackMessage, contentScriptSender())
    await flush()
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('granted 에서는 fetch 를 한 번 부른다', async () => {
    const { chrome } = await loadBackground({
      crf_consent: { status: 'granted', decidedAt: T0, everGranted: true },
    })
    dispatch(chrome, trackMessage, contentScriptSender())
    await flush()
    await flush()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('TRACK 메시지와 이벤트 시각', () => {
  // 시각 지정은 백그라운드 내부 호출만 쓴다. 페이지가 보낸 메시지로는 이벤트 시각을 조작할 수 없다.
  it.each([
    ['확장 페이지', () => extensionSender()],
    ['콘텐츠 스크립트', () => contentScriptSender()],
  ])('%s 가 TRACK 에 time 을 실어 보내도 무시하고 백그라운드 시계를 쓴다', async (_label, sender) => {
    const { chrome } = await loadBackground({
      crf_consent: { status: 'granted', decidedAt: T0, everGranted: true },
    })
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 777)
    const forged = 1_000_000_000_000
    dispatch(
      chrome,
      {
        type: 'crf:track',
        eventType: 'Onboarding Viewed',
        properties: { example_shown: true },
        time: forged,
        options: { time: forged },
      },
      sender(),
    )
    await flush()
    await flush()

    expect(sent).toHaveLength(1)
    expect(sent[0].events[0].time).toBe(T0 + 777)
    expect(sent[0].events[0].session_id).toBe(T0 + 777)
    expect(JSON.stringify(sent[0])).not.toContain(String(forged))
  })
})

describe('저장소 접근 수준', () => {
  it('백그라운드를 불러오면 storage.local.setAccessLevel 을 TRUSTED_CONTEXTS 로 1회 부른다', async () => {
    const { chrome } = await loadBackground()
    expect(chrome.__calls.setAccessLevel).toEqual([{ accessLevel: 'TRUSTED_CONTEXTS' }])
  })

  it('호출이 거부돼도 경고만 하고 리스너 등록까지 끝난다', async () => {
    installChromeMock({ crf_device_id: 'dev-1' })
    chrome.storage.local.setAccessLevel = () => Promise.reject(new Error('거부'))
    mockFetch()
    vi.resetModules()
    await import('../extension/src/background/index.js')
    await flush()

    expect(chrome.__listeners).toHaveLength(1)
    expect(chrome.__installedListeners).toHaveLength(1)
    expect(console.warn).toHaveBeenCalled()
  })

  it('setAccessLevel 이 동기적으로 던져도(지원하지 않는 크롬) 리스너 등록까지 끝난다', async () => {
    installChromeMock({ crf_device_id: 'dev-1' })
    chrome.storage.local.setAccessLevel = () => {
      throw new Error('동기 예외')
    }
    mockFetch()
    vi.resetModules()
    await import('../extension/src/background/index.js')
    await flush()

    expect(chrome.__listeners).toHaveLength(1)
    expect(console.warn).toHaveBeenCalled()
  })
})
