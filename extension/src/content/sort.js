import { SELECTORS, SORT_SELECTORS, SORT_LABELS } from './selectors.js'

export function detectSort(root) {
  const container = root.querySelector(SELECTORS.reviewContainer)
  if (!container) return 'unknown'

  const buttons = [...container.querySelectorAll(SORT_SELECTORS.sortButton)]

  for (const [key, label] of Object.entries(SORT_LABELS)) {
    const button = buttons.find((element) => element.textContent.trim() === label)
    if (button && String(button.className).includes(SORT_SELECTORS.activeClass)) return key
  }

  return 'unknown'
}
