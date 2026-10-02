// 쿠팡 마크업이 바뀌어 셀렉터가 깨졌는지 판정하는 순수 함수들. DOM 을 직접 만지지 않는다.
// 판정은 렌더 순간의 DOM 이 아니라 상품 페이지 동안 누적한 관측으로 한다.
// 지연 로딩으로 별점이나 id 노드가 늦게 붙는 정상 페이지를 오탐하지 않기 위해서다.

// 리뷰가 페이지 하단에 있으므로 문서의 이만큼 내려갔는데도 컨테이너가 없으면 셀렉터가 깨졌을 가능성이 높다.
export const CONTAINER_SCROLL_THRESHOLD = 0.6

// 스크롤한 양을 스크롤 가능한 길이로 나눈 비율(0~1). 스크롤하지 않았으면 문서 길이와 무관하게 0 이다.
export function scrollRatio({ scrollY, viewportHeight, documentHeight }) {
  const scrollable = Math.max(1, documentHeight - viewportHeight)
  return Math.min(1, Math.max(0, scrollY / scrollable))
}

export function createObservation() {
  return {
    containerFound: false,
    maxScrollRatio: 0,
    maxItemCount: 0,
    maxParsedCount: 0,
    parsedAnyReview: false,
    sawStableId: false,
  }
}

// 누적 관측을 받아 보낼 Extension Error 속성 목록을 돌려준다.
export function selectHealthSignals(observed) {
  const signals = []

  // 컨테이너를 한 번도 못 찾았는데 리뷰가 있을 법한 깊이까지 내려갔다.
  if (!observed.containerFound && observed.maxScrollRatio >= CONTAINER_SCROLL_THRESHOLD) {
    signals.push({
      error_type: 'ReviewContainerNotFound',
      max_scroll_ratio: Math.round(observed.maxScrollRatio * 100) / 100,
    })
  }

  // 리뷰 요소는 봤는데 별점을 읽어 파싱한 리뷰가 한 번도 없었다: 별점 셀렉터가 깨진 것이다.
  if (observed.maxItemCount > 0 && !observed.parsedAnyReview) {
    signals.push({ error_type: 'ReviewRatingNotFound', item_count: observed.maxItemCount })
  }

  // 파싱된 리뷰가 있었는데 id 를 한 번도 못 봤다: 누적 집계가 조용히 현재 페이지만 세는 폴백으로 떨어진다.
  // 일부만 없는 것은 개별 리뷰의 문제일 수 있어 신호로 보지 않는다.
  if (observed.parsedAnyReview && !observed.sawStableId) {
    signals.push({ error_type: 'ReviewIdNotFound', review_count: observed.maxParsedCount })
  }

  return signals
}
