import { isSponsoredReview, SPONSORED_LABEL } from '../core/sponsored.js'
import { OWN_BADGE_CLASS } from './selectors.js'

const HIDDEN_CLASS = 'crf-hidden'

// 화면의 모든 카드를 판정 결과에 맞춘다. 무신사는 카드 요소를 그대로 두고 번호와 내용만 바꿔 다시 쓴다.
// 그래서 체험단이던 요소에 일반 후기가 들어오면 앞서 붙인 배지를 지운다.
export function markSponsored(reviews, markers) {
  for (const review of reviews) {
    const badges = review.element.querySelectorAll(`.${OWN_BADGE_CLASS}`)
    if (!isSponsoredReview(review, markers)) {
      for (const badge of badges) badge.remove()
      continue
    }
    if (badges.length > 0) continue

    const badge = document.createElement('span')
    badge.className = OWN_BADGE_CLASS
    badge.textContent = SPONSORED_LABEL
    review.element.appendChild(badge)
  }
}

// 체험단이 아닌 카드에서는 숨김 class 를 뗀다. 다시 쓰인 카드에 앞 후기의 숨김이 남지 않게 한다.
export function applyFilter(reviews, hidden, hiddenClass = HIDDEN_CLASS, markers) {
  for (const review of reviews) {
    review.element.classList.toggle(hiddenClass, hidden && isSponsoredReview(review, markers))
  }
}
