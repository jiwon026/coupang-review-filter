export const SPONSORED_MARKERS = [
  '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.',
]

export const SPONSORED_LABEL = '체험단 제공 리뷰'

function squash(value) {
  return value.replace(/\s+/g, '')
}

export function isSponsored(text) {
  if (typeof text !== 'string' || text.length === 0) return false
  const target = squash(text)
  return SPONSORED_MARKERS.some((marker) => target.includes(squash(marker)))
}
