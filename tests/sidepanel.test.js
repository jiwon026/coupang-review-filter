import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const SAVE_ERROR = '설정을 저장하지 못했습니다. 다시 시도해 주세요.'
const ONBOARDING_URL = 'chrome-extension://test-extension-id/src/onboarding/index.html'
const grantedReply = { consent: { status: 'granted', decidedAt: 1 } }

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
let created = []
let document
// 'hold' 응답은 콜백을 붙들어 두었다가 테스트가 원하는 때에 부른다.
let held = {}

// 가짜 타이머를 쓰는 테스트는 tick 대신 이것으로 대기열을 비운다.
const settle = () => (vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(0) : tick())

// trigger: CONSUME_PANEL_TRIGGER 에 돌려줄 응답. 'lastError' 면 응답 없이 lastError 를 설정한 채 부른다.
// consent: GET_CONSENT 응답, setConsent: SET_CONSENT 응답을 돌려주는 함수. 'none' 이면 콜백을 부르지 않는다.
async function loadPanel({
  trigger = { trigger: 'banner' },
  summaries = { 5: summaryFor(10) },
  getCurrent,
  consent = grantedReply,
  setConsent = (message) => ({ consent: { status: message.status, decidedAt: 2 } }),
} = {}) {
  const dom = new JSDOM('<body><main id="root"></main><footer id="consent"></footer></body>')
  document = dom.window.document
  sent = []
  messageListeners = []
  activatedListeners = []
  created = []
  held = {}
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
      if (message?.type === 'crf:get-consent') reply(typeof consent === 'function' ? consent() : consent, callback)
      if (message?.type === 'crf:set-consent') reply(setConsent(message), callback)
      return undefined
    },
    getURL: (path = '') => `chrome-extension://test-extension-id/${path}`,
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
  }
  function reply(value, callback) {
    if (value === 'none') return
    if (value === 'hold') {
      held['crf:get-consent'] = callback
      return
    }
    if (value === 'lastError') {
      runtime.lastError = { message: 'Receiving end does not exist.' }
      callback?.(undefined)
      runtime.lastError = undefined
      return
    }
    callback?.(value)
  }
  globalThis.chrome = {
    runtime,
    tabs: {
      create: (options) => {
        created.push(options)
        return Promise.resolve({ id: 99 })
      },
      query: async () => [{ id: 5, windowId: 2 }],
      onActivated: { addListener: (fn) => activatedListeners.push(fn) },
    },
    windows: { getCurrent: getCurrent ?? (async () => ({ id: 2 })) },
  }
  globalThis.document = dom.window.document
  vi.resetModules()
  await import('../extension/src/sidepanel/index.js')
  await settle()
  return dom.window.document.getElementById('root')
}

// 문서의 가시성을 바꾸고 visibilitychange 를 낸다.
function changeVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
}

const consentBox = () => document.getElementById('consent')
const buttonByText = (text) => [...consentBox().querySelectorAll('button')].find((button) => button.textContent === text)
const ofType = (type) => sent.filter((message) => message?.type === type)

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

