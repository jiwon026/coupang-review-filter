// 2026-10-02 실제 쿠팡 페이지에서 잰 정렬 버튼 className 원문이다. 줄이지 않는다.
// 두 버튼 모두 뒤쪽에 twc-font-bold 를 갖고, 앞쪽의 twc-font-normal 은 비활성에만 붙는다.
export const ACTIVE_SORT_CLASS =
  'twc-font-bold twc-inline-flex twc-items-center twc-justify-center twc-text-[16px]/[20px] twc-font-bold twc-cursor-pointer twc-text-[#346aff] desktop-hover:twc-bg-[#346aff]/20 active:twc-bg-[#346aff]/30'

export const INACTIVE_SORT_CLASS =
  'twc-font-normal twc-inline-flex twc-items-center twc-justify-center twc-text-[16px]/[20px] twc-font-bold twc-cursor-pointer twc-text-bluegray-800 desktop-hover:twc-bg-bluegray-800/20 active:twc-bg-bluegray-800/30'

// active: 'best' | 'latest' | 'none' | 'both'
export function sortButtonsHtml(active) {
  const cls = (key) => (active === key || active === 'both' ? ACTIVE_SORT_CLASS : INACTIVE_SORT_CLASS)
  return `<button class="${cls('best')}">베스트순</button><button class="${cls('latest')}">최신순</button>`
}
