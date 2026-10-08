// 이벤트의 site 프로퍼티에 실을 수 있는 쇼핑몰 구분. 콘텐츠 스크립트의 쇼핑몰 부품 id 와 같은 값이다.
// shared/site.js 는 랜딩 사이트 설정이라 이름을 달리 했다. 다른 모듈을 가져오지 않는다.
export const SHOP_IDS = ['coupang', 'musinsa']
export const UNKNOWN_SHOP_ID = 'unknown'

// 목록에 있는 문자열만 그대로 쓰고 그 밖에는 고정된 값으로 바꾼다. 메시지와 저장된 요약은 신뢰 경계 밖에서 온다.
export function safeShopId(value) {
  return typeof value === 'string' && SHOP_IDS.includes(value) ? value : UNKNOWN_SHOP_ID
}
