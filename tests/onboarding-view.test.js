import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { renderOnboarding } from '../extension/src/onboarding/view.js'

const EXAMPLE_URL = 'https://www.coupang.com/vp/products/7590830589'
const PRIVACY_URL = 'https://landing.test/privacy'

// 제출 뒤에는 재심사 없이 고칠 수 없는 고지 문구다. 실제 전송 항목과 맞춘 전체 문자열로 고정한다.
const SENT_ITEMS = [
  '배너가 뜬 횟수, 체험단 리뷰 비중과 평점 같은 숫자, 필터가 켜져 있었는지',
  '숨기기 버튼, 패널, 장바구니와 바로구매 버튼, 설치 안내의 예시 링크를 눌렀는지',
  '리뷰 정렬 방식(베스트순, 최신순)',
  '확장의 화면(설치 안내, 패널)을 열었는지, 이용한 시각과 머문 시간',
  '확장 버전, 화면 실험 그룹, 통계를 켠 화면, 오류가 났는지와 종류',
  '확장을 제거할 때 제거 사실과 사용 기간, 직접 고른 이유',
  '무작위로 만든 익명 기기 번호',
]

const NOT_SENT_ITEMS = [
  '리뷰 내용, 상품 이름, 상품 주소',
  '쿠팡 계정, 이름, 이메일, 결제 정보',
  '쿠팡 상품 페이지가 아닌 다른 사이트에서 무엇을 보거나 했는지',
]

const NOTE_ITEMS = [
  '어떤 상품을 봤는지는 저희도 알 수 없습니다. 상품 번호와 리뷰 번호는 이 기기 밖에서는 원래 번호로 되돌릴 수 없는 값으로 바꿔 보냅니다.',
  '통계는 분석 도구 Amplitude(미국 서버)에 저장됩니다. 광고나 판매에 쓰지 않습니다. 개인을 알 수 없는 집계 결과는 공개할 수 있습니다.',
]

const HOW_TO_ITEMS = [
  '쿠팡에서 상품 페이지를 엽니다',
  '리뷰까지 내려가면 체험단 리뷰 비중과 체험단을 뺀 평점이 보입니다',
  '버튼을 누르면 체험단 리뷰를 숨기고, 다시 누르면 다시 볼 수 있습니다',
]

const SAVE_ERROR = '설정을 저장하지 못했습니다. 다시 시도해 주세요.'

let root

function render(overrides = {}) {
  const options = {
    status: 'undecided',
    showExample: true,
    exampleUrl: EXAMPLE_URL,
    privacyUrl: PRIVACY_URL,
    onChoose: vi.fn(),
    onExample: vi.fn(),
    onChange: vi.fn(),
    ...overrides,
  }
  renderOnboarding(root, options)
  return options
}

const buttons = () => [...root.querySelectorAll('button')]
const buttonByText = (text) => buttons().find((button) => button.textContent === text)
const listItems = (heading) => {
  const box = [...root.querySelectorAll('section')].find((section) => section.querySelector('h3, h2')?.textContent === heading)
  return [...(box?.querySelectorAll('li') ?? [])].map((li) => li.textContent)
}

beforeEach(() => {
  const dom = new JSDOM('<body><main id="root"></main></body>')
  globalThis.document = dom.window.document
  root = dom.window.document.getElementById('root')
})

describe('renderOnboarding: 안내', () => {
  it('제목과 설명을 h1 과 문단으로 보여 준다', () => {
    render()
    expect(root.querySelector('h1').textContent).toBe('설치가 끝났습니다')
    expect(root.textContent).toContain('쿠팡 상품 페이지의 리뷰 영역에서 자동으로 동작합니다.')
  })

  it('사용 방법을 번호 목록 3줄로 보여 준다', () => {
    render()
    const heading = [...root.querySelectorAll('h2')].find((node) => node.textContent === '사용 방법')
    expect(heading).toBeTruthy()
    const list = root.querySelector('ol')
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual(HOW_TO_ITEMS)
  })
})

