import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const summaryFor = (total) => ({
  total,
  sponsoredCount: 3,
  organicCount: total - 3,
  sponsoredRatio: 3 / total,
  ratingOfficial: 4.6,
  ratingFiltered: 4.2,
  ratingDelta: -0.4,
})

let sent = []
let messageListeners = []
let activatedListeners = []

// trigger: CONSUME_PANEL_TRIGGER 에 돌려줄 응답. 'lastError' 면 응답 없이 lastError 를 설정한 채 부른다.
async function loadPanel({ trigger = { trigger: 'banner' }, summaries = { 5: summaryFor(10) }, getCurrent } = {}) {
  const dom = new JSDOM('<body><main id="root"></main></body>')
  sent = []
  messageListeners = []
  activatedListeners = []
  const runtime = {
    lastError: undefined,
    sendMessage(message, callback) {
      sent.push(message)
      if (message?.type === 'crf:get-summary') callback?.({ summary: summaries[message.tabId] ?? null })
      if (message?.type === 'crf:consume-panel-trigger') {
        if (trigger === 'lastError') {
          runtime.lastError = { message: 'Receiving end does not exist.' }
          callback?.(undefined)
          runtime.lastError = undefined
        } else {
          callback?.(trigger)
        }
      }
      return undefined
    },
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
  }
  globalThis.chrome = {
    runtime,
    tabs: {
      query: async () => [{ id: 5, windowId: 2 }],
      onActivated: { addListener: (fn) => activatedListeners.push(fn) },
    },
    windows: { getCurrent: getCurrent ?? (async () => ({ id: 2 })) },
  }
  globalThis.document = dom.window.document
  vi.resetModules()
  await import('../extension/src/sidepanel/index.js')
  await tick()
  return dom.window.document.getElementById('root')
}

function panelOpened() {
  return sent.filter((message) => message?.type === 'crf:track' && message.eventType === 'Panel Opened')
}

function deliver(message, sender) {
  for (const listener of messageListeners) listener(message, sender, () => {})
}

describe('사이드 패널 배선', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('로드하면 Panel Opened 를 정확히 1건, 백그라운드가 준 trigger 와 함께 보낸다', async () => {
    await loadPanel({ trigger: { trigger: 'banner' } })
    const events = panelOpened()
    expect(events).toHaveLength(1)
    expect(events[0].properties).toEqual({ trigger: 'banner' })
  })

  it('자기 창 id 로 패널 열기 경로를 묻는다', async () => {
    await loadPanel()
    const asks = sent.filter((message) => message?.type === 'crf:consume-panel-trigger')
    expect(asks).toEqual([{ type: 'crf:consume-panel-trigger', windowId: 2 }])
  })

  it('표시가 없다는 응답이면 trigger 는 toolbar 다', async () => {
    await loadPanel({ trigger: { trigger: 'toolbar' } })
    expect(panelOpened()[0].properties.trigger).toBe('toolbar')
  })

  it('응답이 실패하면 trigger 는 unknown 이다', async () => {
    await loadPanel({ trigger: 'lastError' })
    expect(panelOpened()).toHaveLength(1)
    expect(panelOpened()[0].properties.trigger).toBe('unknown')
  })

  it('창 id 를 얻지 못하면 trigger 는 unknown 이다', async () => {
    await loadPanel({ getCurrent: () => Promise.reject(new Error('창 없음')) })
    expect(panelOpened()).toHaveLength(1)
    expect(panelOpened()[0].properties.trigger).toBe('unknown')
  })

  it('현재 탭의 요약을 GET_SUMMARY 로 받아 그린다', async () => {
    const root = await loadPanel({ summaries: { 5: summaryFor(10) } })
    expect(sent).toContainEqual({ type: 'crf:get-summary', tabId: 5 })
    expect(root.textContent).toContain('지금까지 확인한 리뷰 10개 기준입니다')
  })

  it('다른 탭의 SUMMARY_UPDATED 는 무시하고 같은 탭이면 갱신한다', async () => {
    const root = await loadPanel({ summaries: { 5: summaryFor(10) } })

    deliver({ type: 'crf:summary-updated', summary: summaryFor(70) }, { tab: { id: 9 } })
    expect(root.textContent).toContain('리뷰 10개 기준')

    deliver({ type: 'crf:summary-updated', summary: summaryFor(40) }, { tab: { id: 5 } })
    expect(root.textContent).toContain('리뷰 40개 기준')
  })

  it('탭을 옮겨 다시 읽어도 Panel Opened 는 더 보내지 않는다', async () => {
    await loadPanel()
    for (const listener of activatedListeners) listener({ tabId: 5 })
    await tick()
    expect(sent.filter((message) => message?.type === 'crf:get-summary')).toHaveLength(2)
    expect(panelOpened()).toHaveLength(1)
  })
})
