import { parseReviews, findReviewContainer } from './parser.js'
import { summarize } from '../core/rating.js'
import { isSponsored } from '../core/sponsored.js'
import { createBanner } from './banner.js'
import { markSponsored, applyFilter } from './filter.js'
import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { detectSort } from './sort.js'
import { watchPurchaseIntent } from './purchase.js'

const LOG_PREFIX = '[체험단 필터]'
const PRODUCT_PATH = /\/vp\/products\/(\d+)/

const state = {
  hidden: false,
  lastKey: '',
  productId: null,
  seen: new Map(),
  variants: { default_filter: 'off', banner_copy: 'rating' },
  renderedAt: 0,
  pagesSeen: 0,
  lastSummary: null,
}

console.log(`${LOG_PREFIX} 콘텐츠 스크립트 로드됨`)

let trackFailureReported = false

function reportTrackFailure(error) {
  if (trackFailureReported) return
  trackFailureReported = true
  console.warn(`${LOG_PREFIX} 이벤트를 백그라운드로 보내지 못했습니다:`, error?.message ?? error)
}

function track(eventType, properties = {}) {
  // 계측 실패가 제품을 멈추면 안 되므로 예외는 삼키되, 원인은 한 번 알린다.
  // MV3의 sendMessage는 콜백이 없으면 Promise를 반환하므로 동기 예외와 거부를 모두 잡는다.
  try {
    const pending = chrome.runtime.sendMessage({
      type: MESSAGES.TRACK,
      eventType,
      properties: { review_sort: detectSort(document), ...properties },
    })
    if (pending && typeof pending.catch === 'function') pending.catch(reportTrackFailure)
  } catch (error) {
    reportTrackFailure(error)
  }
}

function secondsSinceRender() {
  return state.renderedAt === 0 ? 0 : Math.round((Date.now() - state.renderedAt) / 1000)
}

function currentProductId() {
  const matched = window.location.pathname.match(PRODUCT_PATH)
  return matched ? matched[1] : null
}

function resetIfProductChanged() {
  const productId = currentProductId()
  if (productId === state.productId) return
  state.productId = productId
  state.seen.clear()
  state.lastKey = ''
  state.renderedAt = 0
  state.pagesSeen = 0
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

function render({ force = false } = {}) {
  resetIfProductChanged()

  const container = findReviewContainer(document)
  if (!container) return

  const reviews = parseReviews(document)
  if (reviews.length === 0) return

  const key = reviews
    .map((review) => `${review.id}:${review.rating}:${review.text.length}`)
    .join(',')
  const bannerPresent = document.querySelector('[data-crf-banner="1"]') !== null
  const reviewSetChanged = key !== state.lastKey
  if (!reviewSetChanged && bannerPresent && !force) return
  state.lastKey = key

  markSponsored(reviews)
  applyFilter(reviews, state.hidden)

  const summary = summarize(accumulate(reviews))
  state.lastSummary = summary
  console.log(
    `${LOG_PREFIX} 리뷰 ${summary.total}건, 체험단 ${summary.sponsoredCount}건, ` +
      `평균 ${summary.ratingOfficial} → 체험단 제외 ${summary.ratingFiltered} ` +
      `[${reviews[0].id}..${reviews[reviews.length - 1].id}]`,
  )

  // 관측은 리뷰 묶음이 실제로 바뀔 때만 기록한다.
  // 토글, 변형 도착, 배너 복구는 다시 그리기일 뿐 새 관측이 아니다.
  if (reviewSetChanged) {
    state.pagesSeen += 1
    if (state.renderedAt === 0) state.renderedAt = Date.now()
    track(EVENTS.BANNER_RENDERED, {
      review_count: summary.total,
      sponsored_count: summary.sponsoredCount,
      sponsored_ratio: summary.sponsoredRatio,
      rating_official: summary.ratingOfficial,
      rating_filtered: summary.ratingFiltered,
      rating_delta: summary.ratingDelta,
      page_review_count: reviews.length,
      page_sponsored_count: reviews.filter((review) => isSponsored(review.text)).length,
      pages_seen: state.pagesSeen,
    })
  }

  const banner = createBanner(summary, {
    hidden: state.hidden,
    copyVariant: state.variants.banner_copy,
    onToggle: (next) => {
      state.hidden = next
      applyFilter(reviews, next)
      track(EVENTS.FILTER_TOGGLED, {
        to_state: next ? 'on' : 'off',
        default_state: state.variants.default_filter,
        seconds_since_render: secondsSinceRender(),
        pages_seen: state.pagesSeen,
      })
      render({ force: true })
    },
  })

  const existing = document.querySelector('[data-crf-banner="1"]')
  if (existing) existing.remove()
  container.parentNode.insertBefore(banner, container)
}

function applyVariants() {
  try {
    chrome.runtime.sendMessage({ type: MESSAGES.GET_VARIANT }, (response) => {
      if (!response?.variants) return

      const previousCopy = state.variants.banner_copy
      state.variants = response.variants

      const hidden = state.variants.default_filter === 'on'
      const hiddenChanged = hidden !== state.hidden
      const copyChanged = state.variants.banner_copy !== previousCopy
      if (!hiddenChanged && !copyChanged) return

      state.hidden = hidden
      render({ force: true })
    })
  } catch (error) {
    console.warn(`${LOG_PREFIX} 실험 배정을 받지 못했습니다. 기본값으로 동작합니다.`)
  }
}

function start() {
  render()
  const observer = new MutationObserver(() => render())
  observer.observe(document.body, { childList: true, subtree: true })

  watchPurchaseIntent(document, (kind) => {
    const summary = state.lastSummary
    track(EVENTS.PURCHASE_INTENT_CLICKED, {
      intent_kind: kind,
      filter_state: state.hidden ? 'on' : 'off',
      seconds_on_page: secondsSinceRender(),
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
