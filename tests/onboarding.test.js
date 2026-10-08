import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'

const tick = () =>
  vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(0) : new Promise((resolve) => setTimeout(resolve, 0))

const SAVE_ERROR = '설정을 저장하지 못했습니다. 다시 시도해 주세요.'
const EXAMPLE_URL = 'https://www.coupang.com/vp/products/7590830589'

let sent = []
let document
// 'hold' 응답은 콜백을 붙들어 두었다가 테스트가 원하는 때에 부른다.
let held = {}
let messageListeners = []

// consent: GET_CONSENT 응답, variants: GET_VARIANT 응답, setConsent: SET_CONSENT 응답을 돌려주는 함수.
// 값이 'none' 이면 콜백을 아예 부르지 않는다(응답이 오지 않는 상황).
async function loadOnboarding({
  consent = { consent: { status: 'undecided', decidedAt: null } },
  variants = { variants: { onboarding_example: 'show' } },
  setConsent = (message) => ({ consent: { status: message.status, decidedAt: 1_700_000_000_000 } }),
} = {}) {
  const dom = new JSDOM('<body><main id="root"></main></body>')
  document = dom.window.document
  // 링크 클릭이 jsdom 에서 실제 이동을 시도하지 않도록 막는다. 핸들러는 링크에서 먼저 실행된다.
  document.addEventListener('click', (event) => event.preventDefault())
  sent = []
  held = {}
  messageListeners = []
  const runtime = {
    lastError: undefined,
    sendMessage(message, callback) {
      sent.push(message)
      const reply =
        message?.type === 'crf:get-consent'
          ? typeof consent === 'function'
            ? consent()
            : consent
          : message?.type === 'crf:get-variant'
            ? variants
            : message?.type === 'crf:set-consent'
              ? setConsent(message)
              : { ok: true }
      if (reply === 'none') return undefined
      if (reply === 'hold') {
        held[message.type] = callback
        return undefined
      }
      if (reply === 'lastError') {
        runtime.lastError = { message: 'Receiving end does not exist.' }
        callback?.(undefined)
        runtime.lastError = undefined
        return undefined
      }
      if (reply === 'throw') throw new Error('Extension context invalidated.')
      callback?.(reply)
      return undefined
    },
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
  }
  globalThis.chrome = { runtime }
  globalThis.document = document
  vi.resetModules()
  await import('../extension/src/onboarding/index.js')
  await tick()
  return document.getElementById('root')
}

const deliver = (message, sender = {}) => {
  for (const listener of messageListeners) listener(message, sender, () => {})
}
const changed = (status) => ({ type: 'crf:consent-changed', consent: { status, decidedAt: 5 } })

// 문서의 가시성을 바꾸고 visibilitychange 를 낸다.
function changeVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
}

const ofType = (type) => sent.filter((message) => message?.type === type)
const tracked = (eventType) => ofType('crf:track').filter((message) => message.eventType === eventType)
const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((button) => button.textContent === text)
const exampleLink = (root) => root.querySelector(`a[href="${EXAMPLE_URL}"]`)

