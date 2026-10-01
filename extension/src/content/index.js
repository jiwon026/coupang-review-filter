import { parseReviews, findReviewContainer } from './parser.js'
import { SELECTORS } from './selectors.js'
import { truncateMessage, scrollRatio, createObservation, selectHealthSignals } from './health.js'
import { summarize } from '../core/rating.js'
import { isSponsored } from '../core/sponsored.js'
import { createBanner } from './banner.js'
import { markSponsored, applyFilter } from './filter.js'
import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { debugLog } from '../shared/log.js'
import { detectSort } from './sort.js'
import { watchPurchaseIntent } from './purchase.js'

const LOG_PREFIX = '[체험단 필터]'
const PRODUCT_PATH = /\/vp\/products\/(\d+)/
// 변형 응답이 오지 않을 때 기본값으로 확정하기까지 기다리는 시간.
const VARIANT_WAIT_MS = 3000
const DEFAULT_VARIANTS = { default_filter: 'off', banner_copy: 'rating' }

const state = {
  hidden: false,
  // 변형이 확정되기 전에 사용자가 토글했으면 도착한 변형이 그 선택을 덮지 않는다.
  userToggled: false,
  variants: DEFAULT_VARIANTS,
  // 확정 전 관측 이벤트는 pendingEvents 에 쌓았다가 확정 뒤 확정된 상태로 보낸다.
  variantsResolved: false,
  pendingEvents: [],
  // 다시 그리기 키(글자 수 포함)와 관측 키(안정 id 면 id 만)를 따로 둔다.
  redrawKey: '',
  observationKey: '',
  productId: null,
  seen: new Map(),
  renderedAt: 0,
  pagesSeen: 0,
  // 같은 상품에서 마지막으로 관측한 정렬과 그 정렬에서 본 페이지 수.
  observedSort: null,
  sortPagesSeen: 0,
  lastSummary: null,
  reportedErrors: new Set(),
  observation: createObservation(),
}

/* @__PURE__ */ debugLog(`${LOG_PREFIX} 콘텐츠 스크립트 로드됨`)

let trackFailureReported = false
let variantTimer = null

function reportTrackFailure(error) {
  if (trackFailureReported) return
  trackFailureReported = true
  console.warn(`${LOG_PREFIX} 백그라운드에 메시지를 보내지 못했습니다:`, error?.message ?? error)
}

function sendToBackground(message) {
  // 계측 실패가 제품을 멈추면 안 되므로 예외는 삼키되, 원인은 한 번 알린다.
  // MV3의 sendMessage는 콜백이 없으면 Promise를 반환하므로 동기 예외와 거부를 모두 잡는다.
  try {
    const pending = chrome.runtime.sendMessage(message)
    if (pending && typeof pending.catch === 'function') pending.catch(reportTrackFailure)
  } catch (error) {
    reportTrackFailure(error)
  }
}

function sendTrack(eventType, properties) {
  sendToBackground({ type: MESSAGES.TRACK, eventType, properties })
}

function filterState() {
  return state.hidden ? 'on' : 'off'
}

// 이벤트를 만들고 보내는 과정 전체를 보호한다. 정렬 판별, 상품 번호, 프로퍼티 계산이 던져도
// 렌더나 사용자 동작을 막지 않고 원인은 한 번 알린다. properties 는 객체이거나 같은 보호 안에서 계산할 함수다.
// afterVariants 를 주면 변형이 확정된 뒤의 값을 보낼 때 계산해 더한다. 확정 전이면 대기열에 둔다.
function track(eventType, properties = {}, afterVariants = null) {
  try {
    const captured = {
      review_sort: detectSort(document),
      product_id: currentProductId(),
      ...(typeof properties === 'function' ? properties() : properties),
    }
    if (afterVariants && !state.variantsResolved) {
      state.pendingEvents.push({ eventType, captured, afterVariants })
      return
    }
    sendTrack(eventType, afterVariants ? { ...captured, ...afterVariants() } : captured)
  } catch (error) {
    reportTrackFailure(error)
  }
}

