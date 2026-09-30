import { describe, it, expect } from 'vitest'
import { EVENTS } from '../extension/src/shared/events.js'

describe('EVENTS', () => {
  it('설계된 확장 이벤트 9개를 모두 정의한다', () => {
    expect(Object.keys(EVENTS)).toHaveLength(9)
  })

  it('이벤트 이름이 중복되지 않는다', () => {
    const values = Object.values(EVENTS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('이벤트 이름은 Title Case 두 단어 이상이다', () => {
    for (const name of Object.values(EVENTS)) {
      expect(name).toMatch(/^[A-Z][a-zA-Z]+( [A-Z][a-zA-Z]+)+$/)
    }
  })

  it('핵심 이벤트가 존재한다', () => {
    expect(EVENTS.BANNER_RENDERED).toBe('Banner Rendered')
    expect(EVENTS.FILTER_TOGGLED).toBe('Filter Toggled')
    expect(EVENTS.PURCHASE_INTENT_CLICKED).toBe('Purchase Intent Clicked')
  })
})