describe('renderOnboarding: undecided', () => {
  it('동의 제목과 설명을 보여 준다', () => {
    render()
    expect(root.textContent).toContain('익명 사용 통계를 보내 주시겠어요?')
    expect(root.textContent).toContain(
      '이 확장이 제대로 동작하는지, 어떤 화면이 더 도움이 되는지 확인하는 데만 씁니다. 동의하지 않아도 모든 기능을 쓸 수 있습니다.',
    )
  })

  it('두 선택 버튼을 보여 준다', () => {
    render()
    expect(buttons().map((button) => button.textContent)).toEqual(['동의하고 시작', '통계 없이 사용'])
  })

  it('두 선택 버튼은 같은 클래스와 같은 type 을 쓴다(한쪽만 강조하지 않는다)', () => {
    render()
    const grant = buttonByText('동의하고 시작')
    const deny = buttonByText('통계 없이 사용')
    expect(grant.className).toBeTruthy()
    expect(grant.className).toBe(deny.className)
    expect(grant.getAttribute('type')).toBe('button')
    expect(deny.getAttribute('type')).toBe('button')
    expect(grant.parentElement).toBe(deny.parentElement)
  })

  it('버튼을 누르면 onChoose 가 granted, denied 로 불린다', () => {
    const { onChoose } = render()
    buttonByText('동의하고 시작').click()
    expect(onChoose).toHaveBeenLastCalledWith('granted')
    buttonByText('통계 없이 사용').click()
    expect(onChoose).toHaveBeenLastCalledWith('denied')
    expect(onChoose).toHaveBeenCalledTimes(2)
  })

  it('"보내는 것" 목록은 7줄이고 문자열이 같다', () => {
    render()
    expect(listItems('보내는 것')).toHaveLength(7)
    expect(listItems('보내는 것')).toEqual(SENT_ITEMS)
  })

  it('선택 화면에는 완료 화면용 소제목(보내는 내용)과 그 구역이 없다', () => {
    render()
    expect([...root.querySelectorAll('h2')].map((node) => node.textContent)).not.toContain('보내는 내용')
    expect(root.querySelector('section.details')).toBeNull()
    expect(root.querySelectorAll('hr')).toHaveLength(1)
  })

  it('"보내지 않는 것" 목록은 3줄이고 문자열이 같다', () => {
    render()
    expect(listItems('보내지 않는 것')).toHaveLength(3)
    expect(listItems('보내지 않는 것')).toEqual(NOT_SENT_ITEMS)
  })

  it('"보내지 않는 것" 에 지킬 수 없는 절대 표현(어떤 ... 도)을 쓰지 않는다', () => {
    render()
    for (const item of listItems('보내지 않는 것')) expect(item).not.toMatch(/어떤 .*도$/)
  })

  it('보충 설명 두 줄을 전체 문자열 그대로 보여 준다', () => {
    render()
    expect([...root.querySelectorAll('p.note')].map((node) => node.textContent)).toEqual(NOTE_ITEMS)
  })

  it('설정 바꾸기 버튼과 완료 문구는 없다', () => {
    render()
    expect(buttonByText('설정 바꾸기')).toBeUndefined()
    expect(root.textContent).not.toContain('설정했습니다')
  })

  it('저장 실패를 알리면 오류 문구를 보여 주고 두 버튼을 유지한다', () => {
    render({ saveFailed: true })
    expect(root.textContent).toContain(SAVE_ERROR)
    expect(buttons().map((button) => button.textContent)).toEqual(['동의하고 시작', '통계 없이 사용'])
  })

  it('저장 실패가 아니면 오류 문구가 없다', () => {
    render()
    expect(root.textContent).not.toContain(SAVE_ERROR)
  })
})

