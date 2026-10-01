import { describe, it, expect } from 'vitest'
import { assign, assignAll, EXPERIMENTS } from '../extension/src/core/experiment.js'

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

describe('assignAll', () => {
  const deviceIds = Array.from({ length: 200 }, (_, i) => `device-${i}-${(i * 7919) % 100003}`)

  it('모든 실험 id를 키로 한 배정을 돌려준다', () => {
    const result = assignAll('device-abc')
    expect(Object.keys(result).sort()).toEqual(['banner_copy', 'default_filter'])
  })

  it('각 값이 assign 의 결과와 같다', () => {
    for (const deviceId of deviceIds) {
      const result = assignAll(deviceId)
      for (const experiment of Object.values(EXPERIMENTS)) {
        expect(result[experiment.id]).toBe(assign(deviceId, experiment.id, experiment.variants))
      }
    }
  })

  it('입력 집합에서 두 실험 모두 두 변형이 실제로 나온다', () => {
    for (const experiment of Object.values(EXPERIMENTS)) {
      const seen = new Set(deviceIds.map((deviceId) => assignAll(deviceId)[experiment.id]))
      expect([...seen].sort()).toEqual([...experiment.variants].sort())
    }
  })
})