describe('온보딩 배선: 로드', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('로드하면 GET_CONSENT 와 GET_VARIANT 를 1건씩 묻는다', async () => {
    await loadOnboarding()
    expect(ofType('crf:get-consent')).toHaveLength(1)
    expect(ofType('crf:get-variant')).toHaveLength(1)
  })

  it('undecided 이면 두 선택 버튼을 그리고 TRACK 은 0건이다', async () => {
    const root = await loadOnboarding()
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(buttonByText(root, '통계 없이 사용')).toBeTruthy()
    expect(ofType('crf:track')).toHaveLength(0)
    expect(ofType('crf:set-consent')).toHaveLength(0)
  })

  it('응답이 lastError 로 실패해도 기본 상태(undecided, 예시 링크 숨김)로 그린다', async () => {
    const root = await loadOnboarding({ consent: 'lastError', variants: 'lastError' })
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(exampleLink(root)).toBeNull()
    expect(ofType('crf:track')).toHaveLength(0)
  })

  it('sendMessage 가 던져도 기본 상태로 그린다', async () => {
    const root = await loadOnboarding({ consent: 'throw', variants: 'throw' })
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(exampleLink(root)).toBeNull()
  })

  it('응답이 오지 않아도 기다리다 기본 상태로 그린다', async () => {
    vi.useFakeTimers()
    const dom = new JSDOM('<body><main id="root"></main></body>')
    globalThis.document = dom.window.document
    globalThis.chrome = {
      runtime: { lastError: undefined, sendMessage: () => undefined, onMessage: { addListener() {} } },
    }
    vi.resetModules()
    await import('../extension/src/onboarding/index.js')
    await vi.advanceTimersByTimeAsync(10_000)

    const root = dom.window.document.getElementById('root')
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(exampleLink(root)).toBeNull()
  })

  it('읽기 실패 표지(error: failed)가 붙은 undecided 응답이면 그대로 고를 수 있게 그린다', async () => {
    const root = await loadOnboarding({
      consent: { consent: { status: 'undecided', decidedAt: null }, error: 'failed' },
    })
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(buttonByText(root, '통계 없이 사용')).toBeTruthy()
  })

  it('선택 전 화면(undecided)에는 variant 가 show 여도 예시 링크가 없다', async () => {
    const root = await loadOnboarding({ variants: { variants: { onboarding_example: 'show' } } })
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(exampleLink(root)).toBeNull()
  })

  it.each(['granted', 'denied'])('%s 완료 화면에서 variant 가 show 면 예시 링크를, hide 면 링크를 그리지 않는다', async (status) => {
    const consent = { consent: { status, decidedAt: 1 } }
    const shown = await loadOnboarding({ consent, variants: { variants: { onboarding_example: 'show' } } })
    expect(exampleLink(shown)).not.toBeNull()

    const hidden = await loadOnboarding({ consent, variants: { variants: { onboarding_example: 'hide' } } })
    expect(exampleLink(hidden)).toBeNull()
  })

  it.each([
    ['동의하고 시작', '익명 통계를 보내도록 설정했습니다.'],
    ['통계 없이 사용', '통계를 보내지 않도록 설정했습니다.'],
  ])('show 변형은 %s 를 고른 뒤 완료 화면에서 예시 링크가 나타난다', async (choice, doneText) => {
    const root = await loadOnboarding({ variants: { variants: { onboarding_example: 'show' } } })
    expect(exampleLink(root)).toBeNull()

    buttonByText(root, choice).click()
    await tick()

    expect(root.textContent).toContain(doneText)
    expect(exampleLink(root)).not.toBeNull()
  })

  it('hide 변형은 고른 뒤에도 예시 링크가 없다', async () => {
    const root = await loadOnboarding({ variants: { variants: { onboarding_example: 'hide' } } })
    buttonByText(root, '동의하고 시작').click()
    await tick()
    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
    expect(exampleLink(root)).toBeNull()
  })

  it('variants 가 null 이거나 배정이 없으면 완료 화면에도 예시 링크를 그리지 않는다(변형을 모르면 실험 노출을 만들지 않는다)', async () => {
    const consent = { consent: { status: 'granted', decidedAt: 1 } }
    const unknown = await loadOnboarding({ consent, variants: { variants: null } })
    expect(exampleLink(unknown)).toBeNull()

    const missing = await loadOnboarding({ consent, variants: { variants: {} } })
    expect(exampleLink(missing)).toBeNull()
  })

  it('이미 granted 로 열면 현재 상태와 설정 바꾸기를 보여 준다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
    expect(buttonByText(root, '설정 바꾸기')).toBeTruthy()
    expect(buttonByText(root, '동의하고 시작')).toBeUndefined()
  })

  it('이미 denied 로 열면 현재 상태와 설정 바꾸기를 보여 주고 아무것도 보내지 않는다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'denied', decidedAt: 1 } } })
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
    expect(buttonByText(root, '설정 바꾸기')).toBeTruthy()
    expect(ofType('crf:track')).toHaveLength(0)
  })

  // 패널의 보내는 내용 보기가 여는 화면이다. 이미 고른 사용자에게도 보내는 내용이 보여야 한다.
  it.each(['granted', 'denied'])('이미 %s 로 열어도 완료 화면에 보내는 것과 보내지 않는 것 목록이 있다', async (status) => {
    const root = await loadOnboarding({ consent: { consent: { status, decidedAt: 1 } } })
    const headings = [...root.querySelectorAll('h2, h3')].map((node) => node.textContent)
    expect(headings).toEqual(['사용 방법', '보내는 내용', '보내는 것', '보내지 않는 것'])
    expect(root.querySelectorAll('section.box li')).toHaveLength(10)
    expect(root.querySelectorAll('p.note')).toHaveLength(2)
    expect(buttonByText(root, '설정 바꾸기')).toBeTruthy()
  })

  it('이미 granted 로 열면 이 페이지 로드에서 Onboarding Viewed 를 1건 보낸다', async () => {
    await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    expect(tracked('Onboarding Viewed')).toHaveLength(1)
  })

  // example_shown 은 이 페이지 로드에서 변형상 예시 링크를 보여 주는지다. 실험의 노출 기록이다.
  it.each([
    ['show', { variants: { onboarding_example: 'show' } }, true],
    ['hide', { variants: { onboarding_example: 'hide' } }, false],
    ['변형을 모름', { variants: null }, false],
    ['변형 응답 실패', 'lastError', false],
  ])('Onboarding Viewed 에 example_shown 을 싣는다(%s)', async (_label, variants, expected) => {
    await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } }, variants })
    const views = tracked('Onboarding Viewed')
    expect(views).toHaveLength(1)
    expect(views[0].properties).toEqual({ example_shown: expected })
  })
})