describe('사이드 패널 배선: 동의 구역', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('로드하면 GET_CONSENT 를 1건 묻고 응답 상태를 그린다', async () => {
    await loadPanel({ consent: grantedReply })
    expect(ofType('crf:get-consent')).toHaveLength(1)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
    expect(buttonByText('보내지 않기')).toBeTruthy()
  })

  it('요약은 root 에, 동의 구역은 별도 컨테이너에 그린다', async () => {
    const root = await loadPanel()
    expect(root.textContent).toContain('체험단 제외 평점')
    expect(root.textContent).not.toContain('익명 사용 통계')
    expect(consentBox().textContent).not.toContain('체험단 제외 평점')
  })

  it('요약이 없는 탭에서도 동의 구역을 그린다', async () => {
    const root = await loadPanel({ summaries: {} })
    expect(root.textContent).toContain('리뷰 영역까지 스크롤')
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
  })

  it('보내지 않기를 누르면 SET_CONSENT denied(source panel)를 보내고 응답 상태로 다시 그린다', async () => {
    await loadPanel({ consent: grantedReply })
    buttonByText('보내지 않기').click()
    await settle()

    expect(ofType('crf:set-consent')).toEqual([{ type: 'crf:set-consent', status: 'denied', source: 'panel' }])
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내지 않습니다')
    expect(buttonByText('보내기')).toBeTruthy()
    expect(consentBox().textContent).not.toContain(SAVE_ERROR)
  })

  it('보내기를 누르면 SET_CONSENT granted(source panel)를 보내고 응답 상태로 다시 그린다', async () => {
    await loadPanel({ consent: { consent: { status: 'denied', decidedAt: 1 } } })
    buttonByText('보내기').click()
    await settle()

    expect(ofType('crf:set-consent')).toEqual([{ type: 'crf:set-consent', status: 'granted', source: 'panel' }])
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
  })

  it('그리는 상태는 보낸 값이 아니라 응답의 상태다', async () => {
    await loadPanel({
      consent: grantedReply,
      setConsent: () => ({ consent: { status: 'granted', decidedAt: 3 } }),
    })
    buttonByText('보내지 않기').click()
    await settle()
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
  })

  it('undecided 이면 자세히 보고 고르기가 온보딩 페이지를 새 탭으로 열고 SET_CONSENT 는 보내지 않는다', async () => {
    await loadPanel({ consent: { consent: { status: 'undecided', decidedAt: null } } })
    expect(consentBox().textContent).toContain('익명 사용 통계를 보낼지 아직 고르지 않았습니다')

    buttonByText('자세히 보고 고르기').click()
    await settle()

    expect(created).toEqual([{ url: ONBOARDING_URL }])
    expect(ofType('crf:set-consent')).toHaveLength(0)
  })

  it('읽기 실패 표지가 붙은 응답이나 이상한 응답은 undecided 로 그린다', async () => {
    await loadPanel({ consent: { consent: { status: 'undecided', decidedAt: null }, error: 'failed' } })
    expect(buttonByText('자세히 보고 고르기')).toBeTruthy()

    await loadPanel({ consent: {} })
    expect(buttonByText('자세히 보고 고르기')).toBeTruthy()

    await loadPanel({ consent: 'lastError' })
    expect(buttonByText('자세히 보고 고르기')).toBeTruthy()
  })

  it('SUMMARY_UPDATED 로 요약이 갱신돼도 동의 구역은 그대로 남는다', async () => {
    const root = await loadPanel({ summaries: { 5: summaryFor(10) } })
    const before = consentBox().firstChild

    deliver({ type: 'crf:summary-updated', summary: summaryFor(40) }, { tab: { id: 5 } })

    expect(root.textContent).toContain('리뷰 40개 기준')
    expect(consentBox().firstChild).toBe(before)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
    expect(buttonByText('보내지 않기')).toBeTruthy()
  })

  it('동의를 바꾼 뒤 요약이 갱신돼도 바뀐 상태가 유지된다', async () => {
    const root = await loadPanel()
    buttonByText('보내지 않기').click()
    await settle()
    deliver({ type: 'crf:summary-updated', summary: summaryFor(40) }, { tab: { id: 5 } })

    expect(root.textContent).toContain('리뷰 40개 기준')
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내지 않습니다')
  })

  it('탭을 옮겨 요약을 다시 읽어도 동의 구역은 남고 GET_CONSENT 는 다시 묻지 않는다', async () => {
    await loadPanel()
    for (const listener of activatedListeners) listener({ tabId: 5 })
    await settle()
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
    expect(ofType('crf:get-consent')).toHaveLength(1)
  })

  it.each([
    ['invalid', () => ({ error: 'invalid' })],
    ['failed', () => ({ error: 'failed' })],
    ['응답 없음(lastError)', () => 'lastError'],
    ['consent 없는 응답', () => ({})],
    ['error 와 consent 가 함께 온 응답', () => ({ error: 'failed', consent: { status: 'denied', decidedAt: 1 } })],
  ])('SET_CONSENT 가 실패(%s)하면 오류 문구를 보이고 이전 상태를 유지한다', async (_label, setConsent) => {
    await loadPanel({ consent: grantedReply, setConsent })
    buttonByText('보내지 않기').click()
    await settle()

    expect(consentBox().textContent).toContain(SAVE_ERROR)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
    expect(buttonByText('보내지 않기')).toBeTruthy()
  })

  it('실패 뒤 다시 눌러 성공하면 오류 문구가 사라진다', async () => {
    let calls = 0
    await loadPanel({
      consent: grantedReply,
      setConsent: (message) =>
        ++calls === 1 ? { error: 'failed' } : { consent: { status: message.status, decidedAt: 2 } },
    })
    buttonByText('보내지 않기').click()
    await settle()
    expect(consentBox().textContent).toContain(SAVE_ERROR)

    buttonByText('보내지 않기').click()
    await settle()
    expect(consentBox().textContent).not.toContain(SAVE_ERROR)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내지 않습니다')
  })

  it('응답을 기다리는 중에 연달아 눌러도 SET_CONSENT 는 1건이다', async () => {
    await loadPanel({ consent: grantedReply, setConsent: () => 'none' })
    const button = buttonByText('보내지 않기')
    button.click()
    button.click()
    await settle()
    expect(ofType('crf:set-consent')).toHaveLength(1)
  })

  it('Panel Opened 는 동의 구역을 그려도 그대로 1건 보낸다', async () => {
    await loadPanel({ consent: { consent: { status: 'denied', decidedAt: 1 } } })
    expect(panelOpened()).toHaveLength(1)
    buttonByText('보내기').click()
    await settle()
    expect(panelOpened()).toHaveLength(1)
  })

  // 실제 사이트 주소와 무관하게, 설정되지 않은 경우와 설정된 경우를 모의로 만든다.
  it('사이트가 설정되지 않았으면 처리방침 링크가 없다', async () => {
    vi.doMock('../extension/src/shared/site.js', () => ({ privacyUrl: () => null }))
    try {
      await loadPanel()
    } finally {
      vi.doUnmock('../extension/src/shared/site.js')
    }
    expect(consentBox().querySelector('a[target="_blank"]')).toBeNull()
  })

  it('사이트가 설정됐으면 처리방침 링크가 보인다', async () => {
    vi.doMock('../extension/src/shared/site.js', () => ({ privacyUrl: () => 'https://site.test/privacy' }))
    try {
      await loadPanel()
    } finally {
      vi.doUnmock('../extension/src/shared/site.js')
    }
    expect(consentBox().querySelector('a[href="https://site.test/privacy"]')).toBeTruthy()
  })
})

