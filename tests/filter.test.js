import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { markSponsored, applyFilter } from '../extension/src/content/filter.js'
import { isSponsored, SPONSORED_LABEL } from '../extension/src/core/sponsored.js'
import { coupang } from '../extension/src/content/sites/coupang.js'
import { musinsa } from '../extension/src/content/sites/musinsa.js'

const MARKER = '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.'

function buildReviews(doc) {
  const make = (text) => {
    const el = doc.createElement('div')
    doc.body.appendChild(el)
    return el
  }
  return [
    { id: 'a', rating: 5, text: `좋아요\n${MARKER}`, element: make() },
    { id: 'b', rating: 4, text: '직접 사서 써 봤습니다', element: make() },
  ]
}

describe('filter', () => {
  let doc
  let reviews

  beforeEach(() => {
    doc = new JSDOM('<body></body>').window.document
    globalThis.document = doc
    reviews = buildReviews(doc)
  })

  it('체험단 리뷰에만 배지를 넣는다', () => {
    markSponsored(reviews)
    expect(reviews[0].element.querySelector('.crf-badge')).toBeTruthy()
    expect(reviews[1].element.querySelector('.crf-badge')).toBeNull()
  })

  it('배지 문구는 근거 제시형이다', () => {
    markSponsored(reviews)
    expect(reviews[0].element.querySelector('.crf-badge').textContent).toBe('체험단 제공 리뷰')
  })

  it('여러 번 호출해도 배지가 하나만 생긴다', () => {
    markSponsored(reviews)
    markSponsored(reviews)
    expect(reviews[0].element.querySelectorAll('.crf-badge').length).toBe(1)
  })

  it('숨기면 체험단 리뷰만 crf-hidden을 가진다', () => {
    applyFilter(reviews, true)
    expect(reviews[0].element.classList.contains('crf-hidden')).toBe(true)
    expect(reviews[1].element.classList.contains('crf-hidden')).toBe(false)
  })

  it('다시 보이면 crf-hidden이 사라진다', () => {
    applyFilter(reviews, true)
    applyFilter(reviews, false)
    expect(reviews[0].element.classList.contains('crf-hidden')).toBe(false)
  })

  // 무신사의 후기 전체보기는 카드 요소를 그대로 두고 번호와 내용만 바꿔 다시 쓴다.
  describe('다시 쓰인 카드', () => {
    const reuseAsOrganic = (review) => ({ ...review, id: 'c', text: '직접 사서 써 봤습니다' })
    const reuseAsSponsored = (review) => ({ ...review, id: 'd', text: `좋아요\n${MARKER}` })

    it('체험단이던 요소가 일반 후기로 다시 쓰이면 배지를 지운다', () => {
      markSponsored(reviews)
      markSponsored([reuseAsOrganic(reviews[0]), reviews[1]])
      expect(reviews[0].element.querySelector('.crf-badge')).toBeNull()
    })

    it('체험단이던 요소가 일반 후기로 다시 쓰이면 숨김을 푼다', () => {
      applyFilter(reviews, true)
      applyFilter([reuseAsOrganic(reviews[0]), reviews[1]], true)
      expect(reviews[0].element.classList.contains('crf-hidden')).toBe(false)
    })

    it('숨김 class 를 받아도 같은 정리를 한다', () => {
      applyFilter(reviews, true, 'crf-collapsed')
      applyFilter([reuseAsOrganic(reviews[0]), reuseAsSponsored(reviews[1])], true, 'crf-collapsed')
      expect(reviews[0].element.classList.contains('crf-collapsed')).toBe(false)
      expect(reviews[1].element.classList.contains('crf-collapsed')).toBe(true)
    })

    it('일반이던 요소가 체험단 후기로 다시 쓰이면 배지가 하나 붙는다', () => {
      markSponsored(reviews)
      const reused = [reviews[0], reuseAsSponsored(reviews[1])]
      markSponsored(reused)
      markSponsored(reused)
      expect(reviews[1].element.querySelectorAll('.crf-badge')).toHaveLength(1)
      expect(reviews[0].element.querySelectorAll('.crf-badge')).toHaveLength(1)
    })

    it('남은 배지가 여럿이어도 일반 후기에서는 모두 지운다', () => {
      for (let count = 0; count < 2; count += 1) {
        const badge = doc.createElement('span')
        badge.className = 'crf-badge'
        reviews[1].element.appendChild(badge)
      }
      markSponsored(reviews)
      expect(reviews[1].element.querySelector('.crf-badge')).toBeNull()
    })

    it('배지 글자는 두 쇼핑몰의 체험단 문구와 겹치지 않는다', () => {
      expect(isSponsored(SPONSORED_LABEL, coupang.markers)).toBe(false)
      expect(isSponsored(SPONSORED_LABEL, musinsa.markers)).toBe(false)
    })
  })
})
