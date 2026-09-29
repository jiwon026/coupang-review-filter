import { describe, it, expect } from 'vitest'
import { isSponsored } from '../extension/src/core/sponsored.js'

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

  it('빈 문자열은 false', () => {
    expect(isSponsored('')).toBe(false)
  })

  it('문자열이 아니면 false', () => {
    expect(isSponsored(null)).toBe(false)
    expect(isSponsored(undefined)).toBe(false)
    expect(isSponsored(123)).toBe(false)
  })
})
