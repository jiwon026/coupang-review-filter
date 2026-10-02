// 동의 상태 값과 응답 읽기. 백그라운드와 확장 페이지가 같은 값을 쓴다. 다른 모듈을 가져오지 않는다.
export const CONSENT = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDECIDED: 'undecided',
}

// 사용자가 실제로 고른 상태. undecided 는 고르지 않은 것이다.
export const DECIDED_STATUSES = [CONSENT.GRANTED, CONSENT.DENIED]

// GET_CONSENT 응답에서 상태를 읽는다. 읽기 실패 표지가 있거나 모양이 다르면 null 이다.
export function consentStatusFrom(response) {
  if (response?.error) return null
  const status = response?.consent?.status
  return Object.values(CONSENT).includes(status) ? status : null
}
