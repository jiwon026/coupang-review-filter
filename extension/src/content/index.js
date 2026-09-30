import { parseReviews, findReviewContainer } from './parser.js'
import { summarize } from '../core/rating.js'
import { isSponsored } from '../core/sponsored.js'
import { createBanner } from './banner.js'
import { markSponsored, applyFilter } from './filter.js'

const LOG_PREFIX = '[체험단 필터]'
const PRODUCT_PATH = /\/vp\/products\/(\d+)/

const state = {
  hidden: false,
  lastKey: '',
  productId: null,
  seen: new Map(),
}

console.log(`${LOG_PREFIX} 콘텐츠 스크립트 로드됨`)

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
    .map((review) => `${review.id}:${review.rating}:${isSponsored(review.text)}`)
    .join(',')
  const bannerPresent = document.querySelector('[data-crf-banner="1"]') !== null
  if (key === state.lastKey && bannerPresent) return
  state.lastKey = key

  markSponsored(reviews)
  applyFilter(reviews, state.hidden)

  const summary = summarize(accumulate(reviews))
  console.log(
    `${LOG_PREFIX} 리뷰 ${summary.total}건, 체험단 ${summary.sponsoredCount}건, ` +
      `평균 ${summary.ratingOfficial} → 체험단 제외 ${summary.ratingFiltered} ` +
      `[${reviews[0].id}..${reviews[reviews.length - 1].id}]`,
  )

  const banner = createBanner(summary, {
    hidden: state.hidden,
    onToggle: (next) => {
      state.hidden = next
      applyFilter(reviews, next)
      state.lastKey = ''
      render()
    },
  })

  const existing = document.querySelector('[data-crf-banner="1"]')
  if (existing) existing.remove()
  container.parentNode.insertBefore(banner, container)
}

function start() {
  render()
  const observer = new MutationObserver(() => render())
  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
