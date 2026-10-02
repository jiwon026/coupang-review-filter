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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

let sent = []

// consent 는 'granted'(기본), 'denied', 'undecided' 중 하나다.
async function loadBackground(initial = {}, consent = 'granted') {
  // 기본은 동의한 상태로 시작한다. 설치만으로는 동의 여부와 무관하게 아무것도 보내지 않음을 검증하기 위해서다.
  const store = installChromeMock({ crf_device_id: 'dev-1', ...initial })
  if (consent === 'granted') grantConsent(store)
  if (consent === 'denied') store.crf_consent = { status: 'denied', decidedAt: 1_700_000_000_000, everGranted: true }
  sent = []
  globalThis.fetch = vi.fn(async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return { ok: true, status: 200 }
  })
  vi.resetModules()
  await import('../extension/src/background/index.js')
  await flush()
  return { chrome: globalThis.chrome, store }
}

// SET_CONSENT 를 확장 페이지 발신으로 보낸다. respond 로 응답 콜백을 바꿔 끼울 수 있다.
function sendSetConsent(chrome, status, respond = () => {}) {
  const sender = { id: 'test-extension-id', url: `${EXTENSION_ORIGIN}src/onboarding/index.html` }
  const message = { type: 'crf:set-consent', status, source: 'panel' }
  for (const listener of chrome.__listeners) listener(message, sender, respond)
}

const lastUninstallUrl = (chrome) => new URL(chrome.__calls.setUninstallURL.at(-1))

// d(기기 번호)와 i(설치 시각)는 쿼리가 아니라 조각에 실린다. 조각은 서버로 전송되지 않는다. 쿼리에는 v 만 있다.
const frag = (url) => new URLSearchParams(url.hash.slice(1))
const queryKeys = (url) => [...url.searchParams.keys()]

// 미동의 사용자의 주소: 조각이 없고 쿼리에는 v 만 있다.
function expectNoIdentifiers(url) {
  expect(url.href).not.toContain('#')
  expect(url.hash).toBe('')
  expect(queryKeys(url)).toEqual(['v'])
}

async function fireInstalled(chrome, details) {
  for (const listener of chrome.__installedListeners) listener(details)
  await flush()
}

function sentOfType(eventType) {
  return sent.filter((body) => body.events[0].event_type === eventType)
}

