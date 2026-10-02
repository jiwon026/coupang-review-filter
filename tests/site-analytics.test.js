import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSiteEvent, sendSiteEvent } from '../site/src/analytics.js'

const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000'
const NOW = 1_800_000_000_000

function build(overrides = {}) {
  return buildSiteEvent({
    apiKey: 'test-key',
    deviceId: DEVICE_ID,
    eventType: 'Extension Removed',
    properties: { days_since_install: 3 },
    appVersion: '0.2.0',
    now: NOW,
    insertId: 'insert-1',
    ...overrides,
  })
}

describe('buildSiteEvent', () => {
  it('앰플리튜드 HTTP API V2 모양의 페이로드를 만든다', () => {
    const payload = build()
    expect(payload.api_key).toBe('test-key')
    expect(payload.events).toHaveLength(1)
  })

  it('최상위에 device_id, platform Web, app_version, session_id, insert_id 를 둔다', () => {
    const [event] = build().events
    expect(event.device_id).toBe(DEVICE_ID)
    expect(event.event_type).toBe('Extension Removed')
    expect(event.platform).toBe('Web')
    expect(event.app_version).toBe('0.2.0')
    // 세션 밖(-1). 제거 한 건이 세션 하나로 세어지지 않는다.
    expect(event.session_id).toBe(-1)
    expect(event.time).toBe(NOW)
    expect(event.insert_id).toBe('insert-1')
  })

  it('event_properties 에 surface site 를 넣고 프로퍼티가 덮어쓰지 못한다', () => {
    const [event] = build({ properties: { days_since_install: 3, surface: 'extension' } }).events
    expect(event.event_properties).toEqual({ days_since_install: 3, surface: 'site' })
  })

  it('버전을 모르면 app_version 을 싣지 않는다', () => {
    const [event] = build({ appVersion: null }).events
    expect('app_version' in event).toBe(false)
  })
})

describe('sendSiteEvent', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  it('지정한 엔드포인트로 JSON 을 POST 한다', async () => {
    const payload = build()
    await sendSiteEvent(payload, 'https://amplitude.test/httpapi')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://amplitude.test/httpapi')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(payload)
  })

  it('전송이 실패해도 예외를 던지지 않는다', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(sendSiteEvent(build(), 'https://amplitude.test/httpapi')).resolves.toBeUndefined()
  })

  it('fetch 가 동기적으로 던져도 예외를 던지지 않는다', async () => {
    globalThis.fetch = () => {
      throw new Error('blocked')
    }
    await expect(sendSiteEvent(build(), 'https://amplitude.test/httpapi')).resolves.toBeUndefined()
  })
})
