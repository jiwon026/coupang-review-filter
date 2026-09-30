export const EXPERIMENTS = {
  DEFAULT_FILTER: { id: 'default_filter', variants: ['on', 'off'] },
  BANNER_COPY: { id: 'banner_copy', variants: ['rating', 'ratio'] },
}

function hash(value) {
  let result = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }

  // FNV-1a는 홀수 승수라 최하위 비트가 입력 패리티로 고정된다.
  // 변형이 2개면 `% 2`가 그 비트 하나만 보므로 실험 간 배정이 상관된다.
  // 최종 혼합으로 하위 비트가 입력 전체에 의존하게 만든다.
  result ^= result >>> 16
  result = Math.imul(result, 2246822507)
  result ^= result >>> 13
  result = Math.imul(result, 3266489909)
  result ^= result >>> 16

  return result >>> 0
}

export function assign(deviceId, experimentId, variants) {
  const bucket = hash(`${experimentId}:${deviceId}`) % variants.length
  return variants[bucket]
}