describe('설치', () => {
  beforeEach(() => {
    mockSite.landingOrigin = 'https://landing.test'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('onInstalled 리스너를 최상위에서 동기적으로 등록한다', async () => {
    const { chrome } = await loadBackground()
    expect(chrome.__installedListeners).toHaveLength(1)
  })

  it('reason 이 install 이면 설치 시각을 저장하고 아무것도 보내지 않는다', async () => {
    const { chrome, store } = await loadBackground()
    const before = Date.now()
    await fireInstalled(chrome, { reason: 'install' })

    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
    expect(sentOfType('Extension Installed')).toHaveLength(0)
    expect(store.crf_installed_at).toBeGreaterThanOrEqual(before)
    expect(store.crf_installed_at).toBeLessThanOrEqual(Date.now())
  })

  it('reason 이 update 면 아무것도 기록하지 않는다', async () => {
    const { chrome, store } = await loadBackground()
    await fireInstalled(chrome, { reason: 'update' })

    expect(sentOfType('Extension Installed')).toHaveLength(0)
    expect('crf_installed_at' in store).toBe(false)
  })

  it('reason 이 chrome_update 면 아무것도 기록하지 않는다', async () => {
    const { chrome, store } = await loadBackground()
    await fireInstalled(chrome, { reason: 'chrome_update' })

    expect(sentOfType('Extension Installed')).toHaveLength(0)
    expect('crf_installed_at' in store).toBe(false)
  })

  it('설치 직후 제거 주소를 다시 설정하고 설치 시각 i 를 싣는다', async () => {
    const { chrome, store } = await loadBackground()
    expect(chrome.__calls.setUninstallURL).toHaveLength(1)
    expect(frag(new URL(chrome.__calls.setUninstallURL[0])).has('i')).toBe(false)

    await fireInstalled(chrome, { reason: 'install' })

    expect(chrome.__calls.setUninstallURL).toHaveLength(2)
    const url = new URL(chrome.__calls.setUninstallURL[1])
    expect(frag(url).get('i')).toBe(String(store.crf_installed_at))
  })

  it('시작 시 설정과 설치 시 설정이 겹쳐도 마지막 setUninstallURL 에 i 가 실린다', async () => {
    // i 는 동의한 경우에만 실리므로 동의한 상태로 준비한다.
    const store = grantConsent(installChromeMock({ crf_device_id: 'dev-1' }))
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200 }))
    // 워커 시작 때의 설정이 설치 시각을 비어 있는 상태로 읽은 뒤 늦게 끝나는 상황을 만든다.
    const originalGet = chrome.storage.local.get
    let delayedOnce = false
    chrome.storage.local.get = (keys) => {
      const snapshot = originalGet(keys)
      if (keys !== 'crf_installed_at' || delayedOnce) return snapshot
      delayedOnce = true
      return snapshot.then((value) => new Promise((resolve) => setTimeout(() => resolve(value), 30)))
    }
    vi.resetModules()
    await import('../extension/src/background/index.js')
    await flush()

    await fireInstalled(chrome, { reason: 'install' })
    await new Promise((resolve) => setTimeout(resolve, 60))

    const urls = chrome.__calls.setUninstallURL
    expect(urls).toHaveLength(2)
    expect(frag(new URL(urls[urls.length - 1])).get('i')).toBe(String(store.crf_installed_at))
  })

  it('설치 시각 저장이 실패해도 경고만 하고 제거 주소 설정을 이어간다', async () => {
    const { chrome } = await loadBackground()
    chrome.storage.local.set = () => Promise.reject(new Error('저장 실패'))
    await fireInstalled(chrome, { reason: 'install' })

    expect(console.warn).toHaveBeenCalled()
    expect(chrome.__calls.setUninstallURL).toHaveLength(2)
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('details 가 없어도 던지지 않는다', async () => {
    const { chrome } = await loadBackground()
    await fireInstalled(chrome, undefined)
    expect(sentOfType('Extension Installed')).toHaveLength(0)
  })
})

describe('설치 직후 온보딩', () => {
  const ONBOARDING_URL = `${EXTENSION_ORIGIN}src/onboarding/index.html`

  beforeEach(() => {
    mockSite.landingOrigin = 'https://landing.test'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reason 이 install 이면 온보딩 페이지를 탭으로 1회 연다', async () => {
    const { chrome } = await loadBackground({}, 'undecided')
    expect(chrome.__calls.tabsCreate).toHaveLength(0)

    await fireInstalled(chrome, { reason: 'install' })

    expect(chrome.__calls.tabsCreate).toEqual([{ url: ONBOARDING_URL }])
  })

  it('온보딩을 열어도 아무것도 보내지 않는다', async () => {
    const { chrome } = await loadBackground({}, 'undecided')
    await fireInstalled(chrome, { reason: 'install' })
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('reason 이 update 면 온보딩을 열지 않는다', async () => {
    const { chrome } = await loadBackground()
    await fireInstalled(chrome, { reason: 'update' })
    expect(chrome.__calls.tabsCreate).toHaveLength(0)
  })

  it('reason 이 chrome_update 면 온보딩을 열지 않는다', async () => {
    const { chrome } = await loadBackground()
    await fireInstalled(chrome, { reason: 'chrome_update' })
    expect(chrome.__calls.tabsCreate).toHaveLength(0)
  })

  it('설치 시각 저장과 제거 주소 설정을 마친 뒤에 연다', async () => {
    const { chrome, store } = await loadBackground()
    const seen = []
    chrome.tabs.create = (options) => {
      seen.push({
        installedAtSaved: typeof store.crf_installed_at === 'number',
        uninstallUrlCalls: chrome.__calls.setUninstallURL.length,
      })
      chrome.__calls.tabsCreate.push(options)
      return Promise.resolve({ id: 1 })
    }
    const uninstallCallsBefore = chrome.__calls.setUninstallURL.length

    await fireInstalled(chrome, { reason: 'install' })

    expect(seen).toEqual([{ installedAtSaved: true, uninstallUrlCalls: uninstallCallsBefore + 1 }])
  })

  it('tabs.create 가 거부돼도 handleInstalled 는 던지지 않고 경고만 한다', async () => {
    await loadBackground()
    chrome.tabs.create = () => Promise.reject(new Error('탭 열기 거부'))
    const { handleInstalled } = await import('../extension/src/background/lifecycle.js')

    await expect(handleInstalled({ reason: 'install' })).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })

  it('tabs.create 가 동기적으로 던져도 handleInstalled 는 던지지 않는다', async () => {
    await loadBackground()
    chrome.tabs.create = () => {
      throw new Error('탭 열기 예외')
    }
    const { handleInstalled } = await import('../extension/src/background/lifecycle.js')

    await expect(handleInstalled({ reason: 'install' })).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })

  it('설치 시각 저장이 실패해도 온보딩은 열린다', async () => {
    const { chrome } = await loadBackground({}, 'undecided')
    chrome.storage.local.set = () => Promise.reject(new Error('저장 실패'))
    await fireInstalled(chrome, { reason: 'install' })
    expect(chrome.__calls.tabsCreate).toHaveLength(1)
  })
})

describe('제거 주소', () => {
  beforeEach(() => {
    mockSite.landingOrigin = 'https://landing.test'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('워커가 시작되면 d 와 v 를 실은 /uninstalled 주소를 설정한다', async () => {
    const { chrome } = await loadBackground()
    expect(chrome.__calls.setUninstallURL).toHaveLength(1)
    const url = new URL(chrome.__calls.setUninstallURL[0])
    expect(url.origin).toBe('https://landing.test')
    expect(url.pathname).toBe('/uninstalled')
    expect(frag(url).get('d')).toBe('dev-1')
    expect(url.searchParams.get('v')).toBe('0.1.0')
    expect(frag(url).has('i')).toBe(false)
    expect(queryKeys(url)).toEqual(['v'])
  })

  it('저장된 설치 시각이 있으면 i 로 싣는다', async () => {
    const { chrome } = await loadBackground({ crf_installed_at: 1700000000000 })
    const url = new URL(chrome.__calls.setUninstallURL[0])
    expect(frag(url).get('i')).toBe('1700000000000')
  })

  it.each([
    ['자리표시자 example.com', 'https://example.com'],
    ['example.com 의 하위 도메인', 'https://www.example.com'],
    ['빈 문자열', ''],
    ['파싱할 수 없는 값', 'not a url'],
  ])('랜딩이 설정되지 않았으면(%s) 제거 주소를 설정하지 않는다', async (_label, origin) => {
    mockSite.landingOrigin = origin
    const { chrome } = await loadBackground()
    await fireInstalled(chrome, { reason: 'install' })
    expect(chrome.__calls.setUninstallURL).toHaveLength(0)
  })

  it('랜딩이 설정되지 않아도 설치 처리는 던지지 않고 설치 시각을 저장한다', async () => {
    mockSite.landingOrigin = 'https://example.com'
    const { chrome, store } = await loadBackground()
    await fireInstalled(chrome, { reason: 'install' })
    expect(typeof store.crf_installed_at).toBe('number')
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('granted 이면 d, v, i 를 모두 싣는다', async () => {
    const { chrome } = await loadBackground({ crf_installed_at: 1700000000000 }, 'granted')
    const url = lastUninstallUrl(chrome)
    expect(frag(url).get('d')).toBe('dev-1')
    expect(url.searchParams.get('v')).toBe('0.1.0')
    expect(frag(url).get('i')).toBe('1700000000000')
  })

  it('granted 이면 주소 끝에 #d=...&i=... 가 있고 쿼리에는 v 만 있다(기기 번호와 설치 시각은 서버로 가지 않는다)', async () => {
    const { chrome } = await loadBackground({ crf_installed_at: 1700000000000 }, 'granted')
    const raw = chrome.__calls.setUninstallURL.at(-1)
    expect(raw).toBe('https://landing.test/uninstalled?v=0.1.0#d=dev-1&i=1700000000000')

    const url = new URL(raw)
    expect(queryKeys(url)).toEqual(['v'])
    expect(url.search).not.toContain('dev-1')
    expect(url.search).not.toContain('1700000000000')
  })

  it.each(['denied', 'undecided'])('%s 이면 주소에 # 이 없고 쿼리에는 v 만 있다', async (consent) => {
    const { chrome } = await loadBackground({ crf_installed_at: 1700000000000 }, consent)
    expect(chrome.__calls.setUninstallURL.at(-1)).toBe('https://landing.test/uninstalled?v=0.1.0')
    expectNoIdentifiers(lastUninstallUrl(chrome))
  })

  it('denied 이면 v 만 싣는다(기기 번호와 설치 시각이 저장돼 있어도)', async () => {
    const { chrome } = await loadBackground({ crf_installed_at: 1700000000000 }, 'denied')
    const url = lastUninstallUrl(chrome)
    expect(url.pathname).toBe('/uninstalled')
    expect(url.searchParams.get('v')).toBe('0.1.0')
    expectNoIdentifiers(url)
  })

  it('undecided 이면 v 만 싣고 기기 번호를 새로 만들지도 않는다', async () => {
    const { chrome, store } = await loadBackground({}, 'undecided')
    delete store.crf_device_id
    chrome.__calls.setUninstallURL.length = 0
    await fireInstalled(chrome, { reason: 'install' })

    const url = lastUninstallUrl(chrome)
    expect(url.searchParams.get('v')).toBe('0.1.0')
    expectNoIdentifiers(url)
    expect('crf_device_id' in store).toBe(false)
  })

  it('동의 저장소 읽기가 실패하면 d 를 싣지 않는다(실패 시 닫힘)', async () => {
    const { chrome } = await loadBackground({}, 'granted')
    const originalGet = chrome.storage.local.get
    chrome.storage.local.get = (keys) =>
      (Array.isArray(keys) ? keys : [keys]).includes('crf_consent')
        ? Promise.reject(new Error('읽기 실패'))
        : originalGet(keys)
    await fireInstalled(chrome, { reason: 'install' })

    const url = lastUninstallUrl(chrome)
    expectNoIdentifiers(url)
    expect(url.searchParams.get('v')).toBe('0.1.0')
  })

  it('granted 에서 denied 로 바꾸면 마지막 setUninstallURL 인자에 d 가 없다', async () => {
    const { chrome } = await loadBackground({ crf_installed_at: 1700000000000 }, 'granted')
    expect(frag(lastUninstallUrl(chrome)).get('d')).toBe('dev-1')

    sendSetConsent(chrome, 'denied')
    await flush()

    const url = lastUninstallUrl(chrome)
    expectNoIdentifiers(url)
    expect(url.searchParams.get('v')).toBe('0.1.0')
  })

  it('denied 에서 granted 로 바꾸면 d 가 다시 실린다', async () => {
    const { chrome } = await loadBackground({}, 'denied')
    expectNoIdentifiers(lastUninstallUrl(chrome))

    sendSetConsent(chrome, 'granted')
    await flush()

    expect(frag(lastUninstallUrl(chrome)).get('d')).toBe('dev-1')
  })

  it('응답 콜백이 던져도(패널이 이미 닫힘) granted 에서 denied 로 바꾼 뒤 d 가 없다', async () => {
    const { chrome } = await loadBackground({}, 'granted')

    sendSetConsent(chrome, 'denied', () => {
      throw new Error('Attempting to use a disconnected port object')
    })
    await flush()

    expectNoIdentifiers(lastUninstallUrl(chrome))
  })

  it('응답 콜백이 던져도 첫 granted 의 Extension Installed 는 1건 나간다', async () => {
    const { chrome } = await loadBackground({}, 'undecided')

    sendSetConsent(chrome, 'granted', () => {
      throw new Error('Attempting to use a disconnected port object')
    })
    await flush()

    expect(sentOfType('Extension Installed')).toHaveLength(1)
    expect(frag(lastUninstallUrl(chrome)).get('d')).toBe('dev-1')
  })

  it('동의 처리(SET_CONSENT)로 다시 설정한 주소에도 쿼리에는 v 만 있다', async () => {
    const { chrome } = await loadBackground({ crf_installed_at: 1700000000000 }, 'undecided')

    sendSetConsent(chrome, 'granted')
    await flush()

    expect(chrome.__calls.setUninstallURL.at(-1)).toBe('https://landing.test/uninstalled?v=0.1.0#d=dev-1&i=1700000000000')
    expect(queryKeys(lastUninstallUrl(chrome))).toEqual(['v'])
  })

  it('setUninstallURL 이 거부돼도 경고만 한다', async () => {
    const { chrome } = await loadBackground()
    chrome.runtime.setUninstallURL = () => Promise.reject(new Error('거부'))
    await fireInstalled(chrome, { reason: 'install' })
    expect(console.warn).toHaveBeenCalled()
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })
})

describe('buildUninstallUrl', () => {
  const DEVICE = '3f2c1a9e-5b7d-4c8a-9e1f-0a2b4c6d8e0f'

  async function build(input) {
    installChromeMock()
    vi.resetModules()
    const { buildUninstallUrl } = await import('../extension/src/background/lifecycle.js')
    return buildUninstallUrl({ origin: 'https://landing.test', version: '1.0.0', ...input })
  }

  beforeEach(() => {
    mockSite.landingOrigin = 'https://landing.test'
  })

  it('기기 번호와 설치 시각을 조각에 싣고 버전만 쿼리에 싣는다', async () => {
    expect(await build({ deviceId: DEVICE, installedAt: 1700000000000 })).toBe(
      `https://landing.test/uninstalled?v=1.0.0#d=${DEVICE}&i=1700000000000`,
    )
  })

  it('기기 번호만 있으면 조각에 d 만 있다', async () => {
    expect(await build({ deviceId: DEVICE })).toBe(`https://landing.test/uninstalled?v=1.0.0#d=${DEVICE}`)
  })

  it('기기 번호와 설치 시각이 없으면(미동의) 조각이 없다', async () => {
    const url = await build({})
    expect(url).toBe('https://landing.test/uninstalled?v=1.0.0')
    expect(url).not.toContain('#')
    expect(await build({ deviceId: null, installedAt: null })).toBe(url)
  })

  it('조각의 값은 URLSearchParams 로 그대로 읽힌다', async () => {
    const url = new URL(await build({ deviceId: DEVICE, installedAt: 1700000000000 }))
    const fragment = new URLSearchParams(url.hash.slice(1))
    expect(fragment.get('d')).toBe(DEVICE)
    expect(fragment.get('i')).toBe('1700000000000')
    expect([...url.searchParams.keys()]).toEqual(['v'])
  })
})
