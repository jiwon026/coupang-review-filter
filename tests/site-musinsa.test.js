import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { musinsa } from '../extension/src/content/sites/musinsa.js'
import { parseReviews, findReviewContainer } from '../extension/src/content/parser.js'
import { isSponsored } from '../extension/src/core/sponsored.js'

const html = readFileSync(new URL('./fixtures/musinsa-review-section.html', import.meta.url), 'utf8')

const SORT = '[data-filter-type="array_click"]'
const SPONSORED_FILTER = '[data-filter-value="체험단"]'

describe('무신사 부품의 값', () => {
  it('고정 값이 부품의 모양과 맞는다', () => {
    expect(musinsa.id).toBe('musinsa')
    expect(musinsa.hosts).toEqual(['www.musinsa.com'])
    expect(musinsa.keyPrefix).toBe('musinsa:')
    expect(musinsa.hiddenClass).toBe('crf-collapsed')
    expect(musinsa.observation).toBe('batch')
    expect(musinsa.watchAttributes).toEqual(['data-content-id'])
  })

  it('체험단 문구는 무신사 문구 하나다', () => {
    expect(musinsa.markers).toEqual(['이 후기는 제품을 무상으로 제공받아'])
  })

  it('구매 버튼 선택자는 실측한 값이다', () => {
    expect(musinsa.purchase).toEqual({
      cart: '[data-button-id="basket_btn"]',
      buyNow: '[data-button-id="2depth_buy_btn"]',
    })
  })
})

describe('무신사 부품의 상품 번호', () => {
  it.each([
    ['/products/4633343', '4633343'],
    ['/review/goods/4633343', '4633343'],
    ['/products/4633343/', '4633343'],
  ])('%s 에서 번호를 읽는다', (pathname, expected) => {
    expect(musinsa.productIdOf(pathname)).toBe(expected)
  })

  it.each([
    '/products/abc',
    '/main/musinsa/ranking',
    '/review/goods',
    '/app/products/1',
    '/products/4633343abc',
    '',
  ])('%s 는 대상 페이지가 아니라 null', (pathname) => {
    expect(musinsa.productIdOf(pathname)).toBeNull()
  })

  it('문자열이 아니어도 던지지 않고 null', () => {
    expect(musinsa.productIdOf(undefined)).toBeNull()
    expect(musinsa.productIdOf(null)).toBeNull()
  })
})

