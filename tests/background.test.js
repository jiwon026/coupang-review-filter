import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installChromeMock } from './helpers/chrome-mock.js'

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

    expect(await dispatch(chrome, { type: 'crf:get-summary', tabId: 7 }).response).toEqual({
      summary: null,
    })
    expect(warn).toHaveBeenCalled()
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
})
