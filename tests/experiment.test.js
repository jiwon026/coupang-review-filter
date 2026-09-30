import { describe, it, expect } from 'vitest'
import { assign, EXPERIMENTS } from '../extension/src/core/experiment.js'

const VARIANTS = ['on', 'off']

describe('assign', () => {
  it('같은 입력에 항상 같은 변형을 준다', () => {
    const first = assign('device-abc', 'default_filter', VARIANTS)
    for (let i = 0; i < 20; i += 1) {
      expect(assign('device-abc', 'default_filter', VARIANTS)).toBe(first)
    }
  })

  it('정의된 변형 중 하나를 준다', () => {
    expect(VARIANTS).toContain(assign('device-abc', 'default_filter', VARIANTS))
  })

  it('두 실험의 배정이 서로 독립적이다', () => {
    const total = 2000
    let agree = 0

    for (let i = 0; i < total; i += 1) {
      const deviceId = `device-${i}-${(i * 7919) % 100003}`
      const filterOn = assign(deviceId, 'default_filter', ['on', 'off']) === 'on'
      const copyRating = assign(deviceId, 'banner_copy', ['rating', 'ratio']) === 'rating'
      if (filterOn === copyRating) agree += 1
    }

    const agreementRate = agree / total
    expect(agreementRate).toBeGreaterThan(0.45)
    expect(agreementRate).toBeLessThan(0.55)
  })

  it('1000명 기준 분포가 45%에서 55% 사이다', () => {
    let onCount = 0
    for (let i = 0; i < 1000; i += 1) {
      const deviceId = `device-${i}-${(i * 7919) % 100003}`
      if (assign(deviceId, 'default_filter', VARIANTS) === 'on') onCount += 1
    }
    expect(onCount).toBeGreaterThan(450)
    expect(onCount).toBeLessThan(550)
  })

  it('DEFAULT_FILTER 실험이 정의되어 있다', () => {
    expect(EXPERIMENTS.DEFAULT_FILTER.id).toBe('default_filter')
    expect(EXPERIMENTS.DEFAULT_FILTER.variants).toEqual(['on', 'off'])
  })
})
