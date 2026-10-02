import { describe, it, expect } from 'vitest'
import {
  CONTAINER_SCROLL_THRESHOLD,
  scrollRatio,
  selectHealthSignals,
} from '../extension/src/content/health.js'


describe('scrollRatio', () => {
  it('스크롤한 양을 스크롤 가능한 길이로 나눈다', () => {
    expect(scrollRatio({ scrollY: 630, viewportHeight: 100, documentHeight: 1000 })).toBe(0.7)
  })

  it('스크롤하지 않았으면 문서가 짧아도 0', () => {
    expect(scrollRatio({ scrollY: 0, viewportHeight: 800, documentHeight: 1000 })).toBe(0)
  })

  it('긴 문서에서 700 만 내려갔으면 60% 에 못 미친다', () => {
    const ratio = scrollRatio({ scrollY: 700, viewportHeight: 800, documentHeight: 2000 })
    expect(ratio).toBeCloseTo(0.583, 2)
    expect(ratio).toBeLessThan(CONTAINER_SCROLL_THRESHOLD)
  })

  it('1 을 넘지 않고 음수가 되지 않는다', () => {
    expect(scrollRatio({ scrollY: 5000, viewportHeight: 100, documentHeight: 1000 })).toBe(1)
    expect(scrollRatio({ scrollY: -10, viewportHeight: 100, documentHeight: 1000 })).toBe(0)
  })

  it('문서가 화면보다 짧거나 같으면 0 으로 나누지 않는다', () => {
    expect(scrollRatio({ scrollY: 0, viewportHeight: 800, documentHeight: 0 })).toBe(0)
    expect(scrollRatio({ scrollY: 0, viewportHeight: 800, documentHeight: 800 })).toBe(0)
  })
})

const clean = {
  containerFound: true,
  maxScrollRatio: 0,
  maxItemCount: 0,
  maxParsedCount: 0,
  parsedAnyReview: false,
  sawStableId: false,
}

describe('selectHealthSignals', () => {
  it('정상 상태면 신호가 없다', () => {
    expect(
      selectHealthSignals({
        ...clean,
        maxItemCount: 5,
        maxParsedCount: 5,
        parsedAnyReview: true,
        sawStableId: true,
      }),
    ).toEqual([])
  })

  it('컨테이너를 못 찾고 임계 이상 스크롤했으면 ReviewContainerNotFound 를 반올림한 비율로 돌려준다', () => {
    expect(CONTAINER_SCROLL_THRESHOLD).toBe(0.6)
    expect(selectHealthSignals({ ...clean, containerFound: false, maxScrollRatio: 0.7777 })).toEqual([
      { error_type: 'ReviewContainerNotFound', max_scroll_ratio: 0.78 },
    ])
    expect(selectHealthSignals({ ...clean, containerFound: false, maxScrollRatio: 0.6 })).toHaveLength(1)
  })

  it('임계 미만이거나 컨테이너를 찾았으면 ReviewContainerNotFound 가 없다', () => {
    expect(selectHealthSignals({ ...clean, containerFound: false, maxScrollRatio: 0.59 })).toEqual([])
    expect(selectHealthSignals({ ...clean, containerFound: true, maxScrollRatio: 1 })).toEqual([])
  })

  it('리뷰 요소를 본 적 있는데 한 번도 파싱하지 못했으면 ReviewRatingNotFound 에 최대 item_count 를 싣는다', () => {
    expect(selectHealthSignals({ ...clean, maxItemCount: 3 })).toEqual([
      { error_type: 'ReviewRatingNotFound', item_count: 3 },
    ])
  })

  it('한 번이라도 파싱했으면 ReviewRatingNotFound 가 없다', () => {
    expect(
      selectHealthSignals({ ...clean, maxItemCount: 3, maxParsedCount: 1, parsedAnyReview: true, sawStableId: true }),
    ).toEqual([])
  })

  it('리뷰 요소를 본 적 없으면 ReviewRatingNotFound 가 없다', () => {
    expect(selectHealthSignals(clean)).toEqual([])
  })

  it('파싱은 됐는데 id 를 한 번도 못 봤으면 ReviewIdNotFound 에 최대 review_count 를 싣는다', () => {
    expect(
      selectHealthSignals({ ...clean, maxItemCount: 4, maxParsedCount: 4, parsedAnyReview: true }),
    ).toEqual([{ error_type: 'ReviewIdNotFound', review_count: 4 }])
  })

  it('id 를 한 번이라도 봤으면 ReviewIdNotFound 가 없다', () => {
    expect(
      selectHealthSignals({
        ...clean,
        maxItemCount: 4,
        maxParsedCount: 4,
        parsedAnyReview: true,
        sawStableId: true,
      }),
    ).toEqual([])
  })
})
