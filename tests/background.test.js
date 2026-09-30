import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installChromeMock } from './helpers/chrome-mock.js'

async function loadBackground() {
  installChromeMock()
  vi.resetModules()
  await import('../extension/src/background/index.js')
  return globalThis.chrome
}

function dispatch(chrome, message, sender = {}) {
  let response
  for (const listener of chrome.__listeners) {
    listener(message, sender, (value) => {
      response = value
    })
  }
  return response
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

    expect(dispatch(chrome, { type: 'crf:get-summary', tabId: 7 })).toEqual({ summary: { total: 10 } })
    expect(dispatch(chrome, { type: 'crf:get-summary', tabId: 9 })).toEqual({ summary: { total: 30 } })
  })

  it('요약이 없는 탭은 null을 돌려준다', async () => {
    const chrome = await loadBackground()
    expect(dispatch(chrome, { type: 'crf:get-summary', tabId: 42 })).toEqual({ summary: null })
  })

  it('패널 열기 요청을 보낸 탭의 창에서 연다', async () => {
    const chrome = await loadBackground()
    dispatch(chrome, { type: 'crf:open-panel' }, { tab: { id: 7, windowId: 3 } })
    expect(chrome.__calls.sidePanelOpen).toEqual([{ windowId: 3 }])
  })
})
