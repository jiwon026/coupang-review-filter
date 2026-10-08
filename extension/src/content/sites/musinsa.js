// 무신사의 class 이름은 빌드마다 바뀔 수 있는 꼬리(-sc-...)가 붙는다.
// 그래서 data- 속성을 먼저 쓰고 class 는 앞부분만 본다.
export const SELECTORS = {
  reviewContainer: '[class*="GoodsReviewListSection__Container"]',
  reviewItem: '[data-section-name="review"][data-content-id]',
  reviewStar: '[class*="StarsScore__Container"]',
  sortButton: '[data-filter-type="array_click"]',
  sponsoredFilter: '[data-filter-value="체험단"]',
}

export const REVIEW_ID_ATTRIBUTE = 'data-content-id'

const SORT_KEYS = new Map([
  ['유용한순', 'useful'],
  ['최신순', 'latest'],
  ['댓글순', 'comments'],
  ['높은 평점순', 'rating_high'],
  ['낮은 평점순', 'rating_low'],
])

export const PURCHASE_SELECTORS = {
  cart: '[data-button-id="basket_btn"]',
  buyNow: '[data-button-id="2depth_buy_btn"]',
}

// 체험단 조건을 고르면 버튼의 class 에 이 토큰이 붙는다. 다른 속성은 달라지지 않는다.
const SELECTED_FILTER_CLASS = 'border-black'

// 상품 페이지와 후기 전체보기. 번호 뒤에 다른 글자가 이어지면 대상 페이지가 아니다.
const PRODUCT_PATH = /^\/(?:products|review\/goods)\/(\d+)(?:\/|$)/

const REVIEW_ID = /^\d+$/
const RATING = /^[1-5]$/

function productIdOf(pathname) {
  if (typeof pathname !== 'string') return null
  const matched = PRODUCT_PATH.exec(pathname)
  return matched ? matched[1] : null
}

function findContainer(root) {
  return root.querySelector(SELECTORS.reviewContainer)
}

// 같은 속성을 메뉴와 요약 구역도 쓰고 매거진 카드는 숫자 값까지 쓴다.
// 후기 표식이 있고 번호가 숫자인 것만 후기 카드다.
function readId(item) {
  const id = item.getAttribute(REVIEW_ID_ATTRIBUTE)
  return id !== null && REVIEW_ID.test(id) ? id : null
}

function findItems(container) {
  return [...container.querySelectorAll(SELECTORS.reviewItem)].filter(
    (item) => readId(item) !== null,
  )
}

// 별점은 숫자 하나로 적혀 있다. 1~5 의 정수가 아니면 읽지 못한 것으로 본다.
function readRating(item) {
  const node = item.querySelector(SELECTORS.reviewStar)
  const value = node ? node.textContent.trim() : ''
  return RATING.test(value) ? Number(value) : 0
}

// 정렬 버튼의 글자가 지금 정렬이다. 아는 글자가 아니면 틀린 값을 기록하지 않도록 unknown 을 돌려준다.
function detectSort(root) {
  const container = findContainer(root)
  const button = container ? container.querySelector(SELECTORS.sortButton) : null
  if (!button) return 'unknown'

  return SORT_KEYS.get(button.textContent.trim()) ?? 'unknown'
}

function isSponsoredOnlyView(root) {
  const container = findContainer(root)
  const filter = container ? container.querySelector(SELECTORS.sponsoredFilter) : null
  return filter ? filter.classList.contains(SELECTED_FILTER_CLASS) : false
}

export const musinsa = {
  id: 'musinsa',
  hosts: ['www.musinsa.com'],
  keyPrefix: 'musinsa:',
  productIdOf,
  findContainer,
  findItems,
  readId,
  readRating,
  markers: ['이 후기는 제품을 무상으로 제공받아'],
  detectSort,
  purchase: PURCHASE_SELECTORS,
  // 배너는 후기 구역 바로 앞에 넣는다.
  bannerAnchor: (container) => container,
  isSponsoredOnlyView,
  // 화면 밖 카드를 지우는 목록이 카드 높이로 자리를 잡으므로 없애지 않고 접는다.
  hiddenClass: 'crf-collapsed',
  observation: 'batch',
}