describe('온보딩 배선: 두 응답을 따로 기다림', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const load = loadOnboarding

  it('GET_CONSENT 는 granted 로 즉시, GET_VARIANT 는 무응답이면 타임아웃 뒤 완료 상태이고 예시 링크는 없다', async () => {
    const root = await load({ consent: { consent: { status: 'granted', decidedAt: 1 } }, variants: 'none' })
    await vi.advanceTimersByTimeAsync(2000)

    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
    expect(buttonByText(root, '설정 바꾸기')).toBeTruthy()
    expect(buttonByText(root, '동의하고 시작')).toBeUndefined()
    expect(exampleLink(root)).toBeNull()
  })

  it('GET_VARIANT 는 show 로 즉시, GET_CONSENT 는 무응답이면 타임아웃 뒤 undecided 화면이고, 고른 뒤 예시 링크를 보인다', async () => {
    const root = await load({ consent: 'none', variants: { variants: { onboarding_example: 'show' } } })
    await vi.advanceTimersByTimeAsync(2000)

    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(buttonByText(root, '통계 없이 사용')).toBeTruthy()
    expect(exampleLink(root)).toBeNull()

    buttonByText(root, '통계 없이 사용').click()
    await vi.advanceTimersByTimeAsync(0)
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
    expect(exampleLink(root)).not.toBeNull()
  })

  it('한 응답이 늦는 동안에는 그리지 않는다(깜빡임 방지)', async () => {
    const root = await load({ consent: { consent: { status: 'granted', decidedAt: 1 } }, variants: 'none' })
    await vi.advanceTimersByTimeAsync(1999)
    expect(root.textContent).toBe('')

    await vi.advanceTimersByTimeAsync(1)
    expect(root.textContent).not.toBe('')
  })

  it('늦게 도착한 변형으로는 이 페이지 로드에서 다시 그리지 않는다', async () => {
    const root = await load({ consent: { consent: { status: 'granted', decidedAt: 1 } }, variants: 'hold' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(exampleLink(root)).toBeNull()

    held['crf:get-variant']({ variants: { onboarding_example: 'show' } })
    await vi.advanceTimersByTimeAsync(0)
    expect(exampleLink(root)).toBeNull()
  })

  it('늦게 도착한 동의 상태로는 다시 그리되 예시 링크 표시 여부는 그대로다', async () => {
    const root = await load({ consent: 'hold', variants: { variants: { onboarding_example: 'show' } } })
    await vi.advanceTimersByTimeAsync(2000)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(exampleLink(root)).toBeNull()

    held['crf:get-consent']({ consent: { status: 'granted', decidedAt: 1 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(buttonByText(root, '동의하고 시작')).toBeUndefined()
    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
    expect(exampleLink(root)).not.toBeNull()
  })

  it('두 응답이 모두 제때 오면 타임아웃을 기다리지 않고 바로 그린다', async () => {
    const root = await load({
      consent: { consent: { status: 'denied', decidedAt: 1 } },
      variants: { variants: { onboarding_example: 'show' } },
    })
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
    expect(exampleLink(root)).not.toBeNull()
  })
})

describe('온보딩 배선: 동의하고 시작', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('SET_CONSENT granted(source onboarding)를 1건 보내고 그 뒤에 Onboarding Viewed 를 정확히 1건 보낸다', async () => {
    const root = await loadOnboarding()
    expect(ofType('crf:track')).toHaveLength(0)

    buttonByText(root, '동의하고 시작').click()
    await tick()

    expect(ofType('crf:set-consent')).toEqual([{ type: 'crf:set-consent', status: 'granted', source: 'onboarding' }])
    const views = tracked('Onboarding Viewed')
    expect(views).toHaveLength(1)
    expect(views[0].properties).toEqual({ example_shown: true })
    expect(ofType('crf:track')).toHaveLength(1)
    expect(sent.indexOf(views[0])).toBeGreaterThan(sent.indexOf(ofType('crf:set-consent')[0]))
  })

  it('완료 상태(동의)로 다시 그린다', async () => {
    const root = await loadOnboarding()
    buttonByText(root, '동의하고 시작').click()
    await tick()

    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다. 확장 패널에서 언제든 끌 수 있습니다.')
    expect(buttonByText(root, '설정 바꾸기')).toBeTruthy()
    expect(buttonByText(root, '동의하고 시작')).toBeUndefined()
  })

  it('응답을 기다리는 중에 버튼을 연달아 눌러도 SET_CONSENT 는 1건이다', async () => {
    const root = await loadOnboarding({ setConsent: 'none' })
    const grant = buttonByText(root, '동의하고 시작')
    grant.click()
    grant.click()
    await tick()
    expect(ofType('crf:set-consent')).toHaveLength(1)
  })
})

describe('온보딩 배선: SET_CONSENT 무응답', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('5초 안에 응답이 없으면 오류 문구를 보이고 버튼을 다시 쓸 수 있다', async () => {
    const root = await loadOnboarding({ setConsent: () => 'none' })
    buttonByText(root, '동의하고 시작').click()

    await vi.advanceTimersByTimeAsync(4999)
    expect(root.textContent).not.toContain(SAVE_ERROR)

    await vi.advanceTimersByTimeAsync(1)
    expect(root.textContent).toContain(SAVE_ERROR)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(buttonByText(root, '통계 없이 사용')).toBeTruthy()
    expect(ofType('crf:track')).toHaveLength(0)

    buttonByText(root, '통계 없이 사용').click()
    await vi.advanceTimersByTimeAsync(0)
    expect(ofType('crf:set-consent')).toHaveLength(2)
  })
})

describe('온보딩 배선: 통계 없이 사용', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('SET_CONSENT denied 를 1건 보내고 TRACK 은 0건이다', async () => {
    const root = await loadOnboarding()
    buttonByText(root, '통계 없이 사용').click()
    await tick()

    expect(ofType('crf:set-consent')).toEqual([{ type: 'crf:set-consent', status: 'denied', source: 'onboarding' }])
    expect(ofType('crf:track')).toHaveLength(0)
  })

  it('완료 상태(거절)로 다시 그린다', async () => {
    const root = await loadOnboarding()
    buttonByText(root, '통계 없이 사용').click()
    await tick()

    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다. 확장 패널에서 언제든 켤 수 있습니다.')
    expect(buttonByText(root, '설정 바꾸기')).toBeTruthy()
  })
})

describe('온보딩 배선: 저장 실패', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['invalid', () => ({ error: 'invalid' })],
    ['failed', () => ({ error: 'failed' })],
    ['응답 없음(lastError)', () => 'lastError'],
    ['sendMessage 예외', () => 'throw'],
    ['consent 없는 응답', () => ({})],
  ])('SET_CONSENT 가 실패(%s)하면 오류 문구를 보이고 두 버튼을 유지하며 TRACK 은 0건이다', async (_label, setConsent) => {
    const root = await loadOnboarding({ setConsent })
    buttonByText(root, '동의하고 시작').click()
    await tick()

    expect(root.textContent).toContain(SAVE_ERROR)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(buttonByText(root, '통계 없이 사용')).toBeTruthy()
    expect(root.textContent).not.toContain('설정했습니다')
    expect(ofType('crf:track')).toHaveLength(0)
  })

  it('거절 선택이 실패해도 같은 오류 문구와 선택 전 상태를 유지한다', async () => {
    const root = await loadOnboarding({ setConsent: () => ({ error: 'failed' }) })
    buttonByText(root, '통계 없이 사용').click()
    await tick()

    expect(root.textContent).toContain(SAVE_ERROR)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(ofType('crf:track')).toHaveLength(0)
  })

  it('실패 뒤 다시 눌러 성공하면 오류 문구가 사라지고 완료 상태가 된다', async () => {
    let calls = 0
    const root = await loadOnboarding({
      setConsent: (message) =>
        ++calls === 1 ? { error: 'failed' } : { consent: { status: message.status, decidedAt: 1 } },
    })
    buttonByText(root, '동의하고 시작').click()
    await tick()
    expect(root.textContent).toContain(SAVE_ERROR)

    buttonByText(root, '동의하고 시작').click()
    await tick()
    expect(root.textContent).not.toContain(SAVE_ERROR)
    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
    expect(tracked('Onboarding Viewed')).toHaveLength(1)
  })
})

