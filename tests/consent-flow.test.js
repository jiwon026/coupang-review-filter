import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { installChromeMock, EXTENSION_ORIGIN } from './helpers/chrome-mock.js'

// 온보딩 페이지와 백그라운드를 실제 모듈로 함께 띄워 동의 흐름을 끝에서 끝까지 본다.
const mockConfig = vi.hoisted(() => ({
  amplitudeApiKey: '0123456789abcdef0123456789abcdef',
  amplitudeEndpoint: 'https://amplitude.test/2/httpapi',
}))

// 제거 주소 설정이 실제로 돌도록 사이트가 설정된 상태로 둔다.
const mockSite = vi.hoisted(() => ({
  landingOrigin: 'https://landing.test',
  privacyPath: '/privacy',
  uninstallPath: '/uninstalled',
  exampleProductUrl: 'https://www.coupang.com/vp/products/7590830589',
}))

vi.mock('../extension/src/shared/config.local.js', () => ({ CONFIG: mockConfig }))
vi.mock('../extension/src/shared/site.js', async (importOriginal) => ({
  ...(await importOriginal()),
  SITE: mockSite,
}))

const T0 = 1_700_000_000_000
const INSTALLED_AT = T0 - 60_000
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

let sent = []
let store
let document

const eventsOfType = (eventType) =>
  sent.map((body) => body.events[0]).filter((event) => event.event_type === eventType)
const buttonByText = (text) =>
  [...document.querySelectorAll('button')].find((button) => button.textContent === text)

// 페이지의 sendMessage(message, callback) 는 백그라운드 리스너로, 백그라운드의 sendMessage(message) 는 페이지 리스너로 잇는다.
async function loadFlow() {
  store = installChromeMock({ crf_device_id: 'dev-1', crf_installed_at: INSTALLED_AT })
  sent = []
  globalThis.fetch = vi.fn(async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return { ok: true, status: 200 }
  })
  vi.resetModules()
  await import('../extension/src/background/index.js')
  await flush()

  const chrome = globalThis.chrome
  const backgroundListeners = [...chrome.__listeners]
  const pageListeners = []
  const pageSender = {
    id: 'test-extension-id',
    url: `${EXTENSION_ORIGIN}src/onboarding/index.html`,
    tab: { id: 3, windowId: 1 },
  }
  chrome.runtime.lastError = undefined
  chrome.runtime.sendMessage = (message, callback) => {
    if (typeof callback === 'function') {
      for (const listener of backgroundListeners) listener(message, pageSender, (value) => callback(value))
      return undefined
    }
    for (const listener of pageListeners) listener(message, { id: 'test-extension-id' }, () => {})
    return Promise.resolve()
  }
  chrome.runtime.onMessage = { addListener: (fn) => pageListeners.push(fn) }

  const dom = new JSDOM('<body><main id="root"></main></body>')
  document = dom.window.document
  globalThis.document = document
  await import('../extension/src/onboarding/index.js')
  for (let i = 0; i < 5; i += 1) await flush()
}

describe('온보딩에서 동의하는 통합 흐름', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('선택 전에는 아무것도 보내지 않는다', async () => {
    await loadFlow()
    expect(buttonByText('동의하고 시작')).toBeTruthy()
    expect(sent).toHaveLength(0)
  })

  it('Extension Installed 의 time 은 동의 저장 시각(decidedAt)이고 Onboarding Viewed 의 time 보다 크지 않다', async () => {
    await loadFlow()
    // 부를 때마다 1ms 씩 가는 시계. 동의 저장 뒤에 시각을 다시 읽으면 decidedAt 보다 큰 값이 나온다.
    let clock = T0
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1))

    buttonByText('동의하고 시작').click()
    for (let i = 0; i < 10; i += 1) await flush()

    const decidedAt = store.crf_consent.decidedAt
    expect(store.crf_consent.status).toBe('granted')
    expect(decidedAt).toBeGreaterThan(T0)

    const installed = eventsOfType('Extension Installed')
    const viewed = eventsOfType('Onboarding Viewed')
    expect(installed).toHaveLength(1)
    expect(viewed).toHaveLength(1)
    expect(installed[0].time).toBe(decidedAt)
    expect(installed[0].time).toBeLessThanOrEqual(viewed[0].time)
    expect(installed[0].session_id).toBeLessThanOrEqual(installed[0].time)
    expect(installed[0].event_properties.consent_source).toBe('onboarding')
    expect(installed[0].event_properties.seconds_since_install).toBe(Math.round((decidedAt - INSTALLED_AT) / 1000))
  })

  it('통계 없이 사용을 고르면 아무것도 보내지 않는다', async () => {
    await loadFlow()
    buttonByText('통계 없이 사용').click()
    for (let i = 0; i < 10; i += 1) await flush()

    expect(store.crf_consent.status).toBe('denied')
    expect(sent).toHaveLength(0)
  })
})
