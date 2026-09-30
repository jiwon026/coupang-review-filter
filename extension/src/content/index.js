import { parseReviews, findReviewContainer } from './parser.js'
import { summarize } from '../core/rating.js'
import { isSponsored } from '../core/sponsored.js'
import { createBanner } from './banner.js'
import { markSponsored, applyFilter } from './filter.js'
import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'

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
}

console.log(`${LOG_PREFIX} 콘텐츠 스크립트 로드됨`)

function track(eventType, properties = {}) {
  chrome.runtime.sendMessage({ type: MESSAGES.TRACK, eventType, properties })
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

function render() {
  resetIfProductChanged()

  const container = findReviewContainer(document)
  if (!container) return

  const reviews = parseReviews(document)
  if (reviews.length === 0) return

  const key = reviews
    .map((review) => `${review.id}:${review.rating}:${review.text.length}`)
    .join(',')
  const bannerPresent = document.querySelector('[data-crf-banner="1"]') !== null
  if (key === state.lastKey && bannerPresent) return
  state.lastKey = key
  state.pagesSeen += 1
  if (state.renderedAt === 0) state.renderedAt = Date.now()

  markSponsored(reviews)
  applyFilter(reviews, state.hidden)

  const summary = summarize(accumulate(reviews))
  console.log(
    `${LOG_PREFIX} 리뷰 ${summary.total}건, 체험단 ${summary.sponsoredCount}건, ` +
      `평균 ${summary.ratingOfficial} → 체험단 제외 ${summary.ratingFiltered} ` +
      `[${reviews[0].id}..${reviews[reviews.length - 1].id}]`,
  )

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
      state.lastKey = ''
      render()
    },
  })

  const existing = document.querySelector('[data-crf-banner="1"]')
  if (existing) existing.remove()
  container.parentNode.insertBefore(banner, container)
}

function start() {
  chrome.runtime.sendMessage({ type: MESSAGES.GET_VARIANT }, (response) => {
    if (response?.variants) state.variants = response.variants
    state.hidden = state.variants.default_filter === 'on'

    render()
    const observer = new MutationObserver(() => render())
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
