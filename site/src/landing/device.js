const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile/i

// 화면 종류. 크롬 확장은 PC 크롬에서만 설치되므로 설치 버튼을 보일지 가르는 데 쓴다.
// 아이패드의 데스크톱 모드처럼 틀리는 경우가 있고 그때는 설치 버튼이 보일 뿐이다(스토어가 설치 불가를 알려 준다).
export function deviceClass({ userAgent = '', uaDataMobile } = {}) {
  if (typeof uaDataMobile === 'boolean') return uaDataMobile ? 'mobile' : 'desktop'
  return MOBILE_UA.test(userAgent) ? 'mobile' : 'desktop'
}
