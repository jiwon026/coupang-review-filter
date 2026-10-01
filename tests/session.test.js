import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installChromeMock } from './helpers/chrome-mock.js'

const MINUTE = 60 * 1000
const T0 = 1_700_000_000_000

async function loadSession() {
  vi.resetModules()
  return import('../extension/src/background/session.js')
}

describe('getSessionId', () => {
  beforeEach(() => {
    installChromeMock()
  })

  it('상태가 없으면 첫 이벤트 시각으로 새 세션을 연다', async () => {
    const { getSessionId } = await loadSession()
    expect(await getSessionId(T0)).toBe(T0)
  })

  it('29분 뒤 이벤트는 같은 세션이다', async () => {
    const { getSessionId } = await loadSession()
    await getSessionId(T0)
    expect(await getSessionId(T0 + 29 * MINUTE)).toBe(T0)
  })

  it('31분 뒤 이벤트는 새 세션이다', async () => {
    const { getSessionId } = await loadSession()
    await getSessionId(T0)
    expect(await getSessionId(T0 + 31 * MINUTE)).toBe(T0 + 31 * MINUTE)
  })

  it('이벤트가 이어지면 시작으로부터 30분을 넘겨도 같은 세션이다(마지막 이벤트 기준)', async () => {
    const { getSessionId } = await loadSession()
    await getSessionId(T0)
    await getSessionId(T0 + 29 * MINUTE)
    expect(await getSessionId(T0 + 58 * MINUTE)).toBe(T0)
  })

  it('타임아웃 상수는 30분이다', async () => {
    const { SESSION_TIMEOUT_MS } = await loadSession()
    expect(SESSION_TIMEOUT_MS).toBe(30 * MINUTE)
  })

  it('서비스 워커가 재시작돼도 storage.session 의 세션을 이어 쓴다', async () => {
    const first = await loadSession()
    await first.getSessionId(T0)

    const restarted = await loadSession()
    expect(await restarted.getSessionId(T0 + 5 * MINUTE)).toBe(T0)
  })

  it('세션 상태를 storage.session 에 { id, lastEventAt } 로 둔다', async () => {
    const { getSessionId, SESSION_KEY } = await loadSession()
    await getSessionId(T0)
    await getSessionId(T0 + MINUTE)
    expect(chrome.__session[SESSION_KEY]).toEqual({ id: T0, lastEventAt: T0 + MINUTE })
  })

  it('상태가 없을 때 동시에 두 번 불러도 같은 세션을 준다', async () => {
    const { getSessionId } = await loadSession()
    const [first, second] = await Promise.all([getSessionId(T0), getSessionId(T0 + 5)])
    expect(first).toBe(T0)
    expect(second).toBe(T0)
  })

  it('저장소가 실패하면 거부하고 다음 호출은 다시 시도한다', async () => {
    const { getSessionId } = await loadSession()
    const originalGet = chrome.storage.session.get
    chrome.storage.session.get = () => Promise.reject(new Error('읽기 실패'))
    await expect(getSessionId(T0)).rejects.toThrow('읽기 실패')

    chrome.storage.session.get = originalGet
    expect(await getSessionId(T0 + MINUTE)).toBe(T0 + MINUTE)
  })
})
