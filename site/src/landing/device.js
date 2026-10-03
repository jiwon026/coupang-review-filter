const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile/i
const MAC_UA = /Macintosh/

// 화면 종류. 크롬 확장은 PC 크롬에서만 설치되므로 설치 버튼을 보일지 가르는 데 쓴다.
// 판정 순서: userAgentData.mobile, 모바일 UA, 터치 맥, 그 밖은 desktop.
// 아이패드OS 13 부터 사파리는 데스크톱 모드가 기본이라 맥과 같은 UA 를 보내고 userAgentData 도 없다.
// 실제 맥은 터치 지점이 0 이고 아이패드는 5 이므로 Macintosh 이면서 2 이상일 때만 모바일로 본다.
// 터치 노트북(윈도우)은 Macintosh 가 아니므로 desktop 이다.
export function deviceClass({ userAgent = '', uaDataMobile, maxTouchPoints } = {}) {
  if (typeof uaDataMobile === 'boolean') return uaDataMobile ? 'mobile' : 'desktop'
  if (MOBILE_UA.test(userAgent)) return 'mobile'
  if (MAC_UA.test(userAgent) && typeof maxTouchPoints === 'number' && maxTouchPoints > 1) return 'mobile'
  return 'desktop'
}
