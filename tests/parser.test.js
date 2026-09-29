import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { parseReviews, findReviewContainer } from '../extension/src/content/parser.js'

const html = readFileSync(new URL('./fixtures/review-section.html', import.meta.url), 'utf8')

describe('parseReviews', () => {
  let doc

  beforeEach(() => {
    doc = new JSDOM(`<body>${html}</body>`).window.document
  })

  it('data-review-id가 있는 리뷰만 파싱한다', () => {
    const reviews = parseReviews(doc)
    expect(reviews).toHaveLength(3)
  })

  it('id는 data-review-id 값이다', () => {
    const reviews = parseReviews(doc)
    expect(reviews.map((r) => r.id)).toEqual(['9001001', '9001002', '9001003'])
  })

  it('별점은 채워진 별 개수다', () => {
    const reviews = parseReviews(doc)
    expect(reviews.map((r) => r.rating)).toEqual([4, 5, 3])
  })

  it('본문에 리뷰 텍스트가 들어 있다', () => {
    const reviews = parseReviews(doc)
    expect(reviews[0].text).toContain('3주 썼는데')
    expect(reviews[2].text).toContain('향이 생각보다 강해서')
  })

  it('체험단 문구가 본문에 포함된다', () => {
    const reviews = parseReviews(doc)
    expect(reviews[1].text).toContain('쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.')
  })

  it('각 리뷰가 자기 element를 들고 있다', () => {
    const reviews = parseReviews(doc)
    for (const review of reviews) {
      expect(review.element.tagName).toBe('ARTICLE')
      expect(review.element.getAttribute('data-review-id')).toBe(review.id)
    }
  })

  it('배너를 삽입할 컨테이너를 찾는다', () => {
    expect(findReviewContainer(doc).id).toBe('sdpReview')
  })

  it('리뷰가 없는 문서에서는 빈 배열과 null을 반환한다', () => {
    const empty = new JSDOM('<body><div>리뷰 없음</div></body>').window.document
    expect(parseReviews(empty)).toEqual([])
    expect(findReviewContainer(empty)).toBeNull()
  })
})
