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

  it('별점이 있는 리뷰만 파싱한다', () => {
    const reviews = parseReviews(doc)
    expect(reviews).toHaveLength(4)
  })

  it('id는 자손의 data-review-id 값이다', () => {
    const reviews = parseReviews(doc)
    expect(reviews.map((r) => r.id)).toEqual(['9001001', '9001002', '9001003', '9001004'])
  })

  it('별점은 채워진 별 개수다', () => {
    const reviews = parseReviews(doc)
    expect(reviews.map((r) => r.rating)).toEqual([4, 5, 5, 3])
  })

  it('별점이 0개인 항목은 제외한다', () => {
    const reviews = parseReviews(doc)
    expect(reviews.some((r) => r.id === '9001005')).toBe(false)
  })

  it('본문에 리뷰 텍스트가 들어 있다', () => {
    const reviews = parseReviews(doc)
    expect(reviews[0].text).toContain('3주 썼는데')
    expect(reviews[3].text).toContain('향이 생각보다 강해서')
  })

  it('체험단 문구 변형 두 가지가 본문에 포함된다', () => {
    const reviews = parseReviews(doc)
    expect(reviews[1].text).toContain('무료로 제공 받아 작성한 구매 후기입니다.')
    expect(reviews[2].text).toContain('무료 제공받아 작성한 리뷰입니다.')
  })

  it('id 노드가 없으면 인덱스 폴백을 쓴다', () => {
    const noId = new JSDOM(`<body><div id="sdpReview"><article>
      <i class="twc-bg-full-star"></i><i class="twc-bg-full-star"></i>
      <div>아이디 없는 리뷰</div>
    </article></div></body>`).window.document
    const reviews = parseReviews(noId)
    expect(reviews).toHaveLength(1)
    expect(reviews[0].id).toBe('crf-0')
  })

  it('각 리뷰가 자기 element를 들고 있다', () => {
    const reviews = parseReviews(doc)
    for (const review of reviews) {
      expect(review.element.tagName).toBe('ARTICLE')
    }
  })

  it('컨테이너 밖 article은 파싱하지 않는다', () => {
    const outside = new JSDOM(`<body>
      <article><i class="twc-bg-full-star"></i>컨테이너 밖</article>
      <div id="sdpReview"><article>
        <i class="twc-bg-full-star"></i><i class="twc-bg-full-star"></i>
        <div>안쪽 리뷰</div>
      </article></div>
    </body>`).window.document
    const reviews = parseReviews(outside)
    expect(reviews).toHaveLength(1)
    expect(reviews[0].text).toContain('안쪽 리뷰')
  })

  it('배너를 삽입할 컨테이너를 찾는다', () => {
    expect(findReviewContainer(doc).id).toBe('sdpReview')
  })

  it('리뷰가 없는 문서에서는 빈 배열과 null을 반환한다', () => {
    const empty = new JSDOM('<body><div>리뷰 없음</div></body>').window.document
    expect(parseReviews(empty)).toEqual([])
    expect(findReviewContainer(empty)).toBeNull()
  })

  it('id 노드가 있으면 hasStableId가 true다', () => {
    const reviews = parseReviews(doc)
    for (const review of reviews) {
      expect(review.hasStableId).toBe(true)
    }
  })

  it('id 노드가 없으면 hasStableId가 false다', () => {
    const noId = new JSDOM(`<body><div id="sdpReview"><article>
      <i class="twc-bg-full-star"></i><i class="twc-bg-full-star"></i>
      <div>아이디 없는 리뷰</div>
    </article></div></body>`).window.document
    const reviews = parseReviews(noId)
    expect(reviews[0].hasStableId).toBe(false)
    expect(reviews[0].id).toBe('crf-0')
  })
})