describe('사이드 패널 배선: 무응답', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('GET_CONSENT 응답이 2초 안에 없으면 undecided 로 그린다', async () => {
    await loadPanel({ consent: 'none' })
    expect(consentBox().textContent).toBe('')

    await vi.advanceTimersByTimeAsync(1999)
    expect(consentBox().textContent).toBe('')

    await vi.advanceTimersByTimeAsync(1)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보낼지 아직 고르지 않았습니다')
    expect(buttonByText('자세히 보고 고르기')).toBeTruthy()
  })

  it('요약은 GET_CONSENT 를 기다리지 않고 바로 그린다', async () => {
    const root = await loadPanel({ consent: 'none' })
    expect(root.textContent).toContain('리뷰 10개 기준')
  })

  it('SET_CONSENT 응답이 5초 안에 없으면 오류 문구를 보이고 버튼을 다시 쓸 수 있다', async () => {
    await loadPanel({ consent: grantedReply, setConsent: () => 'none' })
    buttonByText('보내지 않기').click()
    await vi.advanceTimersByTimeAsync(4999)
    expect(consentBox().textContent).not.toContain(SAVE_ERROR)

    await vi.advanceTimersByTimeAsync(1)
    expect(consentBox().textContent).toContain(SAVE_ERROR)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')

    buttonByText('보내지 않기').click()
    await settle()
    expect(ofType('crf:set-consent')).toHaveLength(2)
  })
})

