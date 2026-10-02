import { describe, it, expect, vi } from 'vitest'
import { installChromeMock } from './helpers/chrome-mock.js'

const SALT_KEY = 'crf_salt'

// 모듈 상태(진행 중 Promise)까지 새로 만들어 워커 재시작을 흉내 낸다.
async function loadModule() {
  vi.resetModules()
  return import('../extension/src/background/pseudonym.js')
}

describe('pseudonymize', () => {
  it('같은 입력은 같은 값이고 다른 입력은 다른 값이며 16자리 소문자 hex 이다', async () => {
    installChromeMock()
    const { pseudonymize } = await loadModule()

    const a1 = await pseudonymize('7590830589')
    const a2 = await pseudonymize('7590830589')
    const b = await pseudonymize('1020990898')

    expect(a1).toMatch(/^[0-9a-f]{16}$/)
    expect(b).toMatch(/^[0-9a-f]{16}$/)
    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
  })

  it('저장소를 비우고 다시 불러오면(다른 설치) 같은 입력이 다른 값이 된다', async () => {
    installChromeMock()
    const first = await (await loadModule()).pseudonymize('7590830589')

    installChromeMock()
    const second = await (await loadModule()).pseudonymize('7590830589')

    expect(second).not.toBe(first)
  })

  it('워커가 재시작돼도(storage 유지) 같은 값이다', async () => {
    const store = installChromeMock()
    const first = await (await loadModule()).pseudonymize('7590830589')
    const second = await (await loadModule()).pseudonymize('7590830589')

    expect(second).toBe(first)
    expect(store[SALT_KEY]).toMatch(/^[0-9a-f]{64}$/)
  })

  it('동시 두 호출이 솔트를 하나만 만든다', async () => {
    const store = installChromeMock()
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local)
    const saltWrites = []
    chrome.storage.local.set = async (items) => {
      if (SALT_KEY in items) saltWrites.push(items[SALT_KEY])
      return originalSet(items)
    }
    const { pseudonymize } = await loadModule()

    const [a, b] = await Promise.all([pseudonymize('7590830589'), pseudonymize('7590830589')])

    expect(saltWrites).toHaveLength(1)
    expect(a).toBe(b)
    expect(store[SALT_KEY]).toBe(saltWrites[0])
  })

  it('null 과 undefined 는 null 이다', async () => {
    const store = installChromeMock()
    const { pseudonymize } = await loadModule()

    expect(await pseudonymize(null)).toBeNull()
    expect(await pseudonymize(undefined)).toBeNull()
    // 값이 없으면 솔트도 만들지 않는다.
    expect(store[SALT_KEY]).toBeUndefined()
  })
})
