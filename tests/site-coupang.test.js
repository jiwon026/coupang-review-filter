import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { coupang } from '../extension/src/content/sites/coupang.js'
import { parseReviews, findReviewContainer } from '../extension/src/content/parser.js'
import { detectSort } from '../extension/src/content/sort.js'
import { markSponsored, applyFilter } from '../extension/src/content/filter.js'
import {
  isSponsored,
  isSponsoredReview,
  SPONSORED_MARKERS,
} from '../extension/src/core/sponsored.js'
import {
  SELECTORS,
  REVIEW_ID_ATTRIBUTE,
  OWN_BADGE_CLASS,
  SORT_SELECTORS,
  SORT_LABELS,
  PURCHASE_SELECTORS,
} from '../extension/src/content/selectors.js'
import { sortButtonsHtml } from './helpers/sort-buttons.js'

const html = readFileSync(new URL('./fixtures/review-section.html', import.meta.url), 'utf8')

const MARKER = '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.'

describe('쿠팡 부품의 값', () => {
  it('고정 값이 부품의 모양과 맞는다', () => {
    expect(coupang.id).toBe('coupang')
    expect(coupang.hosts).toEqual(['www.coupang.com'])
    expect(coupang.keyPrefix).toBe('')
    expect(coupang.hiddenClass).toBe('crf-hidden')
    expect(coupang.observation).toBe('page')
    expect(coupang.watchAttributes).toEqual([])
  })

  it('체험단 문구는 쿠팡 문구 목록이다', () => {
    expect(coupang.markers).toEqual(SPONSORED_MARKERS)
  })

  it('구매 버튼 선택자는 지금 값 그대로다', () => {
    expect(coupang.purchase).toEqual({ cart: 'button.prod-cart-btn', buyNow: 'button.prod-buy-btn' })
  })

  it('selectors.js 는 옮기기 전과 같은 값을 내보낸다', () => {
    expect(SELECTORS).toEqual({
      reviewContainer: '#sdpReview',
      reviewItem: 'article',
      reviewIdNode: '[data-review-id]',
      reviewStar: 'i[class*="twc-bg-full-star"]',
    })
    expect(REVIEW_ID_ATTRIBUTE).toBe('data-review-id')
    expect(OWN_BADGE_CLASS).toBe('crf-badge')
    expect(SORT_SELECTORS).toEqual({ sortButton: 'button', inactiveClass: 'twc-font-normal' })
    expect(SORT_LABELS).toEqual({ best: '베스트순', latest: '최신순' })
    expect(PURCHASE_SELECTORS).toBe(coupang.purchase)
  })
})

describe('쿠팡 부품의 상품 번호', () => {
  it('상품 페이지 경로에서 번호를 읽는다', () => {
    expect(coupang.productIdOf('/vp/products/123?x=1'.split('?')[0])).toBe('123')
    expect(coupang.productIdOf('/vp/products/7590830589')).toBe('7590830589')
  })

  it('대상 페이지가 아니면 null', () => {
    expect(coupang.productIdOf('/np/search')).toBeNull()
    expect(coupang.productIdOf('/vp/products/')).toBeNull()
    expect(coupang.productIdOf('')).toBeNull()
  })
})

describe('쿠팡 부품이 픽스처를 읽는다', () => {
  let doc

  beforeEach(() => {
    doc = new JSDOM(`<body>${html}</body>`).window.document
  })

  it('findContainer 는 parser 가 찾는 컨테이너와 같다', () => {
    expect(coupang.findContainer(doc).id).toBe('sdpReview')
    expect(coupang.findContainer(doc)).toBe(findReviewContainer(doc))
  })

  it('후기 구역이 없으면 findContainer 는 null', () => {
    const empty = new JSDOM('<body><div>리뷰 없음</div></body>').window.document
    expect(coupang.findContainer(empty)).toBeNull()
  })

  it('findItems 는 별점 없는 카드까지 배열로 돌려준다', () => {
    const items = coupang.findItems(coupang.findContainer(doc))
    expect(Array.isArray(items)).toBe(true)
    expect(items).toHaveLength(doc.querySelectorAll('#sdpReview article').length)
    expect(items.length).toBeGreaterThan(parseReviews(doc).length)
    expect(items.every((item) => item.tagName === 'ARTICLE')).toBe(true)
  })

  it('readId 와 readRating 이 parseReviews 의 결과와 맞는다', () => {
    const reviews = parseReviews(doc)
    expect(reviews).toHaveLength(4)
    for (const review of reviews) {
      expect(coupang.readId(review.element)).toBe(review.id)
      expect(coupang.readRating(review.element)).toBe(review.rating)
    }
  })

  it('번호나 별점을 읽지 못하면 null 과 0 이다', () => {
    const bare = doc.createElement('article')
    expect(coupang.readId(bare)).toBeNull()
    expect(coupang.readRating(bare)).toBe(0)
  })

  it('bannerAnchor 는 컨테이너 자신이다', () => {
    const container = coupang.findContainer(doc)
    expect(coupang.bannerAnchor(container)).toBe(container)
  })

  it('체험단 조건은 항상 off', () => {
    expect(coupang.sponsoredFilterState(doc)).toBe('off')
    expect('isSponsoredOnlyView' in coupang).toBe(false)
  })

  it('detectSort 는 sort.js 가 내보내는 것과 같은 판정이다', () => {
    const build = (active) =>
      new JSDOM(`<body><div id="sdpReview">${sortButtonsHtml(active)}</div></body>`).window.document

    for (const active of ['best', 'latest', 'none', 'both']) {
      expect(coupang.detectSort(build(active))).toBe(detectSort(build(active)))
    }
    expect(coupang.detectSort(build('best'))).toBe('best')
    expect(coupang.detectSort(build('latest'))).toBe('latest')
    expect(coupang.detectSort(doc)).toBe('unknown')
  })
})