describe('사이드 패널 배선: 다른 곳에서 바뀐 동의', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const changed = (status) => ({ type: 'crf:consent-changed', consent: { status, decidedAt: 5 } })

  it('undecided 로 그려진 뒤 CONSENT_CHANGED granted 를 받으면 보내고 있습니다로 바뀌고 요약은 그대로다', async () => {
    const root = await loadPanel({ consent: { consent: { status: 'undecided', decidedAt: null } } })
    const summaryBefore = root.firstChild
    const textBefore = root.textContent

    deliver(changed('granted'), {})

    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
    expect(buttonByText('보내지 않기')).toBeTruthy()
    expect(root.firstChild).toBe(summaryBefore)
    expect(root.textContent).toBe(textBefore)
  })

  it('CONSENT_CHANGED denied 도 같다', async () => {
    const root = await loadPanel({ consent: { consent: { status: 'undecided', decidedAt: null } } })
    const textBefore = root.textContent
    deliver(changed('denied'), {})

    expect(consentBox().textContent).toContain('익명 사용 통계를 보내지 않습니다')
    expect(buttonByText('보내기')).toBeTruthy()
    expect(root.textContent).toBe(textBefore)
  })

  it('CONSENT_CHANGED 를 받으면 이전 오류 문구가 사라진다', async () => {
    await loadPanel({ setConsent: () => ({ error: 'failed' }) })
    buttonByText('보내지 않기').click()
    await settle()
    expect(consentBox().textContent).toContain(SAVE_ERROR)

    deliver(changed('denied'), {})
    expect(consentBox().textContent).not.toContain(SAVE_ERROR)
  })

  it.each([
    ['탭에서 온 발신', changed('denied'), { tab: { id: 5 } }],
    ['알 수 없는 상태', { type: 'crf:consent-changed', consent: { status: 'maybe' } }, {}],
    ['consent 없음', { type: 'crf:consent-changed' }, {}],
  ])('%s 의 CONSENT_CHANGED 는 무시한다', async (_label, message, sender) => {
    await loadPanel({ consent: grantedReply })
    deliver(message, sender)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
  })

  it('페이지가 다시 보이면 GET_CONSENT 를 다시 묻고 응답 상태로 그린다', async () => {
    let current = grantedReply
    await loadPanel({ consent: () => current })
    expect(ofType('crf:get-consent')).toHaveLength(1)

    current = { consent: { status: 'denied', decidedAt: 9 } }
    changeVisibility('visible')
    await settle()

    expect(ofType('crf:get-consent')).toHaveLength(2)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내지 않습니다')
  })

  it('페이지가 숨겨질 때는 묻지 않는다', async () => {
    await loadPanel()
    changeVisibility('hidden')
    await settle()
    expect(ofType('crf:get-consent')).toHaveLength(1)
  })

  it('다시 보일 때 읽기에 실패하면 지금 화면을 유지한다', async () => {
    let current = grantedReply
    await loadPanel({ consent: () => current })
    current = { consent: { status: 'undecided', decidedAt: null }, error: 'failed' }
    changeVisibility('visible')
    await settle()
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
  })

  it('탭 전환만으로는 GET_CONSENT 를 다시 묻지 않는다(가시성 변화와 구분)', async () => {
    await loadPanel()
    for (const listener of activatedListeners) listener({ tabId: 5 })
    await settle()
    expect(ofType('crf:get-consent')).toHaveLength(1)
  })
})

