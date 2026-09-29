import { describe, it, expect } from 'vitest'
import { summarize } from '../extension/src/core/rating.js'

const MARKER = '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.'

const sponsored = (rating) => ({ rating, text: `좋아요\n${MARKER}` })
const organic = (rating) => ({ rating, text: '직접 사서 써 봤습니다' })

describe('summarize', () => {
  it('체험단을 제외한 평점을 계산한다', () => {
    const result = summarize([
      sponsored(5), sponsored(5),
      organic(4), organic(3),
    ])
    expect(result.total).toBe(4)
    expect(result.sponsoredCount).toBe(2)
    expect(result.organicCount).toBe(2)
    expect(result.sponsoredRatio).toBe(0.5)
    expect(result.ratingOfficial).toBe(4.3)
    expect(result.ratingFiltered).toBe(3.5)
    expect(result.ratingDelta).toBe(-0.8)
  })

  it('체험단이 없으면 두 평점이 같고 차이는 0', () => {
    const result = summarize([organic(5), organic(4)])
    expect(result.sponsoredCount).toBe(0)
    expect(result.sponsoredRatio).toBe(0)
    expect(result.ratingOfficial).toBe(4.5)
    expect(result.ratingFiltered).toBe(4.5)
    expect(result.ratingDelta).toBe(0)
  })

  it('전부 체험단이면 제외 평점이 null', () => {
    const result = summarize([sponsored(5), sponsored(5)])
    expect(result.organicCount).toBe(0)
    expect(result.ratingOfficial).toBe(5)
    expect(result.ratingFiltered).toBeNull()
    expect(result.ratingDelta).toBeNull()
  })

  it('빈 배열을 안전하게 처리한다', () => {
    const result = summarize([])
    expect(result.total).toBe(0)
    expect(result.sponsoredRatio).toBe(0)
    expect(result.ratingOfficial).toBeNull()
    expect(result.ratingFiltered).toBeNull()
    expect(result.ratingDelta).toBeNull()
  })

  it('배열이 아니면 빈 집계를 반환한다', () => {
    expect(summarize(null).total).toBe(0)
    expect(summarize(undefined).total).toBe(0)
  })
})
