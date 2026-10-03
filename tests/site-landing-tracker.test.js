import { describe, it, expect, vi } from 'vitest'
import { createTracker, EVENTS } from '../site/src/landing/tracker.js'

const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000'
const COMMON = {
  surface: 'site',
  device_class: 'desktop',
  entry_source: 'clien.net',
  exp_install_cta: 'hero_only',
  store_live: false,
}

function setup(overrides = {}) {
  const send = vi.fn()
  let tick = 1_800_000_000_000
  let uuid = 0
  const track = createTracker({
    apiKey: 'test-key',
    endpoint: 'https://amplitude.test/httpapi',
    deviceId: DEVICE_ID,
    enabled: true,
    common: COMMON,
    sessionId: 1_799_999_999_000,
    now: () => tick++,
    randomUUID: () => `uuid-${uuid++}`,
    send,
    ...overrides,
  })
  return { track, send }
}

function eventOf(send, call = 0) {
  return send.mock.calls[call][0].events[0]
}

describe('EVENTS', () => {
  it('이벤트 이름 전체가 계측 계획과 같다', () => {
    expect(EVENTS).toEqual({
      LANDING_VIEWED: 'Landing Viewed',
      DEMO_VIEWED: 'Demo Viewed',
      INSTALL_CTA_CLICKED: 'Install CTA Clicked',
      HANDOFF_REQUESTED: 'Handoff Link Requested',
    })
  })
})

describe('createTracker', () => {
  it('앰플리튜드 페이로드를 send 로 한 번 보낸다', () => {
    const { track, send } = setup()
    track(EVENTS.LANDING_VIEWED, { section: 'hero' })
    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0][0]
    expect(payload.api_key).toBe('test-key')
    const event = payload.events[0]
    expect(event.device_id).toBe(DEVICE_ID)
    expect(event.event_type).toBe('Landing Viewed')
    expect(event.platform).toBe('Web')
    expect(event.event_properties.section).toBe('hero')
  })

  it('공통 프로퍼티가 페이로드에 실린다', () => {
    const { track, send } = setup()
    track('X', {})
    expect(eventOf(send).event_properties).toEqual(COMMON)
  })

  it('이벤트 프로퍼티가 공통 프로퍼티를 덮어쓰지 못한다', () => {
    const { track, send } = setup()
    track('X', {
      surface: 'x',
      device_class: 'x',
      entry_source: 'x',
      exp_install_cta: 'x',
      store_live: 'x',
      extra: 1,
    })
    expect(eventOf(send).event_properties).toEqual({ ...COMMON, extra: 1 })
  })

  it('프로퍼티를 생략해도 동작한다', () => {
    const { track, send } = setup()
    track('X')
    expect(eventOf(send).event_properties).toEqual(COMMON)
  })

  it('두 번 부르면 insert_id 가 다르고 time 이 각 호출 시각이다', () => {
    const { track, send } = setup()
    track('X', {})
    track('Y', {})
    const first = eventOf(send, 0)
    const second = eventOf(send, 1)
    expect(first.insert_id).not.toBe(second.insert_id)
    expect(first.insert_id).toBe('uuid-0')
    expect(second.insert_id).toBe('uuid-1')
    expect(first.time).toBe(1_800_000_000_000)
    expect(second.time).toBe(1_800_000_000_001)
  })

  it('session_id 가 넘긴 값이다', () => {
    const { track, send } = setup()
    track('X', {})
    expect(eventOf(send).session_id).toBe(1_799_999_999_000)
  })

  it('enabled 가 false 면 send 를 부르지 않는다', () => {
    const { track, send } = setup({ enabled: false })
    track('X', {})
    expect(send).not.toHaveBeenCalled()
  })

  it('apiKey 가 빈 문자열이면 enabled 와 무관하게 send 를 부르지 않는다', () => {
    const { track, send } = setup({ apiKey: '', enabled: true })
    track('X', {})
    expect(send).not.toHaveBeenCalled()
  })

  it('apiKey 가 없어도 send 를 부르지 않는다', () => {
    const { track, send } = setup({ apiKey: undefined })
    track('X', {})
    expect(send).not.toHaveBeenCalled()
  })

  it('send 가 동기적으로 던져도 track 이 던지지 않는다', () => {
    const { track } = setup({
      send: () => {
        throw new Error('boom')
      },
    })
    expect(() => track('X', {})).not.toThrow()
  })

  it('send 가 거부해도 track 이 던지지 않고 처리되지 않은 거부가 남지 않는다', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const { track } = setup({ send: () => Promise.reject(new Error('offline')) })
      expect(() => track('X', {})).not.toThrow()
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('now 가 던져도 track 이 던지지 않고 보내지 않는다', () => {
    const { track, send } = setup({
      now: () => {
        throw new Error('clock')
      },
    })
    expect(() => track('X', {})).not.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('send 를 생략하면 지정한 엔드포인트로 fetch 한다', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
    const { track } = setup({ send: undefined })
    track('X', {})
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://amplitude.test/httpapi')
  })
})
