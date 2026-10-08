import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { parseUninstallParams, daysSince, initUninstalledPage } from '../site/src/uninstalled.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000
const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000'
const ENDPOINT = 'https://amplitude.test/httpapi'
const THANKS = '알려 주셔서 감사합니다'

const PAGE_HTML = readFileSync(new URL('../site/public/uninstalled.html', import.meta.url), 'utf8')

// d(기기 번호)와 i(설치 시각)는 조각에서만, v(버전)는 쿼리에서만 읽는다. 조각은 서버로 전송되지 않는다.
describe('parseUninstallParams', () => {
  const parse = (search, hash) => parseUninstallParams({ search, hash }, NOW)

  it('조각의 d, i 와 쿼리의 v 를 읽는다', () => {
    const installedAt = NOW - 3 * DAY
    expect(parse('?v=0.2.0', `#d=${DEVICE_ID}&i=${installedAt}`)).toEqual({
      deviceId: DEVICE_ID,
      version: '0.2.0',
      installedAt,
    })
  })

  it('쿼리의 d 와 i 는 읽지 않는다(옛 형식을 받지 않는다)', () => {
    const installedAt = NOW - 3 * DAY
    expect(parse(`?d=${DEVICE_ID}&v=0.2.0&i=${installedAt}`, '')).toEqual({
      deviceId: null,
      version: '0.2.0',
      installedAt: null,
    })
  })

  it('조각의 v 는 읽지 않는다', () => {
    expect(parse('', `#d=${DEVICE_ID}&v=0.2.0`).version).toBeNull()
  })

  it('d 가 UUID 가 아니면 deviceId 는 null 이다', () => {
    expect(parse('?v=0.2.0', '#d=not-a-uuid').deviceId).toBeNull()
    expect(parse('', `#d=${DEVICE_ID}x`).deviceId).toBeNull()
    expect(parse('', '#d=').deviceId).toBeNull()
  })

  it('i 가 미래이면 installedAt 은 null 이다', () => {
    expect(parse('', `#i=${NOW + DAY}`).installedAt).toBeNull()
  })

  it('i 가 숫자가 아니거나 양의 정수가 아니면 null 이다', () => {
    for (const bad of ['abc', '1.5', '-5', '0', '1e3', '']) {
      expect(parse('', `#i=${bad}`).installedAt).toBeNull()
    }
  })

  it('v 의 형식이 틀리면 version 은 null 이다', () => {
    expect(parse('?v=latest', '').version).toBeNull()
    expect(parse('?v=1.2', '').version).toBeNull()
    expect(parse('?v=1.2.3-beta', '').version).toBeNull()
  })

  it('쿼리와 조각이 없으면 모두 null 이다', () => {
    expect(parse('', '')).toEqual({ deviceId: null, version: null, installedAt: null })
    expect(parseUninstallParams({}, NOW)).toEqual({ deviceId: null, version: null, installedAt: null })
  })
})

describe('daysSince', () => {
  it('설치 3.6일 전이면 3 이다', () => {
    expect(daysSince(NOW - 3.6 * DAY, NOW)).toBe(3)
  })

  it('installedAt 이 null 이면 null 이다', () => {
    expect(daysSince(null, NOW)).toBeNull()
  })
})

const PAGE_URL = 'https://site.test/uninstalled'
let lastWindow

// suffix 는 주소의 쿼리와 조각이다. 실제 브라우저처럼 문서의 location 과 history 를 넘긴다.
function loadPage(suffix, configOverrides = {}, overrides = {}) {
  const dom = new JSDOM(PAGE_HTML, { url: `${PAGE_URL}${suffix}` })
  lastWindow = dom.window
  initUninstalledPage({
    document: dom.window.document,
    location: dom.window.location,
    history: dom.window.history,
    config: { apiKey: 'test-key', endpoint: ENDPOINT, ...configOverrides },
    now: NOW,
    ...overrides,
  })
  return dom.window.document
}

function sentEvents() {
  return globalThis.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).events[0])
}

function clickReason(doc, reason) {
  doc.querySelector(`[data-reason="${reason}"]`).click()
}

const GOOD_SEARCH = `?v=0.2.0#d=${DEVICE_ID}&i=${NOW - 3.6 * DAY}`
// 옛 형식. 기기 번호가 쿼리에 실려 서버 접속 기록에 남는다. 받지 않는다.
const QUERY_ONLY = `?d=${DEVICE_ID}&v=0.2.0&i=${NOW - 3.6 * DAY}`

