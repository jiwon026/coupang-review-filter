import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installChromeMock } from './helpers/chrome-mock.js'
import { assignAll } from '../extension/src/core/experiment.js'

async function loadBackground() {
  installChromeMock()
  vi.resetModules()
  await import('../extension/src/background/index.js')
  return globalThis.chrome
}

// 리스너가 true 를 반환하면 비동기 응답을 기다리고, 아니면 동기 응답만 본다.
function dispatch(chrome, message, sender = {}) {
  let sync
  let hasSync = false
  let asyncResolve
  const asyncResponse = new Promise((resolve) => {
    asyncResolve = resolve
  })
  const returns = []
  for (const listener of chrome.__listeners) {
    returns.push(
      listener(message, sender, (value) => {
        sync = value
        hasSync = true
        asyncResolve(value)
      }),
    )
  }
  return { returned: returns, response: hasSync ? Promise.resolve(sync) : asyncResponse }
}

// 응답이 오지 않는 회귀를 5초 테스트 타임아웃이 아니라 짧은 대기와 명시적 메시지로 드러낸다.
async function responseWithin(dispatched, ms = 500) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`응답이 오지 않음(${ms}ms 안에 sendResponse 호출 없음)`)), ms)
  })
  try {
    return await Promise.race([dispatched.response, timeout])
  } finally {
    clearTimeout(timer)
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function restartWorker(chrome) {
  chrome.__listeners.length = 0
  chrome.__removedListeners.length = 0
  vi.resetModules()
  await import('../extension/src/background/index.js')
}

describe('background', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('툴바 아이콘으로 패널이 열리게 설정한다', async () => {
    const chrome = await loadBackground()
    expect(chrome.__calls.setPanelBehavior).toContainEqual({ openPanelOnActionClick: true })
  })

  it('탭별 요약을 저장하고 돌려준다', async () => {
    const chrome = await loadBackground()
    dispatch(chrome, { type: 'crf:summary-updated', summary: { total: 10 } }, { tab: { id: 7 } })
    dispatch(chrome, { type: 'crf:summary-updated', summary: { total: 30 } }, { tab: { id: 9 } })
    await flush()

    expect(await dispatch(chrome, { type: 'crf:get-summary', tabId: 7 }).response).toEqual({
      summary: { total: 10 },
    })
    expect(await dispatch(chrome, { type: 'crf:get-summary', tabId: 9 }).response).toEqual({
      summary: { total: 30 },
    })
  })

  it('요약이 없는 탭은 null을 돌려준다', async () => {
    const chrome = await loadBackground()
    expect(await dispatch(chrome, { type: 'crf:get-summary', tabId: 42 }).response).toEqual({
      summary: null,
    })
  })

  it('GET_SUMMARY 리스너는 비동기 응답을 위해 true 를 반환한다', async () => {
    const chrome = await loadBackground()
    const { returned, response } = dispatch(chrome, { type: 'crf:get-summary', tabId: 1 })
    expect(returned).toContain(true)
    await response
  })

  it('서비스 워커가 재시작되어도 저장된 요약을 돌려준다', async () => {
    const chrome = await loadBackground()
    dispatch(chrome, { type: 'crf:summary-updated', summary: { total: 10 } }, { tab: { id: 7 } })
    await flush()

    await restartWorker(chrome)

    expect(await dispatch(chrome, { type: 'crf:get-summary', tabId: 7 }).response).toEqual({
      summary: { total: 10 },
    })
  })

  it('탭이 닫히면 저장된 요약을 지운다', async () => {
    const chrome = await loadBackground()
    dispatch(chrome, { type: 'crf:summary-updated', summary: { total: 10 } }, { tab: { id: 7 } })
    dispatch(chrome, { type: 'crf:summary-updated', summary: { total: 30 } }, { tab: { id: 9 } })
    await flush()

    for (const listener of chrome.__removedListeners) listener(7)
    await flush()

    expect(await dispatch(chrome, { type: 'crf:get-summary', tabId: 7 }).response).toEqual({
      summary: null,
    })
    expect(await dispatch(chrome, { type: 'crf:get-summary', tabId: 9 }).response).toEqual({
      summary: { total: 30 },
    })
  })

  it('요약을 읽지 못하면 null 로 응답하고 경고한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const chrome = await loadBackground()
    chrome.storage.session.get = () => Promise.reject(new Error('읽기 실패'))

    const response = await responseWithin(dispatch(chrome, { type: 'crf:get-summary', tabId: 7 }))
    expect(response).toEqual({ summary: null })
    expect(warn).toHaveBeenCalled()
  })

  it('GET_SUMMARY 의 sendResponse 가 던져도 응답을 한 번 더 보내지 않는다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const chrome = await loadBackground()
    dispatch(chrome, { type: 'crf:summary-updated', summary: { total: 10 } }, { tab: { id: 7 } })
    await flush()
    const calls = []
    const sendResponse = (value) => {
      calls.push(value)
      throw new Error('채널이 닫혔습니다')
    }

    for (const listener of chrome.__listeners) {
      listener({ type: 'crf:get-summary', tabId: 7 }, {}, sendResponse)
    }
    await flush()

    expect(calls).toEqual([{ summary: { total: 10 } }])
  })

  it('GET_SUMMARY 읽기에 성공하면 sendResponse 를 한 번만 부른다', async () => {
    const chrome = await loadBackground()
    dispatch(chrome, { type: 'crf:summary-updated', summary: { total: 10 } }, { tab: { id: 7 } })
    await flush()
    const calls = []

    for (const listener of chrome.__listeners) {
      listener({ type: 'crf:get-summary', tabId: 7 }, {}, (value) => calls.push(value))
    }
    await flush()

    expect(calls).toEqual([{ summary: { total: 10 } }])
  })

  it('요약을 저장하지 못해도 경고만 하고 멈추지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const chrome = await loadBackground()
    chrome.storage.session.set = () => Promise.reject(new Error('저장 실패'))

    dispatch(chrome, { type: 'crf:summary-updated', summary: { total: 10 } }, { tab: { id: 7 } })
    await flush()

    expect(warn).toHaveBeenCalled()
  })

  it('탭 정보가 없는 요약 갱신은 저장하지 않는다', async () => {
    const chrome = await loadBackground()
    dispatch(chrome, { type: 'crf:summary-updated', summary: { total: 10 } }, {})
    await flush()
    expect(chrome.__session).toEqual({})
  })

  it('패널 열기 요청을 보낸 탭의 창에서 연다', async () => {
    const chrome = await loadBackground()
    dispatch(chrome, { type: 'crf:open-panel' }, { tab: { id: 7, windowId: 3 } })
    expect(chrome.__calls.sidePanelOpen).toEqual([{ windowId: 3 }])
  })

  describe('패널을 연 경로(trigger)', () => {
    const T0 = 1_700_000_000_000

    async function consume(chrome, windowId) {
      return (await responseWithin(dispatch(chrome, { type: 'crf:consume-panel-trigger', windowId }))).trigger
    }

    it('배너의 자세히 보기로 연 창에서 패널이 물으면 banner 다', async () => {
      const chrome = await loadBackground()
      dispatch(chrome, { type: 'crf:open-panel' }, { tab: { id: 7, windowId: 3 } })
      expect(await consume(chrome, 3)).toBe('banner')
    })

    it('패널 열기는 표시를 남기기 전에 리스너 안에서 동기로 부른다(사용자 제스처 유지)', async () => {
      const chrome = await loadBackground()
      const order = []
      chrome.sidePanel.open = () => {
        order.push('open')
        return Promise.resolve()
      }
      const originalSet = chrome.storage.session.set
      chrome.storage.session.set = (items) => {
        order.push('mark')
        return originalSet(items)
      }
      dispatch(chrome, { type: 'crf:open-panel' }, { tab: { id: 7, windowId: 3 } })
      expect(order[0]).toBe('open')
    })

    it('표시 없이 열린 패널(툴바)은 toolbar 다', async () => {
      const chrome = await loadBackground()
      expect(await consume(chrome, 3)).toBe('toolbar')
    })

    it('다른 창의 표시는 쓰지 않는다', async () => {
      const chrome = await loadBackground()
      dispatch(chrome, { type: 'crf:open-panel' }, { tab: { id: 7, windowId: 3 } })
      expect(await consume(chrome, 4)).toBe('toolbar')
      expect(await consume(chrome, 3)).toBe('banner')
    })

    it('6초 지난 표시는 toolbar 다', async () => {
      const chrome = await loadBackground()
      const now = vi.spyOn(Date, 'now').mockReturnValue(T0)
      dispatch(chrome, { type: 'crf:open-panel' }, { tab: { id: 7, windowId: 3 } })
      await flush()
      now.mockReturnValue(T0 + 6000)
      expect(await consume(chrome, 3)).toBe('toolbar')
      now.mockRestore()
    })

    it('한 번 쓴 표시는 다시 쓰지 않는다', async () => {
      const chrome = await loadBackground()
      dispatch(chrome, { type: 'crf:open-panel' }, { tab: { id: 7, windowId: 3 } })
      expect(await consume(chrome, 3)).toBe('banner')
      expect(await consume(chrome, 3)).toBe('toolbar')
    })

    it('서비스 워커가 재시작돼도 표시를 이어 쓴다', async () => {
      const chrome = await loadBackground()
      dispatch(chrome, { type: 'crf:open-panel' }, { tab: { id: 7, windowId: 3 } })
      await flush()
      await restartWorker(chrome)
      expect(await consume(chrome, 3)).toBe('banner')
    })

    it('창 id 가 없거나 저장소가 실패하면 unknown 으로 응답한다', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const chrome = await loadBackground()
      expect(await consume(chrome, undefined)).toBe('unknown')
      chrome.storage.session.get = () => Promise.reject(new Error('읽기 실패'))
      expect(await consume(chrome, 3)).toBe('unknown')
    })
  })

  it('GET_VARIANT 는 { variants: { default_filter, banner_copy, onboarding_example } } 모양으로 응답한다', async () => {
    const chrome = await loadBackground()
    const { variants } = await dispatch(chrome, { type: 'crf:get-variant' }).response
    expect(Object.keys(variants).sort()).toEqual(['banner_copy', 'default_filter', 'onboarding_example'])
  })

  it('GET_VARIANT 응답이 같은 device id 의 assignAll 과 같다', async () => {
    for (let i = 0; i < 20; i += 1) {
      const deviceId = `device-${i}-${(i * 7919) % 100003}`
      installChromeMock({ crf_device_id: deviceId })
      vi.resetModules()
      await import('../extension/src/background/index.js')
      const response = await dispatch(globalThis.chrome, { type: 'crf:get-variant' }).response
      expect(response).toEqual({ variants: assignAll(deviceId) })
    }
  })
})
