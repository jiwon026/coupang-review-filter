import { describe, it, expect, afterEach, vi } from 'vitest'
import { request, GET_CONSENT_TIMEOUT_MS, SET_CONSENT_TIMEOUT_MS } from '../extension/src/shared/request.js'

afterEach(() => {
  vi.useRealTimers()
  delete globalThis.chrome
})

function mockRuntime(sendMessage) {
  globalThis.chrome = { runtime: { lastError: undefined, sendMessage } }
}

describe('request', () => {
  it('응답을 그대로 돌려준다', async () => {
    mockRuntime((message, callback) => callback({ echo: message.type }))
    await expect(request({ type: 'a' })).resolves.toEqual({ echo: 'a' })
  })

  it('lastError 가 있으면 거절한다', async () => {
    mockRuntime((_message, callback) => {
      globalThis.chrome.runtime.lastError = { message: 'Receiving end does not exist.' }
      callback(undefined)
      globalThis.chrome.runtime.lastError = undefined
    })
    await expect(request({ type: 'a' })).rejects.toThrow('Receiving end does not exist.')
  })

  it('sendMessage 가 던져도 거절로 바꾼다', async () => {
    mockRuntime(() => {
      throw new Error('Extension context invalidated.')
    })
    await expect(request({ type: 'a' })).rejects.toThrow('Extension context invalidated.')
  })

  it('timeoutMs 안에 응답이 없으면 거절하고, 있으면 타이머를 남기지 않는다', async () => {
    vi.useFakeTimers()
    mockRuntime(() => undefined)
    const pending = request({ type: 'a' }, { timeoutMs: 1000 })
    const settled = expect(pending).rejects.toThrow('응답 시간이 지났습니다')
    await vi.advanceTimersByTimeAsync(1000)
    await settled

    mockRuntime((_message, callback) => callback({ ok: true }))
    await request({ type: 'a' }, { timeoutMs: 1000 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('timeoutMs 가 없으면 기다린다', async () => {
    vi.useFakeTimers()
    mockRuntime(() => undefined)
    let settled = false
    request({ type: 'a' }).then(
      () => (settled = true),
      () => (settled = true),
    )
    await vi.advanceTimersByTimeAsync(60_000)
    expect(settled).toBe(false)
  })

  describe('onLate', () => {
    it('타임아웃 뒤에 도착한 응답을 onLate 로 넘긴다', async () => {
      vi.useFakeTimers()
      let held
      mockRuntime((_message, callback) => {
        held = callback
      })
      const late = vi.fn()
      const settled = expect(request({ type: 'a' }, { timeoutMs: 1000, onLate: late })).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(1000)
      await settled
      expect(late).not.toHaveBeenCalled()

      held({ consent: { status: 'granted' } })
      expect(late).toHaveBeenCalledTimes(1)
      expect(late).toHaveBeenCalledWith({ consent: { status: 'granted' } })
    })

    it('제때 온 응답에는 부르지 않는다', async () => {
      mockRuntime((_message, callback) => callback({ ok: true }))
      const late = vi.fn()
      await request({ type: 'a' }, { timeoutMs: 1000, onLate: late })
      expect(late).not.toHaveBeenCalled()
    })

    it('타임아웃 뒤 lastError 로 끝나면 부르지 않고, onLate 가 던져도 밖으로 새지 않는다', async () => {
      vi.useFakeTimers()
      let held
      mockRuntime((_message, callback) => {
        held = callback
      })
      const late = vi.fn(() => {
        throw new Error('onLate 실패')
      })
      const settled = expect(request({ type: 'a' }, { timeoutMs: 1000, onLate: late })).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(1000)
      await settled

      globalThis.chrome.runtime.lastError = { message: 'closed' }
      held(undefined)
      globalThis.chrome.runtime.lastError = undefined
      expect(late).not.toHaveBeenCalled()

      expect(() => held({ ok: true })).not.toThrow()
      expect(late).toHaveBeenCalledTimes(1)
    })
  })

  it('동의 요청의 대기 시간은 읽기 2초, 쓰기 5초다', () => {
    expect(GET_CONSENT_TIMEOUT_MS).toBe(2000)
    expect(SET_CONSENT_TIMEOUT_MS).toBe(5000)
  })
})