function flushPendingEvents() {
  const pending = state.pendingEvents
  state.pendingEvents = []
  for (const { eventType, captured, afterVariants } of pending) {
    try {
      sendTrack(eventType, { ...captured, ...afterVariants() })
    } catch (error) {
      reportTrackFailure(error)
    }
  }
}

// 같은 상품 페이지에서 같은 error_type 과 error_name 조합은 한 번만 보낸다.
// render 는 MutationObserver 가 수시로 부르므로 억제하지 않으면 같은 예외가 이벤트를 폭주시킨다.
function reportExtensionError(properties) {
  try {
    const key = `${properties.error_type}|${properties.error_name ?? ''}`
    if (state.reportedErrors.has(key)) return
    state.reportedErrors.add(key)
    track(EVENTS.EXTENSION_ERROR, properties)
  } catch (error) {
    // 보고 경로의 실패가 제품이나 이후 보고를 막으면 안 된다.
    reportTrackFailure(error)
  }
}

function reportRenderException(error) {
  reportExtensionError({
    error_type: 'RenderException',
    error_name: error?.name ?? 'Unknown',
    error_message: truncateMessage(error?.message),
  })
}

function currentScrollRatio() {
  return scrollRatio({
    scrollY: window.scrollY,
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
  })
}

function trackScroll() {
  state.observation.maxScrollRatio = Math.max(state.observation.maxScrollRatio, currentScrollRatio())
}

// 렌더는 관측만 쌓고, 셀렉터 깨짐 판정은 상품 페이지를 떠날 때 한 번 한다.
// leaving 을 넘기면 떠나는 상품의 번호와 마지막 관측 정렬로 보낸다(같은 탭 안 이동에서 현재 주소와 정렬은 이미 새 페이지 값이다).
// 마지막 스크롤은 pagehide 경로(leaving 없음)에서만 반영한다. 상품 전환 때의 scrollY 는 이미 새 페이지 값이다.
function flushHealthSignals(leaving) {
  try {
    if (leaving === undefined) trackScroll()
    for (const signal of selectHealthSignals(state.observation)) {
      reportExtensionError(
        leaving === undefined
          ? signal
          : { ...signal, product_id: leaving.productId, review_sort: leaving.reviewSort },
      )
    }
  } catch (error) {
    reportTrackFailure(error)
  }
}

function observeReviews(container, reviews) {
  const observation = state.observation
  observation.containerFound = true
  observation.maxItemCount = Math.max(
    observation.maxItemCount,
    container.querySelectorAll(SELECTORS.reviewItem).length,
  )
  observation.maxParsedCount = Math.max(observation.maxParsedCount, reviews.length)
  if (reviews.length > 0) observation.parsedAnyReview = true
  if (reviews.some((review) => review.hasStableId)) observation.sawStableId = true
}

// 첫 배너 이후 경과 초. 배너가 없었으면 null 이다(0 이면 즉시 행동과 구분되지 않는다).
function secondsSinceRender() {
  return state.renderedAt === 0 ? null : Math.round((Date.now() - state.renderedAt) / 1000)
}

// 문서가 열린 뒤 경과한 진짜 페이지 체류 시간(초).
function secondsOnPage() {
  return Math.round(performance.now() / 1000)
}

function currentProductId() {
  const matched = window.location.pathname.match(PRODUCT_PATH)
  return matched ? matched[1] : null
}

function resetIfProductChanged() {
  const productId = currentProductId()
  if (productId === state.productId) return
  // 떠나는 상품의 신호를 먼저 판정하고 나서 비운다. pagehide 만 기다리면 같은 탭 안 이동에서 앞 상품 신호가 사라진다.
  if (state.productId !== null) {
    flushHealthSignals({ productId: state.productId, reviewSort: state.observedSort ?? 'unknown' })
  }
  state.productId = productId
  state.seen.clear()
  state.redrawKey = ''
  state.observationKey = ''
  state.renderedAt = 0
  state.pagesSeen = 0
  state.observedSort = null
  state.sortPagesSeen = 0
  state.reportedErrors.clear()
  state.observation = createObservation()
}

