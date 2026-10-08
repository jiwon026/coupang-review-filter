import { SPONSORED_MARKERS } from '../../core/sponsored.js'

export const SELECTORS = {
  reviewContainer: '#sdpReview',
  reviewItem: 'article',
  reviewIdNode: '[data-review-id]',
  reviewStar: 'i[class*="twc-bg-full-star"]',
}

export const REVIEW_ID_ATTRIBUTE = 'data-review-id'

export const SORT_SELECTORS = {
  sortButton: 'button',
  inactiveClass: 'twc-font-normal',
}

export const SORT_LABELS = {
  best: '베스트순',
  latest: '최신순',
}

export const PURCHASE_SELECTORS = {
  cart: 'button.prod-cart-btn',
  buyNow: 'button.prod-buy-btn',
}

const PRODUCT_PATH = /\/vp\/products\/(\d+)/

function productIdOf(pathname) {
  const matched = PRODUCT_PATH.exec(pathname)
  return matched ? matched[1] : null
}

function findContainer(root) {
  return root.querySelector(SELECTORS.reviewContainer)
}

function findItems(container) {
  return [...container.querySelectorAll(SELECTORS.reviewItem)]
}

function readId(item) {
  const node = item.querySelector(SELECTORS.reviewIdNode)
  const id = node ? node.getAttribute(REVIEW_ID_ATTRIBUTE) : null
  return id || null
}

function readRating(item) {
  return item.querySelectorAll(SELECTORS.reviewStar).length
}

// 쿠팡은 두 정렬 버튼 모두에 twc-font-bold 를 넣고 비활성에만 twc-font-normal 을 붙인다.
// 그래서 토큰 twc-font-normal 이 없는 버튼이 활성이다. 활성이 정확히 하나가 아니면 마크업이
// 바뀐 것으로 보고 틀린 값을 기록하지 않도록 unknown 을 돌려준다.
export function detectSort(root) {
  const container = root.querySelector(SELECTORS.reviewContainer)
  if (!container) return 'unknown'

  const buttons = [...container.querySelectorAll(SORT_SELECTORS.sortButton)]

  const active = []
  for (const [key, label] of Object.entries(SORT_LABELS)) {
    const button = buttons.find((element) => element.textContent.trim() === label)
    if (button && !button.classList.contains(SORT_SELECTORS.inactiveClass)) active.push(key)
  }

  return active.length === 1 ? active[0] : 'unknown'
}

export const coupang = {
  id: 'coupang',
  hosts: ['www.coupang.com'],
  keyPrefix: '',
  productIdOf,
  findContainer,
  findItems,
  readId,
  readRating,
  markers: SPONSORED_MARKERS,
  detectSort,
  purchase: PURCHASE_SELECTORS,
  // 배너는 후기 구역 바로 앞에 넣는다.
  bannerAnchor: (container) => container,
  // 쿠팡에는 체험단 후기만 모아 보는 조건이 없다.
  sponsoredFilterState: () => 'off',
  hiddenClass: 'crf-hidden',
  observation: 'page',
  // 쿠팡은 페이지를 넘기면 카드를 새로 그린다. 속성 변화는 보지 않는다.
  watchAttributes: [],
}
