import { SELECTORS, SORT_SELECTORS, SORT_LABELS } from './selectors.js'

// 쿠팡은 두 정렬 버튼 모두에 twc-font-bold 를 넣고 비활성에만 twc-font-normal 을 붙인다.
// 그래서 토큰 twc-font-normal 이 없는 버튼이 활성이다. 활성이 정확히 하나가 아니면 마크업이
// 바뀐 것으로 보고 틀린 값을 기록하지 않도록 unknown 을 돌려준다.
export function detectSort(root) {
  const container = root.querySelector(SELECTORS.reviewContainer)
  if (!container) return 'unknown'

  const buttons = [...container.querySelectorAll(SORT_SELECTORS.sortButton)]

  const active = []
  for (const [key, label] of Object.entries(SORT_LABELS)) {
    const button = buttons.find((element) => element.textContent.trim() === label)
    if (button && !button.classList.contains(SORT_SELECTORS.inactiveClass)) active.push(key)
  }

  return active.length === 1 ? active[0] : 'unknown'
}
