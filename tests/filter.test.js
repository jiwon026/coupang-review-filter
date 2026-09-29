import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { markSponsored, applyFilter } from '../extension/src/content/filter.js'

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
})
