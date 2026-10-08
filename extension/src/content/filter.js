import { isSponsoredReview, SPONSORED_LABEL } from '../core/sponsored.js'
import { OWN_BADGE_CLASS } from './selectors.js'

const HIDDEN_CLASS = 'crf-hidden'

export function markSponsored(reviews, markers) {
  for (const review of reviews) {
    if (!isSponsoredReview(review, markers)) continue
    if (review.element.querySelector(`.${OWN_BADGE_CLASS}`)) continue

    const badge = document.createElement('span')
    badge.className = OWN_BADGE_CLASS
    badge.textContent = SPONSORED_LABEL
    review.element.appendChild(badge)
  }
}

export function applyFilter(reviews, hidden, hiddenClass = HIDDEN_CLASS, markers) {
  for (const review of reviews) {
    if (!isSponsoredReview(review, markers)) continue
    review.element.classList.toggle(hiddenClass, hidden)
  }
}
