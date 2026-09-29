import { describe, it, expect } from 'vitest'
import { isSponsored, SPONSORED_MARKERS } from '../extension/src/core/sponsored.js'

const MARKER = '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.'

describe('isSponsored', () => {
  it('판별 문구가 있으면 true', () => {
    expect(isSponsored(`정말 좋아요 추천합니다\n${MARKER}`)).toBe(true)
  })

  it('판별 문구가 없으면 false', () => {
    expect(isSponsored('3주 썼는데 유분은 잡히는데 겨울엔 건조해요')).toBe(false)
  })

  it('줄바꿈과 공백이 섞여도 잡는다', () => {
    const messy = '좋아요\n\n쿠팡체험단  이벤트로 상품을\n무료로 제공 받아 작성한 구매 후기입니다.'
    expect(isSponsored(messy)).toBe(true)
  })

  it('실측된 문구 변형 3종을 모두 잡는다', () => {
    const variants = [
      '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.',
      '쿠팡체험단 이벤트로 상품을 무료 제공받아 작성한 리뷰입니다.',
      '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매후기입니다',
    ]
    for (const variant of variants) {
      expect(isSponsored(`좋아요\n${variant}`)).toBe(true)
    }
  })

  it('체험단을 언급만 한 일반 리뷰는 잡지 않는다', () => {
    expect(isSponsored('체험단 후기들만 보고 샀는데 실망했어요')).toBe(false)
    expect(isSponsored('쿠팡체험단 후기가 너무 많아서 걸러 봤습니다')).toBe(false)
  })

  it('빈 문자열은 false', () => {
    expect(isSponsored('')).toBe(false)
  })

  it('문자열이 아니면 false', () => {
    expect(isSponsored(null)).toBe(false)
    expect(isSponsored(undefined)).toBe(false)
    expect(isSponsored(123)).toBe(false)
  })

  it('마커는 변형을 포괄하는 접두 앵커다', () => {
    expect(SPONSORED_MARKERS).toEqual(['쿠팡체험단 이벤트로 상품을 무료'])
  })
})