describe('온보딩 배선: 설정 바꾸기', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('누르면 선택 화면이 다시 나온다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'denied', decidedAt: 1 } } })
    buttonByText(root, '설정 바꾸기').click()
    await tick()

    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(buttonByText(root, '통계 없이 사용')).toBeTruthy()
  })

  it('거절에서 동의로 바꾸면 Onboarding Viewed 를 이 페이지 로드에서 1건 보낸다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'denied', decidedAt: 1 } } })
    buttonByText(root, '설정 바꾸기').click()
    await tick()
    buttonByText(root, '동의하고 시작').click()
    await tick()

    expect(ofType('crf:set-consent')).toHaveLength(1)
    expect(tracked('Onboarding Viewed')).toHaveLength(1)
  })

  it('동의에서 거절로 바꾸면 TRACK 을 더 보내지 않는다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    const before = ofType('crf:track').length
    buttonByText(root, '설정 바꾸기').click()
    await tick()
    buttonByText(root, '통계 없이 사용').click()
    await tick()

    expect(ofType('crf:track')).toHaveLength(before)
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
  })

  it('이미 Viewed 를 보낸 페이지에서 동의를 다시 바꿔도 Viewed 는 1건이다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    buttonByText(root, '설정 바꾸기').click()
    await tick()
    buttonByText(root, '통계 없이 사용').click()
    await tick()
    buttonByText(root, '설정 바꾸기').click()
    await tick()
    buttonByText(root, '동의하고 시작').click()
    await tick()

    expect(tracked('Onboarding Viewed')).toHaveLength(1)
  })
})

