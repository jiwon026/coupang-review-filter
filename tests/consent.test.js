import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installChromeMock, grantConsent, EXTENSION_ORIGIN } from './helpers/chrome-mock.js'

const mockConfig = vi.hoisted(() => ({
  amplitudeApiKey: '0123456789abcdef0123456789abcdef',
  amplitudeEndpoint: 'https://amplitude.test/2/httpapi',
  landingOrigin: 'https://landing.test',
}))

// 실제 키가 든 로컬 설정 파일을 읽지 않도록 설정 모듈을 통째로 대체한다.
vi.mock('../extension/src/shared/config.local.js', () => ({ CONFIG: mockConfig }))

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
    expect(await getConsent()).toEqual({ status: 'undecided', decidedAt: null })
  })

  it('setConsent("granted") 뒤에는 granted 와 그 시각을 돌려준다', async () => {
    const { getConsent, setConsent } = await loadConsent()
    await setConsent('granted', T0)
    expect(await getConsent()).toEqual({ status: 'granted', decidedAt: T0 })
  })

  it('저장값이 알 수 없는 상태면 undecided 로 본다', async () => {
    const { getConsent } = await loadConsent({
      crf_consent: { status: 'maybe', decidedAt: T0, everGranted: true },
    })
    expect(await getConsent()).toEqual({ status: 'undecided', decidedAt: null })
  })
})

describe('setConsent', () => {
  it('첫 granted 는 firstGrant true 이고 시각을 돌려준다', async () => {
    const { setConsent } = await loadConsent()
    expect(await setConsent('granted', T0)).toEqual({ status: 'granted', decidedAt: T0, firstGrant: true })
  })

  it('denied 는 firstGrant false', async () => {
    const { setConsent } = await loadConsent()
    expect((await setConsent('denied', T0)).firstGrant).toBe(false)
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
    expect(response).toEqual({ consent: { status: 'granted', decidedAt: T0 } })
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
    await send('granted')
    await send('denied')
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

  it('GET_CONSENT 는 { consent } 로 응답한다', async () => {
    const { chrome } = await loadBackground()
    const dispatched = dispatch(chrome, { type: 'crf:get-consent' }, extensionSender())
    expect(dispatched.returns).toContain(true)
    expect(await dispatched.response).toEqual({ consent: { status: 'undecided', decidedAt: null } })

    await dispatch(chrome, { type: 'crf:set-consent', status: 'denied', source: 'panel' }, extensionSender())
      .response
    const after = await dispatch(chrome, { type: 'crf:get-consent' }, extensionSender()).response
    expect(after.consent.status).toBe('denied')
  })

  it('GET_CONSENT 는 읽기가 실패해도 정확히 한 번 응답한다', async () => {
    const { chrome } = await loadBackground()
    chrome.storage.local.get = () => Promise.reject(new Error('읽기 실패'))
    const dispatched = dispatch(chrome, { type: 'crf:get-consent' }, extensionSender())
    const response = await dispatched.response
    await flush()
    expect(response).toEqual({ consent: { status: 'undecided', decidedAt: null } })
    expect(dispatched.responses).toHaveLength(1)
  })
})
