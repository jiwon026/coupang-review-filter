import { describe, it, expect, vi } from 'vitest'
import { EXP_KEY, VARIANTS, assignInstallCta } from '../site/src/landing/experiment.js'

// 호출 횟수를 셀 수 있는 저장소 대역
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: vi.fn((key) => (data.has(key) ? data.get(key) : null)),
    setItem: vi.fn((key, value) => {
      data.set(key, String(value))
    }),
    removeItem: vi.fn((key) => {
      data.delete(key)
    }),
  }
}

// 지정한 메서드만 던지는 저장소 대역
function throwingStorage(throwing) {
  const base = fakeStorage()
  const boom = () => {
    throw new Error('SecurityError')
  }
  return {
    getItem: throwing.includes('getItem') ? boom : base.getItem,
    setItem: throwing.includes('setItem') ? boom : base.setItem,
    removeItem: throwing.includes('removeItem') ? boom : base.removeItem,
  }
}

const assign = (overrides) => assignInstallCta({ deviceClass: 'desktop', storage: fakeStorage(), random: () => 0.1, ...overrides })

describe('상수', () => {
  it('저장 키와 변형 목록이 정해진 대로다', () => {
    expect(EXP_KEY).toBe('crf_site_exp_install_cta')
    expect(VARIANTS).toEqual(['hero_only', 'hero_sticky'])
  })
})

describe('assignInstallCta 모바일', () => {
  it('모바일은 none 이고 저장소를 읽지도 쓰지도 않는다', () => {
    const storage = fakeStorage({ [EXP_KEY]: 'hero_sticky' })
    const random = vi.fn(() => 0.1)
    expect(assignInstallCta({ deviceClass: 'mobile', storage, random })).toBe('none')
    expect(storage.getItem).toHaveBeenCalledTimes(0)
    expect(storage.setItem).toHaveBeenCalledTimes(0)
    expect(storage.removeItem).toHaveBeenCalledTimes(0)
    expect(random).not.toHaveBeenCalled()
  })

  it('모바일은 저장된 변형이 있어도 none 이다', () => {
    const storage = fakeStorage({ [EXP_KEY]: 'hero_only' })
    expect(assignInstallCta({ deviceClass: 'mobile', storage, random: () => 0.9 })).toBe('none')
  })
})

describe('assignInstallCta PC 배정', () => {
  it('random 0.49 는 hero_only 다', () => {
    expect(assign({ random: () => 0.49 })).toBe('hero_only')
  })

  it('random 0.5 는 hero_sticky 다', () => {
    expect(assign({ random: () => 0.5 })).toBe('hero_sticky')
  })

  it('경계값 0 은 hero_only, 1 에 가까운 값은 hero_sticky 다', () => {
    expect(assign({ random: () => 0 })).toBe('hero_only')
    expect(assign({ random: () => 0.999999 })).toBe('hero_sticky')
  })

  it('정한 변형을 저장하고, 다음 호출은 random 이 달라도 같은 변형이다', () => {
    const storage = fakeStorage()
    expect(assign({ storage, random: () => 0.1 })).toBe('hero_only')
    expect(storage.data.get(EXP_KEY)).toBe('hero_only')

    const random = vi.fn(() => 0.9)
    expect(assign({ storage, random })).toBe('hero_only')
    expect(random).not.toHaveBeenCalled()
  })

  it('저장된 변형이 random 을 이긴다', () => {
    expect(assign({ storage: fakeStorage({ [EXP_KEY]: 'hero_sticky' }), random: () => 0.1 })).toBe('hero_sticky')
    expect(assign({ storage: fakeStorage({ [EXP_KEY]: 'hero_only' }), random: () => 0.9 })).toBe('hero_only')
  })

  it('저장된 값이 목록 밖이면(x, none, 빈 문자열) 다시 정해 덮어쓴다', () => {
    for (const bad of ['x', 'none', '']) {
      const storage = fakeStorage({ [EXP_KEY]: bad })
      expect(assign({ storage, random: () => 0.9 })).toBe('hero_sticky')
      expect(storage.data.get(EXP_KEY)).toBe('hero_sticky')
    }
  })
})

describe('assignInstallCta 저장소 실패', () => {
  it('getItem 이 던져도 변형을 돌려준다', () => {
    const storage = throwingStorage(['getItem'])
    expect(assign({ storage, random: () => 0.1 })).toBe('hero_only')
    expect(assign({ storage, random: () => 0.9 })).toBe('hero_sticky')
  })

  it('setItem 만 던져도 변형을 돌려준다', () => {
    const storage = throwingStorage(['setItem'])
    expect(assign({ storage, random: () => 0.1 })).toBe('hero_only')
    expect(assign({ storage, random: () => 0.9 })).toBe('hero_sticky')
  })

  it('저장소가 없어도(undefined, null) 변형을 돌려준다', () => {
    expect(assign({ storage: undefined, random: () => 0.1 })).toBe('hero_only')
    expect(assign({ storage: null, random: () => 0.9 })).toBe('hero_sticky')
  })
})

describe('assignInstallCta 분포', () => {
  it('random 을 1만 번 균등 표본으로 돌리면 두 변형의 비율이 각각 0.48 에서 0.52 다', () => {
    const total = 10000
    const counts = { hero_only: 0, hero_sticky: 0 }
    for (let i = 0; i < total; i += 1) {
      // 저장소를 매번 새로 만들어 호출마다 새 방문자처럼 배정한다.
      const variant = assign({ storage: fakeStorage(), random: () => i / total })
      counts[variant] += 1
    }
    expect(counts.hero_only + counts.hero_sticky).toBe(total)
    for (const variant of VARIANTS) {
      expect(counts[variant] / total).toBeGreaterThanOrEqual(0.48)
      expect(counts[variant] / total).toBeLessThanOrEqual(0.52)
    }
  })
})
