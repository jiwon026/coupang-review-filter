const FALLBACK = '준비 중'

// 연락처는 빌드 시점에 환경 변수로 들어온다. 저장소에는 커밋하지 않는다.
// 값이 비어 있는 경우는 개발 빌드뿐이다(운영 빌드는 값이 없으면 실패한다).
export function fillContact(document, email) {
  const target = document.getElementById('contact')
  if (!target) return
  target.textContent = email || FALLBACK
}
