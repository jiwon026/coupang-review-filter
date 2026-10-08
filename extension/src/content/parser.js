import { OWN_BADGE_CLASS } from './selectors.js'
import { coupang } from './sites/coupang.js'
import { isSponsored } from '../core/sponsored.js'

function extractText(item) {
  const full = item.textContent.trim()
  const badge = item.querySelector(`.${OWN_BADGE_CLASS}`)
  if (!badge) return full

  const badgeText = badge.textContent
  return full.endsWith(badgeText) ? full.slice(0, -badgeText.length).trim() : full
}

export function findReviewContainer(root, site = coupang) {
  return site.findContainer(root)
}

export function parseReviews(root, site = coupang) {
  const container = findReviewContainer(root, site)
  if (!container) return []

  const items = site.findItems(container)
  const reviews = []

  items.forEach((item, index) => {
    const rating = site.readRating(item)
    if (rating < 1 || rating > 5) return

    const stableId = site.readId(item)
    const text = extractText(item)

    reviews.push({
      id: stableId || `crf-${index}`,
      hasStableId: stableId !== null,
      rating,
      text,
      sponsored: isSponsored(text, site.markers),
      element: item,
    })
  })

  return reviews
}
