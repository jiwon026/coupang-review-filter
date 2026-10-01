import { describe, it, expect } from 'vitest'
import { MESSAGES } from '../extension/src/shared/messages.js'

describe('MESSAGES', () => {
  it('값 전체가 명시한 리터럴과 같다', () => {
    expect(MESSAGES).toEqual({
      TRACK: 'crf:track',
      OPEN_PANEL: 'crf:open-panel',
      SUMMARY_UPDATED: 'crf:summary-updated',
      GET_SUMMARY: 'crf:get-summary',
      GET_VARIANT: 'crf:get-variant',
      CONSUME_PANEL_TRIGGER: 'crf:consume-panel-trigger',
    })
  })

  it('값이 중복되지 않는다', () => {
    const values = Object.values(MESSAGES)
    expect(new Set(values).size).toBe(values.length)
  })

  it('모든 값이 crf: 접두사를 가진다(다른 확장의 메시지와 충돌 방지)', () => {
    for (const value of Object.values(MESSAGES)) {
      expect(value.startsWith('crf:')).toBe(true)
    }
  })
})
