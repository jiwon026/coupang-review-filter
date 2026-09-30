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
  return result >>> 0
}

export function assign(deviceId, experimentId, variants) {
  const bucket = hash(`${experimentId}:${deviceId}`) % variants.length
  return variants[bucket]
}