describe('무신사 부품이 픽스처를 읽는다', () => {
  let doc

  beforeEach(() => {
    doc = new JSDOM(`<body>${html}</body>`).window.document
  })

  it('findContainer 는 class 의 앞부분으로 후기 구역을 찾는다', () => {
    const container = musinsa.findContainer(doc)
    expect(container.className).toContain('GoodsReviewListSection__Container')
    expect(container).toBe(findReviewContainer(doc, musinsa))
  })

  it('후기 구역이 없으면 findContainer 는 null 이고 parseReviews 는 빈 배열이다', () => {
    const empty = new JSDOM('<body><div>후기 없음</div></body>').window.document
    expect(musinsa.findContainer(empty)).toBeNull()
    expect(parseReviews(empty, musinsa)).toEqual([])
  })

  it('parseReviews 는 3건이고 번호, 별점, 체험단 여부가 맞는다', () => {
    const reviews = parseReviews(doc, musinsa)
    expect(reviews.map((review) => review.id)).toEqual(['90000001', '90000002', '90000003'])
    expect(reviews.every((review) => review.hasStableId)).toBe(true)
    expect(reviews.map((review) => review.rating)).toEqual([5, 4, 5])
    expect(reviews.map((review) => review.sponsored)).toEqual([true, false, false])
  })

  it('별점 칸이 5.0 인 카드는 카드로는 찾지만 별점이 0 이라 세지 않는다', () => {
    const items = musinsa.findItems(musinsa.findContainer(doc))
    expect(Array.isArray(items)).toBe(true)
    expect(items.map((item) => musinsa.readId(item))).toEqual([
      '90000001',
      '90000002',
      '90000003',
      '90000004',
    ])
    expect(items.map((item) => musinsa.readRating(item))).toEqual([5, 4, 5, 0])
    expect(parseReviews(doc, musinsa).map((review) => review.id)).not.toContain('90000004')
  })

  it.each(['0', '6', '', '별점', '45'])('별점 칸이 "%s" 이면 0 이다', (value) => {
    const item = musinsa.findItems(musinsa.findContainer(doc))[0]
    item.querySelector('[class*="StarsScore__Container"]').textContent = value
    expect(musinsa.readRating(item)).toBe(0)
  })

  it('번호나 별점을 읽지 못하면 null 과 0 이다', () => {
    const bare = doc.createElement('div')
    expect(musinsa.readId(bare)).toBeNull()
    expect(musinsa.readRating(bare)).toBe(0)
    bare.setAttribute('data-content-id', 'review_filter')
    expect(musinsa.readId(bare)).toBeNull()
  })

  it('매거진 요소와 review_filter 요소는 카드로 세지 않는다', () => {
    expect(doc.querySelector('[data-content-id="166176"]')).toBeTruthy()
    expect(doc.querySelector('[data-content-id="review_filter"]')).toBeTruthy()

    const ids = musinsa
      .findItems(musinsa.findContainer(doc))
      .map((item) => item.getAttribute('data-content-id'))
    expect(ids).toHaveLength(4)
    expect(ids).not.toContain('166176')
    expect(ids).not.toContain('review_filter')
  })

  it('후기 구역 안에 있어도 후기 표식이 없는 숫자 번호 요소는 카드가 아니다', () => {
    const container = musinsa.findContainer(doc)
    const magazine = doc.createElement('div')
    magazine.setAttribute('data-section-name', 'prd_magazine')
    magazine.setAttribute('data-content-id', '166177')
    container.appendChild(magazine)

    expect(musinsa.findItems(container)).toHaveLength(4)
  })

  it('후기 표식이 있어도 번호가 숫자가 아니면 카드가 아니다', () => {
    const container = musinsa.findContainer(doc)
    const menu = doc.createElement('div')
    menu.setAttribute('data-section-name', 'review')
    menu.setAttribute('data-content-id', 'review_filter')
    container.appendChild(menu)

    expect(musinsa.findItems(container)).toHaveLength(4)
  })

  it('bannerAnchor 는 컨테이너 자신이다', () => {
    const container = musinsa.findContainer(doc)
    expect(musinsa.bannerAnchor(container)).toBe(container)
  })

  describe('detectSort', () => {
    it('픽스처는 useful', () => {
      expect(musinsa.detectSort(doc)).toBe('useful')
    })

    it.each([
      ['최신순', 'latest'],
      ['댓글순', 'comments'],
      ['높은 평점순', 'rating_high'],
      ['낮은 평점순', 'rating_low'],
      ['  최신순\n', 'latest'],
      ['인기순', 'unknown'],
      ['', 'unknown'],
      ['constructor', 'unknown'],
    ])('글자가 "%s" 이면 %s', (label, expected) => {
      doc.querySelector(SORT).textContent = label
      expect(musinsa.detectSort(doc)).toBe(expected)
    })

    it('요소를 지우면 unknown', () => {
      doc.querySelector(SORT).remove()
      expect(musinsa.detectSort(doc)).toBe('unknown')
    })

    it('후기 구역 밖의 정렬 요소는 읽지 않는다', () => {
      const sort = doc.querySelector(SORT)
      sort.remove()
      doc.body.appendChild(sort)
      expect(musinsa.detectSort(doc)).toBe('unknown')
    })

    it('후기 구역이 없으면 unknown', () => {
      const empty = new JSDOM('<body></body>').window.document
      expect(musinsa.detectSort(empty)).toBe('unknown')
    })
  })

  describe('isSponsoredOnlyView', () => {
    it('픽스처는 false', () => {
      expect(doc.querySelector(SPONSORED_FILTER).classList.contains('border-gray-300')).toBe(true)
      expect(musinsa.isSponsoredOnlyView(doc)).toBe(false)
    })

    it('class 를 border-black 으로 바꾸면 true', () => {
      const filter = doc.querySelector(SPONSORED_FILTER)
      filter.classList.replace('border-gray-300', 'border-black')
      expect(musinsa.isSponsoredOnlyView(doc)).toBe(true)
    })

    it('요소가 없으면 false', () => {
      doc.querySelector(SPONSORED_FILTER).remove()
      expect(musinsa.isSponsoredOnlyView(doc)).toBe(false)
    })

    it('후기 구역이 없으면 false', () => {
      const empty = new JSDOM('<body></body>').window.document
      expect(musinsa.isSponsoredOnlyView(empty)).toBe(false)
    })
  })

  it('문구의 공백이 달라도 체험단으로 본다', () => {
    const label = doc.querySelector('[class*="ExperienceLabelInfo__Wrapper"]')
    label.lastElementChild.textContent = '이 후기는  제품을 무상으로 제공 받아 직접 사용해 본 후 작성되었습니다.'

    expect(parseReviews(doc, musinsa)[0].sponsored).toBe(true)
    expect(isSponsored('이 후기는  제품을 무상으로 제공 받아', musinsa.markers)).toBe(true)
  })

  it('쿠팡 문구는 무신사에서 체험단으로 보지 않는다', () => {
    expect(
      isSponsored('쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.', musinsa.markers),
    ).toBe(false)
  })

  it('쿠팡 부품으로는 이 문서에서 아무것도 찾지 못한다', () => {
    expect(parseReviews(doc)).toEqual([])
  })
})
