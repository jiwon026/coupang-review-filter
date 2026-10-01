import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installChromeMock } from './helpers/chrome-mock.js'
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

async function loadTrack(deviceId) {
  installChromeMock({ crf_device_id: deviceId })
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

  it('exp_default_filter 와 exp_banner_copy 를 모든 이벤트에 싣는다', async () => {
    const props = await trackedProps('device-abc')
    expect(['on', 'off']).toContain(props.exp_default_filter)
    expect(['rating', 'ratio']).toContain(props.exp_banner_copy)
  })

  it('값이 같은 device id 의 assignAll 결과와 같다', async () => {
    for (const deviceId of deviceIds.slice(0, 40)) {
      const props = await trackedProps(deviceId)
      const assigned = assignAll(deviceId)
      expect(props.exp_default_filter).toBe(assigned.default_filter)
      expect(props.exp_banner_copy).toBe(assigned.banner_copy)
    }
  })

  it('입력 집합에서 두 실험 모두 두 변형이 실제로 나온다', () => {
    for (const experiment of Object.values(EXPERIMENTS)) {
      const seen = new Set(deviceIds.slice(0, 40).map((id) => assignAll(id)[experiment.id]))
      expect([...seen].sort()).toEqual([...experiment.variants].sort())
    }
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
