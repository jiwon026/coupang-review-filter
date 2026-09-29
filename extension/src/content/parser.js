import { SELECTORS } from './selectors.js'

function extractRating(item) {
  return item.querySelectorAll(SELECTORS.reviewStar).length
}

export function findReviewContainer(root) {
  return root.querySelector(SELECTORS.reviewContainer)
}

export function parseReviews(root) {
  const items = root.querySelectorAll(SELECTORS.reviewItem)
  const reviews = []

  for (const item of items) {
    const rating = extractRating(item)
    if (rating < 1 || rating > 5) continue

    reviews.push({
      id: item.getAttribute('data-review-id'),
      rating,
      text: item.textContent.trim(),
      element: item,
    })
  }

  return reviews
}