function accumulate(reviews) {
  const identified = reviews.filter((review) => review.hasStableId)

  if (identified.length === 0) {
    return reviews.map((review) => ({
      rating: review.rating,
      sponsored: isSponsored(review.text),
    }))
  }

  for (const review of identified) {
    state.seen.set(review.id, {
      rating: review.rating,
      sponsored: isSponsored(review.text),
    })
  }

  return [...state.seen.values()]
}

function render(options) {
  try {
    renderReviews(options)
  } catch (error) {
    // 콘텐츠 스크립트가 죽으면 이후 페이지 전환에서 아무것도 안 되므로 다시 던지지 않는다.
    reportRenderException(error)
  }
}

// 다시 그리기 키: 늦게 채워진 본문(체험단 문구 등)도 다시 판정하도록 글자 수까지 본다.
function redrawKeyOf(reviews) {
  return reviews.map((review) => `${review.id}:${review.rating}:${review.text.length}`).join(',')
}

// 관측 키: 안정 id 가 있으면 id 만 본다. 도움이 돼요, 더보기로 글자 수만 바뀐 같은 페이지를 새 관측으로 세지 않는다.
// 폴백 id 는 위치 번호라 페이지가 바뀌어도 같으므로 내용까지 본다.
function observationKeyOf(reviews) {
  return reviews
    .map((review) =>
      review.hasStableId ? review.id : `${review.id}:${review.rating}:${review.text.length}`,
    )
    .join(',')
}

// Banner Rendered 프로퍼티. track 의 보호 안에서 계산한다.
function observationProperties(reviews, summary, pagesSeen) {
  const sort = detectSort(document)
  // 정렬을 바꾸면 쿠팡은 1페이지를 보여 주므로 sort_pages_seen = 1 이 그 정렬의 첫 페이지다.
  if (sort !== state.observedSort) {
    state.observedSort = sort
    state.sortPagesSeen = 0
  }
  state.sortPagesSeen += 1

  return {
    review_sort: sort,
    review_count: summary.total,
    sponsored_count: summary.sponsoredCount,
    sponsored_ratio: summary.sponsoredRatio,
    rating_official: summary.ratingOfficial,
    rating_filtered: summary.ratingFiltered,
    rating_delta: summary.ratingDelta,
    page_review_count: reviews.length,
    page_sponsored_count: reviews.filter((review) => isSponsored(review.text)).length,
    pages_seen: pagesSeen,
    sort_pages_seen: state.sortPagesSeen,
    // 같은 페이지 재방문을 분석에서 중복 제거하는 키. 공개 id 만 쓰고 본문은 싣지 않는다.
    page_first_review_id: reviews[0].hasStableId ? reviews[0].id : null,
  }
}

