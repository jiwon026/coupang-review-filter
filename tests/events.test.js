import { describe, it, expect } from 'vitest'
import { EVENTS } from '../extension/src/shared/events.js'

describe('EVENTS', () => {
  it('설계된 확장 이벤트 11개를 모두 정의한다', () => {
    expect(Object.keys(EVENTS)).toHaveLength(11)
  })

  // 이벤트 이름은 앰플리튜드에 쌓인 데이터의 키다. 바꾸면 과거 데이터와 끊기므로 값 전체를 고정한다.
  it('EVENTS 전체 값이 명시한 리터럴과 같다', () => {
    expect(EVENTS).toEqual({
      EXTENSION_INSTALLED: 'Extension Installed',
      BANNER_RENDERED: 'Banner Rendered',
      PANEL_OPENED: 'Panel Opened',
      FILTER_TOGGLED: 'Filter Toggled',
      EVIDENCE_EXPANDED: 'Evidence Expanded',
      PANEL_REVIEW_SCROLLED: 'Panel Review Scrolled',
      PURCHASE_INTENT_CLICKED: 'Purchase Intent Clicked',
      EXTENSION_REMOVED: 'Extension Removed',
      EXTENSION_ERROR: 'Extension Error',
      ONBOARDING_VIEWED: 'Onboarding Viewed',
      ONBOARDING_EXAMPLE_CLICKED: 'Onboarding Example Clicked',
    })
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