describe('온보딩 배선: 다시 묻는 안내', () => {
  const DEVICE_ID = '3f2c1a9e-5b7d-4c8a-9e1f-0a2b4c6d8e0f'
  const REASK_NOTICE = '무신사에서도 동작하게 되어 통계를 보낼지 다시 여쭙니다. 고르기 전까지는 아무것도 보내지 않습니다.'
  const reply = (status, deviceId) => ({ consent: { status, decidedAt: status === 'undecided' ? null : 1, deviceId } })
  const notice = (root) => root.querySelector('.notice')

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('undecided 응답에 기기 번호가 있으면(동의했던 기기) 안내를 보여 주고 아무것도 보내지 않는다', async () => {
    const root = await loadOnboarding({ consent: reply('undecided', DEVICE_ID) })
    expect(notice(root).textContent).toBe(REASK_NOTICE)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(ofType('crf:track')).toHaveLength(0)
    expect(ofType('crf:set-consent')).toHaveLength(0)
  })

  it.each([
    ['null', reply('undecided', null)],
    ['필드 없음', { consent: { status: 'undecided', decidedAt: null } }],
  ])('undecided 응답의 기기 번호가 %s 이면(처음 설치한 기기) 안내가 없다', async (_label, consent) => {
    const root = await loadOnboarding({ consent })
    expect(notice(root)).toBeNull()
  })

  it('읽기 실패 표지가 붙은 응답은 번호가 있어도 안내를 보여 주지 않는다', async () => {
    const root = await loadOnboarding({ consent: { ...reply('undecided', DEVICE_ID), error: 'failed' } })
    expect(notice(root)).toBeNull()
  })

  it.each(['granted', 'denied'])('%s 완료 화면에는 안내가 없고 설정 바꾸기로 연 선택 화면에도 없다', async (status) => {
    const root = await loadOnboarding({ consent: reply(status, DEVICE_ID) })
    expect(notice(root)).toBeNull()

    buttonByText(root, '설정 바꾸기').click()
    await tick()
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(notice(root)).toBeNull()
  })

  it.each([
    ['동의하고 시작', 'granted'],
    ['통계 없이 사용', 'denied'],
  ])('%s 를 고르면 안내가 사라진다', async (label, status) => {
    const root = await loadOnboarding({
      consent: reply('undecided', DEVICE_ID),
      setConsent: (message) => reply(message.status, DEVICE_ID),
    })
    buttonByText(root, label).click()
    await tick()

    expect(ofType('crf:set-consent')).toEqual([{ type: 'crf:set-consent', status, source: 'onboarding' }])
    expect(notice(root)).toBeNull()
  })

  it('저장 실패 뒤에도 안내는 남는다', async () => {
    const root = await loadOnboarding({ consent: reply('undecided', DEVICE_ID), setConsent: () => ({ error: 'failed' }) })
    buttonByText(root, '동의하고 시작').click()
    await tick()

    expect(root.textContent).toContain(SAVE_ERROR)
    expect(notice(root).textContent).toBe(REASK_NOTICE)
  })

  it('다른 곳에서 고르면(CONSENT_CHANGED) 안내가 사라진다', async () => {
    const root = await loadOnboarding({ consent: reply('undecided', DEVICE_ID) })
    deliver({ type: 'crf:consent-changed', consent: { status: 'denied', decidedAt: 5, deviceId: DEVICE_ID } })
    await tick()
    expect(notice(root)).toBeNull()
  })

  it('열려 있는 동안 동의가 되돌려졌으면 다시 보일 때 읽어 안내를 보여 준다', async () => {
    let current = reply('granted', DEVICE_ID)
    const root = await loadOnboarding({ consent: () => current })
    expect(notice(root)).toBeNull()

    current = reply('undecided', DEVICE_ID)
    changeVisibility('visible')
    await tick()
    expect(notice(root).textContent).toBe(REASK_NOTICE)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
  })

  it('2초 뒤 기본 화면을 그린 다음 늦게 온 undecided 응답에 번호가 있으면 안내를 보여 준다', async () => {
    vi.useFakeTimers()
    const root = await loadOnboarding({ consent: 'hold' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(notice(root)).toBeNull()

    held['crf:get-consent'](reply('undecided', DEVICE_ID))
    await tick()
    expect(notice(root).textContent).toBe(REASK_NOTICE)
  })

  it('기기 번호는 화면에도, 이 페이지가 보내는 어떤 메시지에도 실리지 않는다', async () => {
    const root = await loadOnboarding({
      consent: reply('undecided', DEVICE_ID),
      setConsent: (message) => reply(message.status, DEVICE_ID),
    })
    expect(root.outerHTML).not.toContain(DEVICE_ID)

    buttonByText(root, '동의하고 시작').click()
    await tick()
    expect(tracked('Onboarding Viewed')).toHaveLength(1)
    expect(root.outerHTML).not.toContain(DEVICE_ID)
    expect(JSON.stringify(sent)).not.toContain(DEVICE_ID)
  })
})

describe('온보딩 배선: 예시 링크', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('동의한 상태에서 링크를 누르면 Onboarding Example Clicked 를 1건 보낸다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    const before = ofType('crf:track').length
    const link = exampleLink(root)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener')

    link.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    expect(tracked('Onboarding Example Clicked')).toHaveLength(1)
    expect(ofType('crf:track')).toHaveLength(before + 1)
  })

  it('방금 동의한 완료 화면에서 누르면 1건 보낸다', async () => {
    const root = await loadOnboarding()
    buttonByText(root, '동의하고 시작').click()
    await tick()
    exampleLink(root).dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(tracked('Onboarding Example Clicked')).toHaveLength(1)
  })

  it.each([
    ['이미 denied 로 연 완료 화면', async () => loadOnboarding({ consent: { consent: { status: 'denied', decidedAt: 1 } } })],
    [
      '방금 거절한 완료 화면',
      async () => {
        const root = await loadOnboarding()
        buttonByText(root, '통계 없이 사용').click()
        await tick()
        return root
      },
    ],
  ])('%s 에서는 링크를 눌러도 TRACK 을 보내지 않는다', async (_label, open) => {
    const root = await open()
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
    exampleLink(root).dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(ofType('crf:track')).toHaveLength(0)
  })

  it('설정 바꾸기로 선택 화면에 돌아온 동안에는 예시 링크가 없고, 다시 고르면 다시 보인다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    expect(exampleLink(root)).not.toBeNull()

    buttonByText(root, '설정 바꾸기').click()
    await tick()
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(exampleLink(root)).toBeNull()

    buttonByText(root, '통계 없이 사용').click()
    await tick()
    expect(exampleLink(root)).not.toBeNull()
  })

  it('링크 핸들러는 이동을 막지 않는다(새 탭 이동은 브라우저에 맡긴다)', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    const link = exampleLink(root)
    let prevented = null
    // 렌더가 단 핸들러 뒤에 달리므로 그 핸들러가 끝난 시점의 상태를 본다. 문서 수준 preventDefault 는 그 뒤에 실행된다.
    link.addEventListener('click', (event) => {
      prevented = event.defaultPrevented
    })
    link.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(prevented).toBe(false)
  })

  it('예시 링크 클릭은 TRACK 외에 SET_CONSENT 를 보내지 않는다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    exampleLink(root).dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(ofType('crf:set-consent')).toHaveLength(0)
  })
})