function renderReviews({ force = false } = {}) {
  resetIfProductChanged()

  const container = findReviewContainer(document)
  if (!container) return

  const reviews = parseReviews(document)
  observeReviews(container, reviews)
  if (reviews.length === 0) return

  const redrawKey = redrawKeyOf(reviews)
  const observationKey = observationKeyOf(reviews)
  const bannerPresent = document.querySelector('[data-crf-banner="1"]') !== null
  if (redrawKey === state.redrawKey && bannerPresent && !force) return

  markSponsored(reviews)
  applyFilter(reviews, state.hidden)

  const summary = summarize(accumulate(reviews))
  state.lastSummary = summary
  sendToBackground({ type: MESSAGES.SUMMARY_UPDATED, summary })
  /* @__PURE__ */ debugLog(
    `${LOG_PREFIX} 리뷰 ${summary.total}건, 체험단 ${summary.sponsoredCount}건, ` +
      `평균 ${summary.ratingOfficial} → 체험단 제외 ${summary.ratingFiltered} ` +
      `[${reviews[0].id}..${reviews[reviews.length - 1].id}]`,
  )

  // 관측은 리뷰 묶음이 실제로 바뀔 때만 기록한다.
  // 토글, 변형 도착, 배너 복구, 같은 리뷰의 글자 수 변화는 다시 그리기일 뿐 새 관측이 아니다.
  // filter_state 는 변형이 확정된 뒤 사용자가 실제로 보게 된 상태로 보낸다.
  if (observationKey !== state.observationKey) {
    state.pagesSeen += 1
    if (state.renderedAt === 0) state.renderedAt = Date.now()
    const pagesSeen = state.pagesSeen
    track(
      EVENTS.BANNER_RENDERED,
      () => observationProperties(reviews, summary, pagesSeen),
      () => ({ filter_state: filterState() }),
    )
  }
  // 이 앞에서 예외가 나면 같은 묶음을 다음 렌더가 다시 시도하도록 키는 관측 직후에 갱신한다.
  state.observationKey = observationKey
  state.redrawKey = redrawKey

  const banner = createBanner(summary, {
    hidden: state.hidden,
    copyVariant: state.variants.banner_copy,
    onToggle: (next) => {
      state.hidden = next
      state.userToggled = true
      applyFilter(reviews, next)
      track(
        EVENTS.FILTER_TOGGLED,
        {
          to_state: next ? 'on' : 'off',
          seconds_since_render: secondsSinceRender() ?? 0,
          pages_seen: state.pagesSeen,
        },
        () => ({ default_state: state.variants.default_filter }),
      )
      render({ force: true })
    },
    onDetail: () => {
      sendToBackground({ type: MESSAGES.OPEN_PANEL })
    },
  })

  const existing = document.querySelector('[data-crf-banner="1"]')
  if (existing) existing.remove()
  container.parentNode.insertBefore(banner, container)
}

// 변형 확정. 응답(변형 없음과 lastError 포함), 응답 대기 시간 초과, 요청 실패 중 먼저 오는 하나만 반영한다.
function resolveVariants(variants) {
  if (state.variantsResolved) return
  state.variantsResolved = true
  clearTimeout(variantTimer)

  const previousHidden = state.hidden
  const previousCopy = state.variants.banner_copy
  if (variants) {
    state.variants = variants
    if (!state.userToggled) state.hidden = variants.default_filter === 'on'
  }

  // 변형을 적용한 뒤 대기열을 순서대로 보낸다. 다시 그리기에서 생길 새 관측은 그 뒤에 나간다.
  flushPendingEvents()

  if (state.hidden !== previousHidden || state.variants.banner_copy !== previousCopy) {
    render({ force: true })
  }
}

function applyVariants() {
  variantTimer = setTimeout(() => resolveVariants(null), VARIANT_WAIT_MS)
  try {
    chrome.runtime.sendMessage({ type: MESSAGES.GET_VARIANT }, (response) => {
      // 수신 측이 없으면 lastError 가 설정된 채 응답 없이 불린다. 읽어 두어야 확인되지 않은 오류가 남지 않는다.
      const failed = Boolean(chrome.runtime.lastError)
      resolveVariants(failed ? null : (response?.variants ?? null))
    })
  } catch (error) {
    console.warn(`${LOG_PREFIX} 실험 배정을 받지 못했습니다. 기본값으로 동작합니다.`)
    resolveVariants(null)
  }
}

function start() {
  render()
  const observer = new MutationObserver(() => render())
  observer.observe(document.body, { childList: true, subtree: true })

  window.addEventListener('scroll', trackScroll, { passive: true })
  // 리뷰는 스크롤해야 지연 로딩되므로, 떠나는 시점에 컨테이너를 못 찾았는지 판정한다.
  window.addEventListener('pagehide', () => flushHealthSignals())

  watchPurchaseIntent(document, (kind) => {
    const summary = state.lastSummary
    track(EVENTS.PURCHASE_INTENT_CLICKED, {
      intent_kind: kind,
      filter_state: filterState(),
      seconds_on_page: secondsOnPage(),
      seconds_since_render: secondsSinceRender(),
      pages_seen: state.pagesSeen,
      review_count: summary?.total ?? 0,
      sponsored_ratio: summary?.sponsoredRatio ?? null,
      rating_official: summary?.ratingOfficial ?? null,
      rating_filtered: summary?.ratingFiltered ?? null,
      rating_delta: summary?.ratingDelta ?? null,
    })
  })

  applyVariants()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
