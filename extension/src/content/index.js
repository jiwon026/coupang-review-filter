import { parseReviews, findReviewContainer } from './parser.js'
import { summarize } from '../core/rating.js'
import { createBanner } from './banner.js'
import { markSponsored, applyFilter } from './filter.js'

const state = {
  hidden: false,
  lastKey: '',
}

function render() {
  const container = findReviewContainer(document)
  if (!container) return

  const reviews = parseReviews(document)
  if (reviews.length === 0) return

  const key = reviews.map((review) => review.id).join(',')
  if (key === state.lastKey) return
  state.lastKey = key

  markSponsored(reviews)
  applyFilter(reviews, state.hidden)

  const summary = summarize(reviews)
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
