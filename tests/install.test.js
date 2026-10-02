import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installChromeMock, grantConsent } from './helpers/chrome-mock.js'

const mockConfig = vi.hoisted(() => ({
  amplitudeApiKey: '0123456789abcdef0123456789abcdef',
  amplitudeEndpoint: 'https://amplitude.test/2/httpapi',
  landingOrigin: 'https://landing.test',
}))

// 실제 키가 든 로컬 설정 파일을 읽지 않도록 설정 모듈을 통째로 대체한다.
vi.mock('../extension/src/shared/config.local.js', () => ({ CONFIG: mockConfig }))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

let sent = []

async function loadBackground(initial = {}) {
  // 동의한 상태로 시작한다. 설치만으로는 동의 여부와 무관하게 아무것도 보내지 않음을 검증하기 위해서다.
  const store = grantConsent(installChromeMock({ crf_device_id: 'dev-1', ...initial }))
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

async function fireInstalled(chrome, details) {
  for (const listener of chrome.__installedListeners) listener(details)
  await flush()
}

function sentOfType(eventType) {
  return sent.filter((body) => body.events[0].event_type === eventType)
}

describe('설치', () => {
  beforeEach(() => {
    mockConfig.landingOrigin = 'https://landing.test'
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
    expect(new URL(chrome.__calls.setUninstallURL[0]).searchParams.has('i')).toBe(false)

    await fireInstalled(chrome, { reason: 'install' })

    expect(chrome.__calls.setUninstallURL).toHaveLength(2)
    const url = new URL(chrome.__calls.setUninstallURL[1])
    expect(url.searchParams.get('i')).toBe(String(store.crf_installed_at))
  })

  it('시작 시 설정과 설치 시 설정이 겹쳐도 마지막 setUninstallURL 에 i 가 실린다', async () => {
    const store = installChromeMock({ crf_device_id: 'dev-1' })
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
    expect(new URL(urls[urls.length - 1]).searchParams.get('i')).toBe(String(store.crf_installed_at))
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

describe('제거 주소', () => {
  beforeEach(() => {
    mockConfig.landingOrigin = 'https://landing.test'
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
    expect(url.searchParams.get('d')).toBe('dev-1')
    expect(url.searchParams.get('v')).toBe('0.1.0')
    expect(url.searchParams.has('i')).toBe(false)
  })

  it('저장된 설치 시각이 있으면 i 로 싣는다', async () => {
    const { chrome } = await loadBackground({ crf_installed_at: 1700000000000 })
    const url = new URL(chrome.__calls.setUninstallURL[0])
    expect(url.searchParams.get('i')).toBe('1700000000000')
  })

  it.each([
    ['자리표시자 example.com', 'https://example.com'],
    ['example.com 의 하위 도메인', 'https://www.example.com'],
    ['빈 문자열', ''],
    ['파싱할 수 없는 값', 'not a url'],
  ])('랜딩이 설정되지 않았으면(%s) 제거 주소를 설정하지 않는다', async (_label, origin) => {
    mockConfig.landingOrigin = origin
    const { chrome } = await loadBackground()
    await fireInstalled(chrome, { reason: 'install' })
    expect(chrome.__calls.setUninstallURL).toHaveLength(0)
  })

  it('랜딩이 설정되지 않아도 설치 처리는 던지지 않고 설치 시각을 저장한다', async () => {
    mockConfig.landingOrigin = 'https://example.com'
    const { chrome, store } = await loadBackground()
    await fireInstalled(chrome, { reason: 'install' })
    expect(typeof store.crf_installed_at).toBe('number')
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })

  it('setUninstallURL 이 거부돼도 경고만 한다', async () => {
    const { chrome } = await loadBackground()
    chrome.runtime.setUninstallURL = () => Promise.reject(new Error('거부'))
    await fireInstalled(chrome, { reason: 'install' })
    expect(console.warn).toHaveBeenCalled()
    expect(globalThis.fetch).toHaveBeenCalledTimes(0)
  })
})

describe('isLandingConfigured', () => {
  it('실제 랜딩 주소는 true', async () => {
    const { isLandingConfigured } = await import('../extension/src/background/lifecycle.js')
    expect(isLandingConfigured('https://landing.test')).toBe(true)
    expect(isLandingConfigured('https://coupang-filter.vercel.app')).toBe(true)
  })

  it('비었거나 파싱 불가이거나 example.com 이면 false', async () => {
    const { isLandingConfigured } = await import('../extension/src/background/lifecycle.js')
    expect(isLandingConfigured('')).toBe(false)
    expect(isLandingConfigured(undefined)).toBe(false)
    expect(isLandingConfigured(null)).toBe(false)
    expect(isLandingConfigured('nope')).toBe(false)
    expect(isLandingConfigured('https://example.com')).toBe(false)
    expect(isLandingConfigured('https://example.com/path')).toBe(false)
    expect(isLandingConfigured('https://www.example.com')).toBe(false)
  })

  it('example.com 을 접미사로 가진 다른 도메인은 true', async () => {
    const { isLandingConfigured } = await import('../extension/src/background/lifecycle.js')
    expect(isLandingConfigured('https://notexample.com')).toBe(true)
  })
})
