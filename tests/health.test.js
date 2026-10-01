import { describe, it, expect } from 'vitest'
import {
  CONTAINER_SCROLL_THRESHOLD,
  ERROR_MESSAGE_MAX_LENGTH,
  truncateMessage,
  scrollRatio,
  isRatingSelectorBroken,
  isReviewIdSelectorBroken,
  isContainerSelectorBroken,
} from '../extension/src/content/health.js'

describe('truncateMessage', () => {
  it('상한 이하면 그대로 둔다', () => {
    expect(truncateMessage('짧은 메시지')).toBe('짧은 메시지')
  })

  it('상한을 넘으면 120자로 자른다', () => {
    expect(ERROR_MESSAGE_MAX_LENGTH).toBe(120)
    expect(truncateMessage('x'.repeat(500))).toHaveLength(120)
  })

  it('문자열이 아닌 값도 문자열로 바꾼다', () => {
    expect(truncateMessage(undefined)).toBe('')
    expect(truncateMessage(null)).toBe('')
    expect(truncateMessage(404)).toBe('404')
  })
})

describe('scrollRatio', () => {
  it('화면 아래끝 위치를 문서 높이로 나눈다', () => {
    expect(scrollRatio({ scrollY: 600, viewportHeight: 100, documentHeight: 1000 })).toBe(0.7)
  })

  it('1 을 넘지 않는다', () => {
    expect(scrollRatio({ scrollY: 950, viewportHeight: 100, documentHeight: 1000 })).toBe(1)
  })

  it('문서 높이가 0 이하면 0', () => {
    expect(scrollRatio({ scrollY: 0, viewportHeight: 100, documentHeight: 0 })).toBe(0)
  })
})

describe('isRatingSelectorBroken', () => {
  it('리뷰 요소는 있는데 파싱 결과가 0건이면 true', () => {
    expect(isRatingSelectorBroken({ itemCount: 3, parsedCount: 0 })).toBe(true)
  })

  it('파싱 결과가 있으면 false', () => {
    expect(isRatingSelectorBroken({ itemCount: 3, parsedCount: 2 })).toBe(false)
  })

  it('리뷰 요소가 없으면 false', () => {
    expect(isRatingSelectorBroken({ itemCount: 0, parsedCount: 0 })).toBe(false)
  })
})

describe('isReviewIdSelectorBroken', () => {
  it('모두 id 가 없으면 true', () => {
    expect(isReviewIdSelectorBroken([{ hasStableId: false }, { hasStableId: false }])).toBe(true)
  })

  it('하나라도 id 가 있으면 false', () => {
    expect(isReviewIdSelectorBroken([{ hasStableId: false }, { hasStableId: true }])).toBe(false)
  })

  it('리뷰가 없으면 false', () => {
    expect(isReviewIdSelectorBroken([])).toBe(false)
  })
})

describe('isContainerSelectorBroken', () => {
  it('컨테이너를 못 찾았고 임계 이상 내려갔으면 true', () => {
    expect(CONTAINER_SCROLL_THRESHOLD).toBe(0.6)
    expect(isContainerSelectorBroken({ containerFound: false, maxScrollRatio: 0.6 })).toBe(true)
    expect(isContainerSelectorBroken({ containerFound: false, maxScrollRatio: 0.9 })).toBe(true)
  })

  it('임계 미만이면 false', () => {
    expect(isContainerSelectorBroken({ containerFound: false, maxScrollRatio: 0.59 })).toBe(false)
  })

  it('컨테이너를 한 번이라도 찾았으면 false', () => {
    expect(isContainerSelectorBroken({ containerFound: true, maxScrollRatio: 1 })).toBe(false)
  })
})