describe('온보딩 배선: 다른 곳에서 바뀐 동의', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('선택 화면에서 CONSENT_CHANGED denied 를 받으면 거절 완료 화면이 된다', async () => {
    const root = await loadOnboarding()
    deliver(changed('denied'))

    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
    expect(buttonByText(root, '설정 바꾸기')).toBeTruthy()
    expect(buttonByText(root, '동의하고 시작')).toBeUndefined()
    expect(ofType('crf:track')).toHaveLength(0)
  })

  it('선택 화면에서 CONSENT_CHANGED granted 를 받으면 동의 완료 화면이고 Onboarding Viewed 는 1건이다', async () => {
    const root = await loadOnboarding()
    deliver(changed('granted'))
    await tick()

    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
    expect(tracked('Onboarding Viewed')).toHaveLength(1)

    deliver(changed('granted'))
    await tick()
    expect(tracked('Onboarding Viewed')).toHaveLength(1)
  })

  it('이 페이지에서 방금 저장한 상태와 같은 알림이 와도 Onboarding Viewed 는 1건이다', async () => {
    const root = await loadOnboarding()
    buttonByText(root, '동의하고 시작').click()
    await tick()
    deliver(changed('granted'))
    await tick()

    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
    expect(tracked('Onboarding Viewed')).toHaveLength(1)
  })

  it('알림은 예시 링크 표시 여부를 바꾸지 않는다', async () => {
    const shown = await loadOnboarding({ variants: { variants: { onboarding_example: 'show' } } })
    expect(exampleLink(shown)).toBeNull()
    deliver(changed('denied'))
    expect(exampleLink(shown)).not.toBeNull()

    const hidden = await loadOnboarding({ variants: { variants: { onboarding_example: 'hide' } } })
    deliver(changed('denied'))
    expect(exampleLink(hidden)).toBeNull()
  })

  it('설정 바꾸기로 선택 화면에 있을 때 같은 상태의 알림이 와도 선택 화면을 유지한다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    buttonByText(root, '설정 바꾸기').click()
    await tick()
    deliver(changed('granted'))
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
  })

  it('다른 상태의 알림이 오면 선택 화면에서도 그 상태의 완료 화면으로 바뀐다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    buttonByText(root, '설정 바꾸기').click()
    await tick()
    deliver(changed('denied'))
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
  })

  it.each([
    ['탭에서 온 발신', changed('denied'), { tab: { id: 5 } }],
    ['알 수 없는 상태', { type: 'crf:consent-changed', consent: { status: 'maybe' } }, {}],
    ['consent 없음', { type: 'crf:consent-changed' }, {}],
  ])('%s 의 CONSENT_CHANGED 는 무시한다', async (_label, message, sender) => {
    const root = await loadOnboarding()
    deliver(message, sender)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
  })

  it('페이지가 다시 보이면 GET_CONSENT 를 다시 묻고 응답 상태로 그린다', async () => {
    let current = { consent: { status: 'undecided', decidedAt: null } }
    const root = await loadOnboarding({ consent: () => current })
    expect(ofType('crf:get-consent')).toHaveLength(1)

    current = { consent: { status: 'denied', decidedAt: 9 } }
    changeVisibility('visible')
    await tick()

    expect(ofType('crf:get-consent')).toHaveLength(2)
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
  })

  it('페이지가 숨겨질 때는 묻지 않고, 다시 읽기에 실패하면 화면을 유지한다', async () => {
    let current = { consent: { status: 'undecided', decidedAt: null } }
    const root = await loadOnboarding({ consent: () => current })
    changeVisibility('hidden')
    await tick()
    expect(ofType('crf:get-consent')).toHaveLength(1)

    current = 'lastError'
    changeVisibility('visible')
    await tick()
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
  })

  it('다시 읽은 granted 에서도 Onboarding Viewed 는 1건을 넘지 않는다', async () => {
    let current = { consent: { status: 'undecided', decidedAt: null } }
    await loadOnboarding({ consent: () => current })
    current = { consent: { status: 'granted', decidedAt: 9 } }
    changeVisibility('visible')
    await tick()
    changeVisibility('visible')
    await tick()
    expect(tracked('Onboarding Viewed')).toHaveLength(1)
  })
})