describe('parseReviews 가 부품을 받는다', () => {
  it('부품을 안 주면 쿠팡으로 읽고 sponsored 를 더한다', () => {
    const doc = new JSDOM(`<body>${html}</body>`).window.document
    expect(parseReviews(doc).map((review) => review.sponsored)).toEqual([false, true, true, false])
    expect(parseReviews(doc, coupang).map((review) => review.id)).toEqual(
      parseReviews(doc).map((review) => review.id),
    )
  })

  it('다른 부품을 주면 그 부품의 찾기, 읽기, 문구를 쓴다', () => {
    const doc = new JSDOM(`<body><ul id="box">
      <li data-no="a1" data-stars="5">협찬 받아 썼어요</li>
      <li data-no="a2" data-stars="2">직접 샀어요</li>
      <li data-stars="9">별점이 범위 밖</li>
      <li data-stars="3">번호 없음</li>
    </ul></body>`).window.document
    const other = {
      findContainer: (root) => root.querySelector('#box'),
      findItems: (container) => [...container.querySelectorAll('li')],
      readId: (item) => item.getAttribute('data-no'),
      readRating: (item) => Number(item.getAttribute('data-stars')),
      markers: ['협찬 받아'],
    }

    expect(findReviewContainer(doc, other).id).toBe('box')
    const reviews = parseReviews(doc, other)
    expect(reviews.map((review) => review.id)).toEqual(['a1', 'a2', 'crf-3'])
    expect(reviews.map((review) => review.hasStableId)).toEqual([true, true, false])
    expect(reviews.map((review) => review.rating)).toEqual([5, 2, 3])
    expect(reviews.map((review) => review.sponsored)).toEqual([true, false, false])
    // 쿠팡 선택자로는 아무것도 찾지 못하는 문서다.
    expect(parseReviews(doc)).toEqual([])
  })
})

describe('체험단 판정이 문구 목록을 받는다', () => {
  it('문구 목록을 주면 그 목록으로 본다', () => {
    expect(isSponsored('아무 글', ['아무'])).toBe(true)
    expect(isSponsored('아무 글', ['없는 문구'])).toBe(false)
    expect(isSponsored(MARKER, ['아무'])).toBe(false)
  })

  it('인자를 안 주면 쿠팡 문구로 본다', () => {
    expect(isSponsored(`좋아요\n${MARKER}`)).toBe(true)
    expect(isSponsored('아무 글')).toBe(false)
  })

  it('isSponsoredReview 는 sponsored 가 boolean 이면 그 값을 쓴다', () => {
    expect(isSponsoredReview({ text: MARKER, sponsored: false })).toBe(false)
    expect(isSponsoredReview({ text: '직접 샀어요', sponsored: true })).toBe(true)
  })

  it('isSponsoredReview 는 sponsored 가 boolean 이 아니면 글과 문구 목록으로 본다', () => {
    expect(isSponsoredReview({ text: MARKER })).toBe(true)
    expect(isSponsoredReview({ text: '직접 샀어요' })).toBe(false)
    expect(isSponsoredReview({ text: '아무 글' }, ['아무'])).toBe(true)
    expect(isSponsoredReview({ text: MARKER, sponsored: 'yes' }, ['아무'])).toBe(false)
  })
})

describe('filter 가 숨김 class 와 문구 목록을 받는다', () => {
  let reviews

  beforeEach(() => {
    const doc = new JSDOM('<body></body>').window.document
    globalThis.document = doc
    const make = () => doc.body.appendChild(doc.createElement('div'))
    reviews = [
      { id: 'a', rating: 5, text: '아무 글', element: make() },
      { id: 'b', rating: 4, text: MARKER, element: make() },
      { id: 'c', rating: 3, text: '직접 샀어요', sponsored: true, element: make() },
    ]
  })

  it('숨김 class 를 주면 그 class 를 붙였다 뗀다', () => {
    applyFilter(reviews, true, 'crf-collapsed')
    expect(reviews[1].element.className).toBe('crf-collapsed')
    expect(reviews[2].element.className).toBe('crf-collapsed')
    expect(reviews[0].element.className).toBe('')

    applyFilter(reviews, false, 'crf-collapsed')
    expect(reviews[1].element.className).toBe('')
  })

  it('숨김 class 를 안 주면 crf-hidden 이다', () => {
    applyFilter(reviews, true)
    expect(reviews[1].element.className).toBe('crf-hidden')
  })

  it('문구 목록을 주면 그 목록으로 숨긴다', () => {
    applyFilter(reviews, true, 'crf-hidden', ['아무'])
    expect(reviews[0].element.classList.contains('crf-hidden')).toBe(true)
    expect(reviews[1].element.classList.contains('crf-hidden')).toBe(false)
    expect(reviews[2].element.classList.contains('crf-hidden')).toBe(true)
  })

  it('markSponsored 도 sponsored 값과 문구 목록을 따른다', () => {
    markSponsored(reviews, ['아무'])
    expect(reviews[0].element.querySelector('.crf-badge')).toBeTruthy()
    expect(reviews[1].element.querySelector('.crf-badge')).toBeNull()
    expect(reviews[2].element.querySelector('.crf-badge')).toBeTruthy()
  })
})
