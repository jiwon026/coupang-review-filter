import { parseReviews, findReviewContainer } from './parser.js'
import { summarize } from '../core/rating.js'
import { createBanner } from './banner.js'
import { markSponsored, applyFilter } from './filter.js'

const LOG_PREFIX = '[체험단 필터]'

const state = {
  hidden: false,
  lastKey: '',
}

console.log(`${LOG_PREFIX} 콘텐츠 스크립트 로드됨`)

function render() {
  const container = findReviewContainer(document)
  if (!container) return

  const reviews = parseReviews(document)
  if (reviews.length === 0) return

  const key = reviews.map((review) => review.id).join(',')
  const bannerPresent = document.querySelector('[data-crf-banner="1"]') !== null
  if (key === state.lastKey && bannerPresent) return
  state.lastKey = key

  markSponsored(reviews)
  applyFilter(reviews, state.hidden)

  const summary = summarize(reviews)
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
