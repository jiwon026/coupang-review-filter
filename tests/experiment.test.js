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

  it('실험 id가 다르면 배정이 독립적이다', () => {
    const results = new Set()
    for (let i = 0; i < 200; i += 1) {
      results.add(assign(`device-${i}`, 'exp_a', VARIANTS))
      results.add(assign(`device-${i}`, 'exp_b', VARIANTS))
    }
    expect(results.size).toBe(2)
  })

  it('1000명 기준 분포가 45%에서 55% 사이다', () => {
    let onCount = 0
    for (let i = 0; i < 1000; i += 1) {
      if (assign(`device-${i}`, 'default_filter', VARIANTS) === 'on') onCount += 1
    }
    expect(onCount).toBeGreaterThan(450)
    expect(onCount).toBeLessThan(550)
  })

  it('DEFAULT_FILTER 실험이 정의되어 있다', () => {
    expect(EXPERIMENTS.DEFAULT_FILTER.id).toBe('default_filter')
    expect(EXPERIMENTS.DEFAULT_FILTER.variants).toEqual(['on', 'off'])
  })
})
