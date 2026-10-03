import { describe, it, expect } from 'vitest'
import { DEVICE_KEY, OPTOUT_KEY, readCommand, resolveVisitor } from '../site/src/landing/visitor.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FIXED_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_ID = '00000000-0000-4000-8000-000000000000'

// 일반 저장소 대역. 값은 문자열로만 담는다.
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      data.set(key, String(value))
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

// 지정한 메서드만 던지는 저장소 대역. 사파리 사생활 보호 모드나 저장소 차단을 흉내 낸다.
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

let counter = 0
const sequentialUUID = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`

describe('readCommand', () => {
  it('#notrack 이면 optout 이다', () => {
    expect(readCommand('#notrack')).toBe('optout')
  })

  it('#track 이면 optin 이다', () => {
    expect(readCommand('#track')).toBe('optin')
  })

  it('#notrack2, #x&notrack, 빈 문자열, 해시 없음은 명령이 아니다', () => {
    expect(readCommand('#notrack2')).toBeNull()
    expect(readCommand('#x&notrack')).toBeNull()
    expect(readCommand('#tracking')).toBeNull()
    expect(readCommand('#NOTRACK')).toBeNull()
    expect(readCommand('notrack')).toBeNull()
    expect(readCommand('')).toBeNull()
    expect(readCommand(undefined)).toBeNull()
    expect(readCommand(null)).toBeNull()
  })
})

describe('resolveVisitor 방문자 번호', () => {
  it('처음이면 새 UUID 를 만들어 저장하고 두 번째 호출은 같은 번호를 돌려준다', () => {
    const storage = fakeStorage()
    const first = resolveVisitor({ storage, hash: '', randomUUID: sequentialUUID })
    expect(first.deviceId).toMatch(UUID)
    expect(first.persisted).toBe(true)
    expect(storage.getItem(DEVICE_KEY)).toBe(first.deviceId)

    const second = resolveVisitor({ storage, hash: '', randomUUID: sequentialUUID })
    expect(second.deviceId).toBe(first.deviceId)
    expect(second.persisted).toBe(true)
  })

  it('저장된 번호가 UUID 형식이면 그대로 쓰고 새로 만들지 않는다', () => {
    const storage = fakeStorage({ [DEVICE_KEY]: FIXED_ID })
    const result = resolveVisitor({ storage, hash: '', randomUUID: () => OTHER_ID })
    expect(result.deviceId).toBe(FIXED_ID)
  })

  it('저장된 값이 UUID 가 아니면 새로 만들어 덮어쓴다', () => {
    for (const bad of ['not-a-uuid', '', `${FIXED_ID}x`, `x${FIXED_ID}`, `${FIXED_ID}\n`]) {
      const storage = fakeStorage({ [DEVICE_KEY]: bad })
      const result = resolveVisitor({ storage, hash: '', randomUUID: () => OTHER_ID })
      expect(result.deviceId).toBe(OTHER_ID)
      expect(storage.getItem(DEVICE_KEY)).toBe(OTHER_ID)
    }
  })
})

describe('resolveVisitor 저장소 실패', () => {
  it('getItem 이 던지면 persisted false, 번호는 UUID 이고 예외가 밖으로 나오지 않는다', () => {
    const storage = throwingStorage(['getItem'])
    let result
    expect(() => {
      result = resolveVisitor({ storage, hash: '', randomUUID: () => OTHER_ID })
    }).not.toThrow()
    expect(result.deviceId).toMatch(UUID)
    expect(result.persisted).toBe(false)
    expect(result.optedOut).toBe(false)
  })

  it('setItem 만 던져도 persisted false, 번호는 UUID 이고 예외가 밖으로 나오지 않는다', () => {
    const storage = throwingStorage(['setItem'])
    let result
    expect(() => {
      result = resolveVisitor({ storage, hash: '', randomUUID: () => OTHER_ID })
    }).not.toThrow()
    expect(result.deviceId).toBe(OTHER_ID)
    expect(result.persisted).toBe(false)
  })

  it('removeItem 만 던지는 저장소에서 #track 을 받아도 예외가 없고 optedOut 은 false 다', () => {
    const storage = throwingStorage(['removeItem'])
    let result
    expect(() => {
      result = resolveVisitor({ storage, hash: '#track', randomUUID: () => OTHER_ID })
    }).not.toThrow()
    expect(result.optedOut).toBe(false)
    expect(result.command).toBe('optin')
  })

  it('저장소가 없어도(undefined, null) 던지지 않고 persisted false 다', () => {
    for (const storage of [undefined, null]) {
      const result = resolveVisitor({ storage, hash: '', randomUUID: () => OTHER_ID })
      expect(result.deviceId).toBe(OTHER_ID)
      expect(result.persisted).toBe(false)
    }
  })

  it('저장소가 모두 던져도 #notrack 은 그 페이지 로드에서 optedOut true 다', () => {
    const storage = throwingStorage(['getItem', 'setItem', 'removeItem'])
    const result = resolveVisitor({ storage, hash: '#notrack', randomUUID: () => OTHER_ID })
    expect(result.optedOut).toBe(true)
    expect(result.persisted).toBe(false)
    expect(result.command).toBe('optout')
  })

  it('저장 실패 때 그 로드에서만 쓰는 번호는 호출마다 randomUUID 로 새로 만든다', () => {
    const storage = throwingStorage(['getItem', 'setItem'])
    const a = resolveVisitor({ storage, hash: '', randomUUID: sequentialUUID })
    const b = resolveVisitor({ storage, hash: '', randomUUID: sequentialUUID })
    expect(a.deviceId).not.toBe(b.deviceId)
  })
})

describe('resolveVisitor 계측 제외', () => {
  it('처음에는 optedOut false 이고 command 는 null 이다', () => {
    const result = resolveVisitor({ storage: fakeStorage(), hash: '', randomUUID: () => OTHER_ID })
    expect(result.optedOut).toBe(false)
    expect(result.command).toBeNull()
  })

  it('#notrack 으로 optedOut true 가 되고 다음 호출(해시 없음)에서도 유지된다', () => {
    const storage = fakeStorage()
    const first = resolveVisitor({ storage, hash: '#notrack', randomUUID: sequentialUUID })
    expect(first.optedOut).toBe(true)
    expect(first.command).toBe('optout')
    expect(storage.getItem(OPTOUT_KEY)).toBe('1')

    const next = resolveVisitor({ storage, hash: '', randomUUID: sequentialUUID })
    expect(next.optedOut).toBe(true)
    expect(next.command).toBeNull()
  })

  it('#track 으로 풀리고 다음 호출에서도 풀려 있다', () => {
    const storage = fakeStorage({ [OPTOUT_KEY]: '1' })
    const first = resolveVisitor({ storage, hash: '#track', randomUUID: sequentialUUID })
    expect(first.optedOut).toBe(false)
    expect(first.command).toBe('optin')
    expect(storage.getItem(OPTOUT_KEY)).toBeNull()

    const next = resolveVisitor({ storage, hash: '', randomUUID: sequentialUUID })
    expect(next.optedOut).toBe(false)
  })

  it('명령이 아닌 해시는 저장된 제외 상태를 바꾸지 않는다', () => {
    const storage = fakeStorage({ [OPTOUT_KEY]: '1' })
    const result = resolveVisitor({ storage, hash: '#notrack2', randomUUID: sequentialUUID })
    expect(result.optedOut).toBe(true)
    expect(result.command).toBeNull()
    expect(storage.getItem(OPTOUT_KEY)).toBe('1')
  })

  it('저장된 제외 값이 1 이 아니면 제외가 아니다', () => {
    const storage = fakeStorage({ [OPTOUT_KEY]: 'yes' })
    const result = resolveVisitor({ storage, hash: '', randomUUID: sequentialUUID })
    expect(result.optedOut).toBe(false)
  })

  it('제외 상태에서도 방문자 번호를 만들어 저장한다', () => {
    const storage = fakeStorage()
    const result = resolveVisitor({ storage, hash: '#notrack', randomUUID: () => OTHER_ID })
    expect(result.deviceId).toBe(OTHER_ID)
    expect(storage.getItem(DEVICE_KEY)).toBe(OTHER_ID)
    expect(result.persisted).toBe(true)
  })

  it('#notrack 은 번호를 바꾸지 않는다', () => {
    const storage = fakeStorage({ [DEVICE_KEY]: FIXED_ID })
    const result = resolveVisitor({ storage, hash: '#notrack', randomUUID: () => OTHER_ID })
    expect(result.deviceId).toBe(FIXED_ID)
  })
})