// 예시 링크는 선택을 마친 완료 화면에서만 보인다. 선택 전에 보이면 눌러서 떠난 사용자가 표본에서 빠져 실험이 치우친다.
describe('renderOnboarding: 예시 링크', () => {
  const exampleLink = () => root.querySelector(`a[href="${EXAMPLE_URL}"]`)

  it('선택 전 화면(undecided)에는 showExample 이 true 여도 예시 링크가 없다', () => {
    render({ status: 'undecided', showExample: true })
    expect(root.textContent).not.toContain('예시 상품에서 바로 확인하기')
    expect(exampleLink()).toBeNull()
    expect(root.querySelector('.example')).toBeNull()
  })

  it.each(['granted', 'denied'])('%s 완료 화면에서 showExample 이 true 면 exampleUrl 로 가는 새 탭 링크를 보여 준다', (status) => {
    render({ status, showExample: true })
    const link = exampleLink()
    expect(link.textContent).toBe('예시 상품에서 바로 확인하기')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener')
  })

  it.each(['granted', 'denied'])('%s 완료 화면에서도 showExample 이 false 면 예시 링크가 없다', (status) => {
    render({ status, showExample: false })
    expect(root.textContent).not.toContain('예시 상품에서 바로 확인하기')
    expect(exampleLink()).toBeNull()
  })

  it.each(['granted', 'denied'])('%s 완료 화면의 예시 링크는 완료 문구 아래, 설정 바꾸기 버튼 위에 있다', (status) => {
    render({ status, showExample: true })
    const section = root.querySelector('section.consent')
    const order = [...section.children].map((node) => node.className)
    expect(order).toEqual(['done', 'example', 'choice'])
    expect(section.children[1].contains(exampleLink())).toBe(true)
    expect(section.children[2].textContent).toBe('설정 바꾸기')
    expect(root.querySelectorAll(`a[href="${EXAMPLE_URL}"]`)).toHaveLength(1)
  })

  it('링크를 누르면 onExample 이 1회 불린다', () => {
    const { onExample } = render({ status: 'granted' })
    exampleLink().dispatchEvent(new root.ownerDocument.defaultView.Event('click', { cancelable: true }))
    expect(onExample).toHaveBeenCalledTimes(1)
  })
})

describe('renderOnboarding: 처리방침 링크', () => {
  it('privacyUrl 이 null 이면 링크가 없다', () => {
    render({ privacyUrl: null })
    expect(root.textContent).not.toContain('개인정보 처리방침')
    expect(root.querySelector(`a[href="${PRIVACY_URL}"]`)).toBeNull()
  })

  it('privacyUrl 이 있으면 새 탭 링크를 보여 준다', () => {
    render()
    const link = root.querySelector(`a[href="${PRIVACY_URL}"]`)
    expect(link.textContent).toBe('개인정보 처리방침')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener')
  })
})

