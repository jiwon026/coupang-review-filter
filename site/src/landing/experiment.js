export const EXP_KEY = 'crf_site_exp_install_cta'
export const VARIANTS = ['hero_only', 'hero_sticky']

// 확장의 결정적 해시 배정과 다르게 저장 방식이다. 방문자 번호를 저장하지 못한 방문자도 배정해야 하고,
// 실험이 하나뿐이라 실험 간 상관을 걱정할 일이 없다.
// 모바일은 설치 버튼 자체가 없으므로(PC 크롬 전용) 저장소를 건드리지 않고 'none' 이다.
// 저장소가 던지면(사생활 보호 모드, 저장소 차단) 그 페이지 로드에서만 무작위로 정하고 저장하지 않는다.
// desktop 이 아닌 값은 모두 'none' 이다. 판정이 어긋났을 때 실험을 돌리는 쪽보다 저장소를 건드리지 않는 쪽으로 닫는다.
export function assignInstallCta({ deviceClass, storage, random }) {
  if (deviceClass !== 'desktop') return 'none'

  let readFailed = false
  try {
    const saved = storage.getItem(EXP_KEY)
    // 저장소의 값도 신뢰 경계 밖의 입력이다. 목록에 없으면 다시 정한다.
    if (VARIANTS.includes(saved)) return saved
  } catch {
    readFailed = true
  }

  const variant = random() < 0.5 ? 'hero_only' : 'hero_sticky'
  // 읽기가 실패했으면 쓰지 않는다. 일시적인 실패 뒤에 이미 있는 배정을 덮어쓰지 않으려는 것이다(visitor.js 와 같다).
  if (readFailed) return variant
  try {
    storage.setItem(EXP_KEY, variant)
  } catch {
    // 저장하지 못하면 이 페이지 로드에서만 유효하다.
  }
  return variant
}
