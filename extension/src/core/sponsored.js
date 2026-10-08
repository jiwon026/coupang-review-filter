// 쿠팡이 붙이는 체험단 표기는 문장 끝이 상품과 시점에 따라 갈린다.
// 실측 변형: "무료로 제공 받아 작성한 구매 후기입니다.", "무료 제공받아 작성한 리뷰입니다.",
// "무료로 제공 받아 작성한 구매후기입니다". 세 변형이 공유하는 접두를 앵커로 쓴다.
export const SPONSORED_MARKERS = [
  '쿠팡체험단 이벤트로 상품을 무료',
]

export const SPONSORED_LABEL = '체험단 제공 리뷰'

function squash(value) {
  return value.replace(/\s+/g, '')
}

export function isSponsored(text, markers = SPONSORED_MARKERS) {
  if (typeof text !== 'string' || text.length === 0) return false
  const target = squash(text)
  return markers.some((marker) => target.includes(squash(marker)))
}

// 파서가 이미 판정해 둔 리뷰는 그 값을 쓰고, 판정이 없는 리뷰만 글로 다시 본다.
export function isSponsoredReview(review, markers) {
  return typeof review.sponsored === 'boolean' ? review.sponsored : isSponsored(review.text, markers)
}