describe('제거 페이지 전송', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  it('조각에 d 가 있으면 Extension Removed 를 한 번 보낸다', () => {
    loadPage(GOOD_SEARCH)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [event] = sentEvents()
    expect(event.event_type).toBe('Extension Removed')
    expect(event.device_id).toBe(DEVICE_ID)
    expect(event.app_version).toBe('0.2.0')
    expect(event.session_id).toBe(-1)
    expect(event.insert_id).toBe(`removed:${DEVICE_ID}`)
    expect(event.event_properties).toEqual({ days_since_install: 3, surface: 'site' })
    expect(globalThis.fetch.mock.calls[0][0]).toBe(ENDPOINT)
  })

  it('같은 기기 번호로 두 번 로드하면 Extension Removed 의 insert_id 가 같다', () => {
    loadPage(GOOD_SEARCH)
    loadPage(GOOD_SEARCH)
    const ids = sentEvents().map((event) => event.insert_id)
    expect(ids).toEqual([`removed:${DEVICE_ID}`, `removed:${DEVICE_ID}`])
  })

  it('설치 시각을 모르면 days_since_install 없이 보낸다', () => {
    loadPage(`?v=0.2.0#d=${DEVICE_ID}`)
    expect(sentEvents()[0].event_properties).toEqual({ surface: 'site' })
  })

  it('d 가 없으면 아무것도 보내지 않는다', () => {
    loadPage('?v=0.2.0')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('d 의 형식이 틀리면 아무것도 보내지 않는다', () => {
    loadPage('?v=0.2.0#d=not-a-uuid')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('쿼리에만 d 가 있으면 0건이다(사유를 눌러도)', () => {
    const doc = loadPage(QUERY_ONLY)
    clickReason(doc, 'layout')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(doc.body.textContent).toContain(THANKS)
  })

  it('쿼리에 다른 d 가 함께 있어도 조각의 d 만 쓴다', () => {
    const other = '00000000-0000-4000-8000-000000000000'
    loadPage(`?d=${other}&v=0.2.0#d=${DEVICE_ID}`)
    expect(sentEvents().map((event) => event.device_id)).toEqual([DEVICE_ID])
  })

  it('제거 한 건이 세션으로 세어지지 않게 두 이벤트 모두 session_id 가 -1 이다', () => {
    const doc = loadPage(GOOD_SEARCH)
    clickReason(doc, 'other')
    expect(sentEvents().map((event) => event.session_id)).toEqual([-1, -1])
  })

  it('키가 빈 문자열이면 아무것도 보내지 않는다(계측 꺼짐)', () => {
    const doc = loadPage(GOOD_SEARCH, { apiKey: '' })
    clickReason(doc, 'layout')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

// 조각은 서버로 가지 않지만 주소창과 방문 기록에는 남는다. 읽은 직후 지운다.
describe('제거 페이지의 조각 지우기', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  it('로드 뒤 location.hash 가 비어 있고 주소에 기기 번호가 남지 않는다', () => {
    loadPage(GOOD_SEARCH)
    expect(lastWindow.location.hash).toBe('')
    expect(lastWindow.location.href).toBe(`${PAGE_URL}?v=0.2.0`)
    expect(lastWindow.location.href).not.toContain(DEVICE_ID)
  })

  it('조각을 지운 뒤에도 그 로드의 사유 이벤트는 같은 기기 번호로 나간다', () => {
    const doc = loadPage(GOOD_SEARCH)
    clickReason(doc, 'detection')
    expect(sentEvents().map((event) => event.device_id)).toEqual([DEVICE_ID, DEVICE_ID])
  })

  it('형식이 틀린 조각도 지운다', () => {
    loadPage('?v=0.2.0#d=not-a-uuid')
    expect(lastWindow.location.hash).toBe('')
  })

  it('키가 없어 계측이 꺼져 있어도 조각은 지운다', () => {
    loadPage(GOOD_SEARCH, { apiKey: '' })
    expect(lastWindow.location.hash).toBe('')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('방문 기록에 새 항목을 쌓지 않는다(replaceState)', () => {
    loadPage(GOOD_SEARCH)
    expect(lastWindow.history.length).toBe(1)
  })

  it('조각이 없으면 주소를 건드리지 않는다', () => {
    const replaceState = vi.fn()
    loadPage('?v=0.2.0', {}, { history: { replaceState } })
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('replaceState 가 던져도 삼키고 이벤트는 보낸다', () => {
    const history = {
      replaceState: () => {
        throw new Error('SecurityError')
      },
    }
    expect(() => loadPage(GOOD_SEARCH, {}, { history })).not.toThrow()
    expect(sentEvents().map((event) => event.event_type)).toEqual(['Extension Removed'])
  })

  it('history 가 없어도 던지지 않는다', () => {
    expect(() => loadPage(GOOD_SEARCH, {}, { history: undefined })).not.toThrow()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('제거 사유 버튼', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  it('버튼 네 개의 값과 문구가 정해진 대로다', () => {
    const doc = new JSDOM(PAGE_HTML).window.document
    const buttons = [...doc.querySelectorAll('[data-reason]')]
    expect(buttons.map((el) => el.dataset.reason)).toEqual(['detection', 'layout', 'rarely_used', 'other'])
    expect(buttons.map((el) => el.textContent.trim())).toEqual([
      '체험단 리뷰가 잘 안 걸러져요',
      '쇼핑몰 화면이 이상해져요',
      '쓸 일이 별로 없어요',
      '기타',
    ])
  })

  it('d 가 있으면 클릭 시 Removal Reason Selected 한 건과 감사 문구를 보인다', () => {
    const doc = loadPage(GOOD_SEARCH)
    globalThis.fetch.mockClear()
    clickReason(doc, 'layout')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [event] = sentEvents()
    expect(event.event_type).toBe('Removal Reason Selected')
    expect(event.device_id).toBe(DEVICE_ID)
    expect(event.event_properties).toEqual({ reason: 'layout', surface: 'site' })
    expect(event.insert_id).toBe(`reason:${DEVICE_ID}`)
    expect(doc.body.textContent).toContain(THANKS)
    expect(doc.getElementById('reasons').hidden).toBe(true)
  })

  it('두 번째 클릭은 추가로 보내지 않는다', () => {
    const doc = loadPage(GOOD_SEARCH)
    globalThis.fetch.mockClear()
    clickReason(doc, 'layout')
    clickReason(doc, 'other')
    clickReason(doc, 'layout')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('d 가 없으면 클릭해도 보내지 않지만 감사 문구는 보인다', () => {
    const doc = loadPage('?v=0.2.0')
    clickReason(doc, 'rarely_used')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(doc.body.textContent).toContain(THANKS)
  })

  it('정해진 값이 아닌 사유는 보내지 않는다', () => {
    const doc = loadPage(GOOD_SEARCH)
    globalThis.fetch.mockClear()
    const button = doc.querySelector('[data-reason="other"]')
    button.dataset.reason = 'free text'
    button.click()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
