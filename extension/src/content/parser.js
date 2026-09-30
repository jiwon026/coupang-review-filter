import { SELECTORS, REVIEW_ID_ATTRIBUTE, OWN_BADGE_CLASS } from './selectors.js'

function extractRating(item) {
  return item.querySelectorAll(SELECTORS.reviewStar).length
}

function extractId(item, index) {
  const node = item.querySelector(SELECTORS.reviewIdNode)
  const id = node ? node.getAttribute(REVIEW_ID_ATTRIBUTE) : null
  return id || null
}

function extractText(item) {
  const full = item.textContent.trim()
  const badge = item.querySelector(`.${OWN_BADGE_CLASS}`)
  if (!badge) return full

  const badgeText = badge.textContent
  return full.endsWith(badgeText) ? full.slice(0, -badgeText.length).trim() : full
}

export function findReviewContainer(root) {
  return root.querySelector(SELECTORS.reviewContainer)
}

export function parseReviews(root) {
  const container = findReviewContainer(root)
  if (!container) return []

  const items = container.querySelectorAll(SELECTORS.reviewItem)
  const reviews = []

  items.forEach((item, index) => {
    const rating = extractRating(item)
    if (rating < 1 || rating > 5) return

    const stableId = extractId(item, index)

    reviews.push({
      id: stableId || `crf-${index}`,
      hasStableId: stableId !== null,
      rating,
      text: extractText(item),
      element: item,
    })
  })

  return reviews
}
