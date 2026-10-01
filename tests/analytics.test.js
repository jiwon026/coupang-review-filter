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

  // 콘텐츠 메시지는 타입 검사 없는 신뢰 경계다. 화면 변형과 기록 변형이 같다는 불변식을 관례가 아니라 코드로 지킨다.
  it('공통 프로퍼티는 이벤트 프로퍼티가 덮어쓸 수 없다', () => {
    const payload = buildPayload({
      ...base,
      commonProperties: { surface: 'extension', exp_default_filter: 'on', app_version: '0.1.0' },
      properties: { surface: 'sidepanel', exp_default_filter: 'x', app_version: '9.9.9' },
    })
    const props = payload.events[0].event_properties
    expect(props.exp_default_filter).toBe('on')
    expect(props.surface).toBe('extension')
    expect(props.app_version).toBe('0.1.0')
  })

  it('공통에 없는 이벤트 프로퍼티는 그대로 싣는다', () => {
    const payload = buildPayload({
      ...base,
      commonProperties: { surface: 'extension' },
      properties: { review_count: 120, filter_state: 'on' },
    })
    expect(payload.events[0].event_properties).toEqual({
      surface: 'extension',
      review_count: 120,
      filter_state: 'on',
    })
  })

  it('sessionId 를 이벤트 최상위 session_id 에 담는다', () => {
    const event = buildPayload({ ...base, sessionId: 1699999000000 }).events[0]
    expect(event.session_id).toBe(1699999000000)
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