describe('온보딩 배선: 늦게 온 응답과 저장 뒤 재확인', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('2초에 undecided 로 그리고 3초에 granted 응답이 오면 동의 완료 화면으로 바뀐다(Viewed 1건)', async () => {
    const root = await loadOnboarding({ consent: 'hold', variants: { variants: { onboarding_example: 'show' } } })
    await vi.advanceTimersByTimeAsync(2000)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()

    await vi.advanceTimersByTimeAsync(1000)
    held['crf:get-consent']({ consent: { status: 'granted', decidedAt: 1 } })
    await tick()

    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
    expect(buttonByText(root, '설정 바꾸기')).toBeTruthy()
    expect(tracked('Onboarding Viewed')).toHaveLength(1)
  })

  it('그 사이에 사용자가 denied 를 저장했다면 늦은 granted 응답이 화면을 바꾸지 않는다', async () => {
    const root = await loadOnboarding({ consent: 'hold' })
    await vi.advanceTimersByTimeAsync(2000)
    buttonByText(root, '통계 없이 사용').click()
    await tick()
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')

    held['crf:get-consent']({ consent: { status: 'granted', decidedAt: 1 } })
    await tick()
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
    expect(tracked('Onboarding Viewed')).toHaveLength(0)
  })

  it('그 사이에 CONSENT_CHANGED 를 받았다면 늦은 응답은 화면을 바꾸지 않는다', async () => {
    const root = await loadOnboarding({ consent: 'hold' })
    await vi.advanceTimersByTimeAsync(2000)
    deliver(changed('denied'))
    held['crf:get-consent']({ consent: { status: 'granted', decidedAt: 1 } })
    await tick()
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
  })

  it('늦게 온 변형 응답은 예시 링크를 나타나게 하지 않는다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } }, variants: 'hold' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
    held['crf:get-variant']({ variants: { onboarding_example: 'show' } })
    await tick()
    expect(exampleLink(root)).toBeNull()
  })

  it('저장 실패 뒤 다시 읽은 상태가 요청한 상태와 같으면 오류 문구를 지운다', async () => {
    let current = { consent: { status: 'undecided', decidedAt: null } }
    const root = await loadOnboarding({ consent: () => current, setConsent: () => 'none' })
    expect(ofType('crf:get-consent')).toHaveLength(1)

    // 응답은 늦었지만 저장은 됐다.
    current = { consent: { status: 'denied', decidedAt: 7 } }
    buttonByText(root, '통계 없이 사용').click()
    await vi.advanceTimersByTimeAsync(5000)

    expect(ofType('crf:get-consent')).toHaveLength(2)
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다.')
    expect(root.textContent).not.toContain(SAVE_ERROR)
  })

  it('저장 실패 뒤 다시 읽은 상태가 요청한 상태와 다르면 오류 문구를 남긴다', async () => {
    const root = await loadOnboarding({ setConsent: () => 'none' })

    // 저장되지 않았다. 다시 읽어도 undecided 그대로다.
    buttonByText(root, '통계 없이 사용').click()
    await vi.advanceTimersByTimeAsync(5000)

    expect(ofType('crf:get-consent')).toHaveLength(2)
    expect(buttonByText(root, '동의하고 시작')).toBeDefined()
    expect(root.textContent).toContain(SAVE_ERROR)
  })

  it('설정 바꾸기 중 같은 선택이 늦게 저장된 것으로 확인되면 선택 화면에서 나와 오류 문구를 지운다', async () => {
    const root = await loadOnboarding({
      consent: { consent: { status: 'granted', decidedAt: 1 } },
      setConsent: () => 'none',
    })
    buttonByText(root, '설정 바꾸기').click()
    buttonByText(root, '동의하고 시작').click()
    await vi.advanceTimersByTimeAsync(5000)

    expect(root.textContent).not.toContain(SAVE_ERROR)
    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다.')
  })

  it('SET_CONSENT 진행 중에는 선택 버튼이 disabled 이고 끝나면 풀린다', async () => {
    const root = await loadOnboarding({ setConsent: () => 'none' })
    buttonByText(root, '동의하고 시작').click()
    expect(buttonByText(root, '동의하고 시작').disabled).toBe(true)
    expect(buttonByText(root, '통계 없이 사용').disabled).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)
    expect(buttonByText(root, '동의하고 시작').disabled).toBe(false)
    expect(buttonByText(root, '통계 없이 사용').disabled).toBe(false)
  })

  it('성공하면 완료 화면의 설정 바꾸기 버튼은 활성이다', async () => {
    const root = await loadOnboarding()
    buttonByText(root, '동의하고 시작').click()
    await tick()
    expect(buttonByText(root, '설정 바꾸기').disabled).toBe(false)
  })
})