describe('renderOnboarding: 완료 상태', () => {
  it('granted 면 동의 완료 문구와 설정 바꾸기 버튼을 보여 준다', () => {
    render({ status: 'granted' })
    expect(root.textContent).toContain('익명 통계를 보내도록 설정했습니다. 확장 패널에서 언제든 끌 수 있습니다.')
    expect(buttons().map((button) => button.textContent)).toEqual(['설정 바꾸기'])
  })

  it('denied 면 거절 완료 문구와 설정 바꾸기 버튼을 보여 준다', () => {
    render({ status: 'denied' })
    expect(root.textContent).toContain('통계를 보내지 않도록 설정했습니다. 확장 패널에서 언제든 켤 수 있습니다.')
    expect(buttons().map((button) => button.textContent)).toEqual(['설정 바꾸기'])
  })

  it.each(['granted', 'denied'])('%s 면 동의를 묻는 제목, 설명, 선택 버튼은 없다', (status) => {
    render({ status })
    expect(root.textContent).not.toContain('익명 사용 통계를 보내 주시겠어요?')
    expect(root.textContent).not.toContain('동의하지 않아도 모든 기능을 쓸 수 있습니다.')
    expect(buttonByText('동의하고 시작')).toBeUndefined()
    expect(buttonByText('통계 없이 사용')).toBeUndefined()
  })

  // 패널의 보내는 내용 보기는 이 페이지를 연다. 이미 고른 사용자도 여기서 무엇을 보내는지 볼 수 있어야 한다.
  it.each(['granted', 'denied'])('%s 완료 화면에도 "보내는 것" 7줄과 "보내지 않는 것" 3줄이 같은 문자열로 있다', (status) => {
    render({ status })
    expect(listItems('보내는 것')).toHaveLength(7)
    expect(listItems('보내는 것')).toEqual(SENT_ITEMS)
    expect(listItems('보내지 않는 것')).toHaveLength(3)
    expect(listItems('보내지 않는 것')).toEqual(NOT_SENT_ITEMS)
  })

  it.each(['granted', 'denied'])('%s 완료 화면에도 보충 설명 두 줄이 전체 문자열 그대로 있다', (status) => {
    render({ status })
    expect([...root.querySelectorAll('p.note')].map((node) => node.textContent)).toEqual(NOTE_ITEMS)
  })

  it.each(['granted', 'denied'])('%s 완료 화면의 목록과 보충은 선택 화면과 같은 마크업이다(같은 렌더 함수)', (status) => {
    const disclosure = () =>
      [...root.querySelectorAll('section.box, p.note')].map((node) => node.outerHTML)
    render({ status: 'undecided' })
    const onChoice = disclosure()
    render({ status })
    expect(onChoice).toHaveLength(4)
    expect(disclosure()).toEqual(onChoice)
  })

  it.each(['granted', 'denied'])(
    '%s 완료 화면의 순서: 완료 문구, 예시 링크, 설정 바꾸기, 구분선, 소제목, 두 상자, 보충 둘, 처리방침',
    (status) => {
      render({ status, showExample: true })
      const consent = root.querySelector('section.consent')
      const details = root.querySelector('section.details')
      expect([...consent.children].map((node) => node.className)).toEqual(['done', 'example', 'choice'])

      const top = [...root.children]
      const from = top.indexOf(consent)
      expect(top.slice(from).map((node) => node.tagName)).toEqual(['SECTION', 'HR', 'SECTION', 'P'])
      expect(top[from + 2]).toBe(details)
      expect(top[from + 3].className).toBe('privacy')

      expect(
        [...details.children].map((node) => `${node.tagName}:${node.querySelector('h3')?.textContent ?? node.className}`),
      ).toEqual(['H2:', 'SECTION:보내는 것', 'SECTION:보내지 않는 것', 'P:note', 'P:note'])
      expect(details.querySelector('h2').textContent).toBe('보내는 내용')
    },
  )

  it('완료 화면에 처리방침 주소가 없으면 보내는 내용 구역이 마지막이다', () => {
    render({ status: 'denied', privacyUrl: null })
    expect(root.lastElementChild).toBe(root.querySelector('section.details'))
  })

  it.each(['granted', 'denied'])('%s 에서도 제목, 설명, 사용 방법은 남는다', (status) => {
    render({ status })
    expect(root.querySelector('h1').textContent).toBe('설치가 끝났습니다')
    expect(root.querySelector('ol').querySelectorAll('li')).toHaveLength(3)
  })

  it('설정 바꾸기를 누르면 onChange 가 불린다', () => {
    const { onChange, onChoose } = render({ status: 'granted' })
    buttonByText('설정 바꾸기').click()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('완료 상태에서 처리방침 링크도 privacyUrl 을 따른다', () => {
    render({ status: 'denied', privacyUrl: null })
    expect(root.textContent).not.toContain('개인정보 처리방침')
    render({ status: 'denied' })
    expect(root.querySelector(`a[href="${PRIVACY_URL}"]`)).not.toBeNull()
  })
})

describe('renderOnboarding: 다시 그리기', () => {
  it('다시 그리면 이전 내용을 비우고 새로 그린다', () => {
    render()
    render({ status: 'granted' })
    expect(root.querySelectorAll('h1')).toHaveLength(1)
    expect(buttons()).toHaveLength(1)
  })
})

// 엠대시(0x2014)와 가운데 점(0x00b7). 이 파일 자체에도 그 문자를 쓰지 않으려고 코드 값으로 만든다.
const FORBIDDEN_MARKS = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x00b7)}]`)

describe('온보딩 소스 구조', () => {
  const read = (name) => readFileSync(new URL(`../extension/src/onboarding/${name}`, import.meta.url), 'utf8')
  const files = ['view.js', 'index.js', 'index.html', 'style.css']

  it('view.js 와 index.js 에 innerHTML 이 없다', () => {
    expect(read('view.js')).not.toMatch(/innerHTML/)
    expect(read('index.js')).not.toMatch(/innerHTML/)
  })

  it('원격 리소스를 불러오지 않는다', () => {
    expect(read('index.html')).not.toMatch(/https?:\/\//)
    expect(read('style.css')).not.toMatch(/https?:\/\/|@import|url\(/)
    expect(read('index.html')).toContain('../../dist/onboarding.js')
  })

  it('엠대시와 가운데 점을 쓰지 않는다', () => {
    for (const name of files) {
      expect(read(name)).not.toMatch(FORBIDDEN_MARKS)
    }
  })

  it('html 은 한국어 문서이고 뷰포트를 지정한다', () => {
    expect(read('index.html')).toMatch(/<html lang="ko">/)
    expect(read('index.html')).toMatch(/name="viewport"/)
  })

  it('CSS 가 다크 모드 색을 다시 정의하고 키보드 포커스를 표시한다', () => {
    const css = read('style.css')
    expect(css).toMatch(/prefers-color-scheme:\s*dark/)
    expect(css).toMatch(/:focus-visible/)
    expect(css).toMatch(/--crf-accent/)
  })

  it('두 선택 버튼이 공유하는 클래스 밖에 버튼 변형 스타일이 없다', () => {
    const css = read('style.css')
    expect(css).not.toMatch(/primary|secondary|muted|ghost/i)
  })
})

describe('renderOnboarding: 저장 중', () => {
  beforeEach(() => {
    const dom = new JSDOM('<body><main id="root"></main></body>')
    globalThis.document = dom.window.document
    root = dom.window.document.getElementById('root')
  })

  const buttons = () => [...root.querySelectorAll('button')]
  const options = (overrides) => ({
    status: 'undecided',
    showExample: true,
    exampleUrl: EXAMPLE_URL,
    privacyUrl: null,
    onChoose: vi.fn(),
    onExample: vi.fn(),
    onChange: vi.fn(),
    ...overrides,
  })

  it('선택 화면에서 saving 이면 두 선택 버튼이 disabled 다', () => {
    renderOnboarding(root, options({ saving: true }))
    expect(buttons().map((button) => button.disabled)).toEqual([true, true])
  })

  it('완료 화면에서 saving 이면 설정 바꾸기 버튼이 disabled 다', () => {
    renderOnboarding(root, options({ status: 'granted', saving: true }))
    expect(buttons().map((button) => button.disabled)).toEqual([true])
  })

  it('완료 화면에서도 saveFailed 이면 오류 문구를 보인다(저장 뒤 상태를 다시 읽은 경우)', () => {
    renderOnboarding(root, options({ status: 'denied', saveFailed: true }))
    expect(root.querySelector('[role="alert"]').textContent).toBe(SAVE_ERROR)
    renderOnboarding(root, options({ status: 'denied', saveFailed: false }))
    expect(root.querySelector('[role="alert"]')).toBeNull()
  })

  it('saving 이 아니면 버튼이 모두 활성이다', () => {
    renderOnboarding(root, options({ saving: false }))
    expect(buttons().every((button) => !button.disabled)).toBe(true)
    renderOnboarding(root, options({ status: 'denied' }))
    expect(buttons().every((button) => !button.disabled)).toBe(true)
  })
})
