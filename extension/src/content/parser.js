import { SELECTORS, REVIEW_ID_ATTRIBUTE } from './selectors.js'

function extractRating(item) {
  return item.querySelectorAll(SELECTORS.reviewStar).length
}

function extractId(item, index) {
  const node = item.querySelector(SELECTORS.reviewIdNode)
  const id = node ? node.getAttribute(REVIEW_ID_ATTRIBUTE) : null
  return id || `crf-${index}`
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

    reviews.push({
      id: extractId(item, index),
      rating,
      text: item.textContent.trim(),
      element: item,
    })
  })

  return reviews
}
