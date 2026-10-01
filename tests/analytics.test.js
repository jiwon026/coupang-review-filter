import { describe, it, expect } from 'vitest'
import { buildPayload, isApiKeyMissing } from '../extension/src/background/analytics.js'
import { CONFIG as EXAMPLE_CONFIG } from '../extension/src/shared/config.example.js'

describe('buildPayload', () => {
  const base = {
    apiKey: 'test-key',
    deviceId: 'device-1',
    userId: null,
    eventType: 'Banner Rendered',
    properties: { review_count: 120 },
    commonProperties: { surface: 'extension', app_version: '0.1.0' },
    time: 1700000000000,
    insertId: 'insert-1',
  }

  it('api_key를 최상위에 담는다', () => {
    expect(buildPayload(base).api_key).toBe('test-key')
  })

  it('이벤트 하나를 배열로 담는다', () => {
    const payload = buildPayload(base)
    expect(payload.events).toHaveLength(1)
    expect(payload.events[0].event_type).toBe('Banner Rendered')
  })

  it('공통 프로퍼티와 이벤트 프로퍼티를 합친다', () => {
    const props = buildPayload(base).events[0].event_properties
    expect(props.surface).toBe('extension')
    expect(props.app_version).toBe('0.1.0')
    expect(props.review_count).toBe(120)
  })

  it('이벤트 프로퍼티가 공통보다 우선한다', () => {
    const payload = buildPayload({
      ...base,
      commonProperties: { surface: 'extension' },
      properties: { surface: 'sidepanel' },
    })
    expect(payload.events[0].event_properties.surface).toBe('sidepanel')
  })

  it('user_id가 null이면 필드를 넣지 않는다', () => {
    expect('user_id' in buildPayload(base).events[0]).toBe(false)
  })

  it('user_id가 있으면 넣는다', () => {
    const payload = buildPayload({ ...base, userId: 'user-9' })
    expect(payload.events[0].user_id).toBe('user-9')
  })

  it('appVersion 을 이벤트 최상위 app_version 에 담는다', () => {
    const event = buildPayload({ ...base, appVersion: '0.1.0' }).events[0]
    expect(event.app_version).toBe('0.1.0')
  })

  it('최상위 platform 은 Chrome Extension 이다', () => {
    expect(buildPayload({ ...base, appVersion: '0.1.0' }).events[0].platform).toBe('Chrome Extension')
  })

  it('event_properties 의 platform 과 app_version 은 그대로 둔다', () => {
    const props = buildPayload({
      ...base,
      appVersion: '0.1.0',
      commonProperties: { platform: 'desktop', app_version: '0.1.0' },
    }).events[0].event_properties
    expect(props.platform).toBe('desktop')
    expect(props.app_version).toBe('0.1.0')
  })

  it('time과 insert_id를 담는다', () => {
    const event = buildPayload(base).events[0]
    expect(event.time).toBe(1700000000000)
    expect(event.insert_id).toBe('insert-1')
  })
})

describe('isApiKeyMissing', () => {
  it('자리표시자는 없는 것으로 본다', () => {
    expect(isApiKeyMissing('PASTE_YOUR_AMPLITUDE_API_KEY_HERE')).toBe(true)
  })

  it('빈 값은 없는 것으로 본다', () => {
    expect(isApiKeyMissing('')).toBe(true)
    expect(isApiKeyMissing(undefined)).toBe(true)
    expect(isApiKeyMissing(null)).toBe(true)
  })

  it('실제 키는 있는 것으로 본다', () => {
    expect(isApiKeyMissing('0123456789abcdef0123456789abcdef')).toBe(false)
  })
})

describe('config.example.js', () => {
  it('앰플리튜드 키 자리표시자는 미설정으로 판정된다', () => {
    expect(isApiKeyMissing(EXAMPLE_CONFIG.amplitudeApiKey)).toBe(true)
    expect(EXAMPLE_CONFIG.amplitudeApiKey).toBe('PASTE_YOUR_AMPLITUDE_API_KEY_HERE')
  })

  it('landingOrigin 은 example.com 그대로다', () => {
    expect(EXAMPLE_CONFIG.landingOrigin).toBe('https://example.com')
  })
})
