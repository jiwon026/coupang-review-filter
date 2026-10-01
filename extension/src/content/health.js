// 쿠팡 마크업이 바뀌어 셀렉터가 깨졌는지 판정하는 순수 함수들. DOM 을 직접 만지지 않는다.

export const ERROR_MESSAGE_MAX_LENGTH = 120

// 리뷰가 페이지 하단에 있으므로 문서의 이만큼 내려갔는데도 컨테이너가 없으면 셀렉터가 깨졌을 가능성이 높다.
export const CONTAINER_SCROLL_THRESHOLD = 0.6

// 리뷰 본문이 오류 메시지에 섞여 들어갈 가능성을 길이 제한으로 줄인다.
export function truncateMessage(message) {
  return String(message ?? '').slice(0, ERROR_MESSAGE_MAX_LENGTH)
}

export function scrollRatio({ scrollY, viewportHeight, documentHeight }) {
  if (!(documentHeight > 0)) return 0
  return Math.min(1, (scrollY + viewportHeight) / documentHeight)
}

// 리뷰 요소는 있는데 별점을 하나도 읽지 못했다: 별점 셀렉터가 깨진 것이다.
export function isRatingSelectorBroken({ itemCount, parsedCount }) {
  return itemCount > 0 && parsedCount === 0
}

// 파싱된 리뷰가 모두 id 를 못 얻었다: 누적 집계가 조용히 현재 페이지만 세는 폴백으로 떨어진다.
// 일부만 없는 것은 개별 리뷰의 문제일 수 있어 신호로 보지 않는다.
export function isReviewIdSelectorBroken(reviews) {
  return reviews.length > 0 && reviews.every((review) => review.hasStableId === false)
}

export function isContainerSelectorBroken({ containerFound, maxScrollRatio }) {
  return !containerFound && maxScrollRatio >= CONTAINER_SCROLL_THRESHOLD
}