describe('사이드 패널 배선: 늦게 온 응답과 저장 뒤 재확인', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('2초에 undecided 로 그리고 3초에 granted 응답이 오면 동의 상태 화면으로 바뀐다', async () => {
    await loadPanel({ consent: 'hold' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보낼지 아직 고르지 않았습니다')

    await vi.advanceTimersByTimeAsync(1000)
    held['crf:get-consent']({ consent: { status: 'granted', decidedAt: 1 } })
    await settle()

    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
    expect(buttonByText('보내지 않기')).toBeTruthy()
  })

  it('그 사이에 CONSENT_CHANGED 를 받았다면 늦은 응답은 화면을 바꾸지 않는다', async () => {
    await loadPanel({ consent: 'hold' })
    await vi.advanceTimersByTimeAsync(2000)
    deliver({ type: 'crf:consent-changed', consent: { status: 'denied', decidedAt: 4 } }, {})
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내지 않습니다')

    held['crf:get-consent']({ consent: { status: 'granted', decidedAt: 1 } })
    await settle()
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내지 않습니다')
  })

  it('늦은 응답이 읽기 실패 표지를 달았으면 화면을 바꾸지 않는다', async () => {
    await loadPanel({ consent: 'hold' })
    await vi.advanceTimersByTimeAsync(2000)
    held['crf:get-consent']({ consent: { status: 'undecided', decidedAt: null }, error: 'failed' })
    await settle()
    expect(consentBox().textContent).toContain('익명 사용 통계를 보낼지 아직 고르지 않았습니다')
  })

  it('저장 실패 뒤 다시 읽은 상태가 요청한 상태와 같으면 오류 문구를 지운다', async () => {
    let current = grantedReply
    await loadPanel({ consent: () => current, setConsent: () => 'none' })
    expect(ofType('crf:get-consent')).toHaveLength(1)

    // 응답은 늦었지만 저장은 됐다.
    current = { consent: { status: 'denied', decidedAt: 7 } }
    buttonByText('보내지 않기').click()
    await vi.advanceTimersByTimeAsync(5000)

    expect(ofType('crf:get-consent')).toHaveLength(2)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내지 않습니다')
    expect(consentBox().textContent).not.toContain(SAVE_ERROR)
  })

  it('저장 실패 뒤 다시 읽은 상태가 요청한 상태와 다르면 오류 문구를 남긴다', async () => {
    await loadPanel({ consent: grantedReply, setConsent: () => 'none' })

    // 저장되지 않았다. 다시 읽어도 granted 그대로다.
    buttonByText('보내지 않기').click()
    await vi.advanceTimersByTimeAsync(5000)

    expect(ofType('crf:get-consent')).toHaveLength(2)
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내고 있습니다')
    expect(consentBox().textContent).toContain(SAVE_ERROR)
  })

  it('저장 실패 뒤 다시 읽기도 실패하면 오류 문구를 남긴다', async () => {
    let current = grantedReply
    await loadPanel({ consent: () => current, setConsent: () => 'none' })

    current = 'none'
    buttonByText('보내지 않기').click()
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)

    expect(consentBox().textContent).toContain(SAVE_ERROR)
  })

  it('SET_CONSENT 진행 중에는 버튼이 disabled 이고 끝나면 풀린다', async () => {
    await loadPanel({ setConsent: () => 'none' })
    buttonByText('보내지 않기').click()
    expect(buttonByText('보내지 않기').disabled).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)
    expect(buttonByText('보내지 않기').disabled).toBe(false)
  })

  it('성공하면 버튼이 풀린 새 상태를 그린다', async () => {
    await loadPanel()
    buttonByText('보내지 않기').click()
    await settle()
    expect(buttonByText('보내기').disabled).toBe(false)
  })
})

describe('사이드 패널 배선: 초기 읽기 중의 알림', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('초기 응답이 오기 전에 CONSENT_CHANGED 가 왔다면 초기 응답이 화면을 덮지 않는다', async () => {
    await loadPanel({ consent: 'hold' })
    deliver({ type: 'crf:consent-changed', consent: { status: 'denied', decidedAt: 4 } }, {})
    held['crf:get-consent']({ consent: { status: 'granted', decidedAt: 1 } })
    await settle()
    expect(consentBox().textContent).toContain('익명 사용 통계를 보내지 않습니다')
  })
})
