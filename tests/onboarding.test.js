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
  const runtime = {
    lastError: undefined,
    sendMessage(message, callback) {
      sent.push(message)
      const reply =
        message?.type === 'crf:get-consent'
          ? consent
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
  }
  globalThis.chrome = { runtime }
  globalThis.document = document
  vi.resetModules()
  await import('../extension/src/onboarding/index.js')
  await tick()
  return document.getElementById('root')
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
    globalThis.chrome = { runtime: { lastError: undefined, sendMessage: () => undefined } }
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

  it('variant 가 show 면 예시 링크를, hide 면 링크를 그리지 않는다', async () => {
    const shown = await loadOnboarding({ variants: { variants: { onboarding_example: 'show' } } })
    expect(exampleLink(shown)).not.toBeNull()

    const hidden = await loadOnboarding({ variants: { variants: { onboarding_example: 'hide' } } })
    expect(exampleLink(hidden)).toBeNull()
  })

  it('variants 가 null 이거나 배정이 없으면 예시 링크를 그리지 않는다(변형을 모르면 실험 노출을 만들지 않는다)', async () => {
    const unknown = await loadOnboarding({ variants: { variants: null } })
    expect(exampleLink(unknown)).toBeNull()

    const missing = await loadOnboarding({ variants: { variants: {} } })
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

  it('이미 granted 로 열면 이 페이지 로드에서 Onboarding Viewed 를 1건 보낸다', async () => {
    await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    expect(tracked('Onboarding Viewed')).toHaveLength(1)
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

  it('GET_VARIANT 는 show 로 즉시, GET_CONSENT 는 무응답이면 타임아웃 뒤 undecided 화면과 예시 링크를 보인다', async () => {
    const root = await load({ consent: 'none', variants: { variants: { onboarding_example: 'show' } } })
    await vi.advanceTimersByTimeAsync(2000)

    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
    expect(buttonByText(root, '통계 없이 사용')).toBeTruthy()
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

  it('늦게 도착한 동의 상태로도 다시 그리지 않는다', async () => {
    const root = await load({ consent: 'hold', variants: { variants: { onboarding_example: 'show' } } })
    await vi.advanceTimersByTimeAsync(2000)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()

    held['crf:get-consent']({ consent: { status: 'granted', decidedAt: 1 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(buttonByText(root, '동의하고 시작')).toBeTruthy()
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
    ['undecided', { consent: { status: 'undecided', decidedAt: null } }],
    ['denied', { consent: { status: 'denied', decidedAt: 1 } }],
  ])('%s 에서는 링크를 눌러도 TRACK 을 보내지 않는다', async (_label, consent) => {
    const root = await loadOnboarding({ consent })
    exampleLink(root).dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(ofType('crf:track')).toHaveLength(0)
  })

  it('설정 바꾸기로 선택 화면에 돌아온 동안에는 granted 였어도 TRACK 을 보내지 않는다', async () => {
    const root = await loadOnboarding({ consent: { consent: { status: 'granted', decidedAt: 1 } } })
    const before = tracked('Onboarding Example Clicked').length
    buttonByText(root, '설정 바꾸기').click()
    await tick()
    exampleLink(root).dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(tracked('Onboarding Example Clicked')).toHaveLength(before)
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
    const root = await loadOnboarding()
    exampleLink(root).dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(ofType('crf:set-consent')).toHaveLength(0)
  })
})
