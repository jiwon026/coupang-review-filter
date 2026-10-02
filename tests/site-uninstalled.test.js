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

describe('parseUninstallParams', () => {
  it('정상 값을 읽는다', () => {
    const installedAt = NOW - 3 * DAY
    const params = parseUninstallParams(`?d=${DEVICE_ID}&v=0.2.0&i=${installedAt}`, NOW)
    expect(params).toEqual({ deviceId: DEVICE_ID, version: '0.2.0', installedAt })
  })

  it('d 가 UUID 가 아니면 deviceId 는 null 이다', () => {
    expect(parseUninstallParams('?d=not-a-uuid&v=0.2.0', NOW).deviceId).toBeNull()
    expect(parseUninstallParams(`?d=${DEVICE_ID}x`, NOW).deviceId).toBeNull()
    expect(parseUninstallParams('?d=', NOW).deviceId).toBeNull()
  })

  it('i 가 미래이면 installedAt 은 null 이다', () => {
    expect(parseUninstallParams(`?i=${NOW + DAY}`, NOW).installedAt).toBeNull()
  })

  it('i 가 숫자가 아니거나 양의 정수가 아니면 null 이다', () => {
    for (const bad of ['abc', '1.5', '-5', '0', '1e3', '']) {
      expect(parseUninstallParams(`?i=${bad}`, NOW).installedAt).toBeNull()
    }
  })

  it('v 의 형식이 틀리면 version 은 null 이다', () => {
    expect(parseUninstallParams('?v=latest', NOW).version).toBeNull()
    expect(parseUninstallParams('?v=1.2', NOW).version).toBeNull()
    expect(parseUninstallParams('?v=1.2.3-beta', NOW).version).toBeNull()
  })

  it('쿼리가 없으면 모두 null 이다', () => {
    expect(parseUninstallParams('', NOW)).toEqual({ deviceId: null, version: null, installedAt: null })
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

function loadPage(search, configOverrides = {}) {
  const dom = new JSDOM(PAGE_HTML)
  initUninstalledPage({
    document: dom.window.document,
    search,
    config: { apiKey: 'test-key', endpoint: ENDPOINT, ...configOverrides },
    now: NOW,
  })
  return dom.window.document
}

function sentEvents() {
  return globalThis.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).events[0])
}

function clickReason(doc, reason) {
  doc.querySelector(`[data-reason="${reason}"]`).click()
}

const GOOD_SEARCH = `?d=${DEVICE_ID}&v=0.2.0&i=${NOW - 3.6 * DAY}`

describe('제거 페이지 전송', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  it('d 가 있으면 Extension Removed 를 한 번 보낸다', () => {
    loadPage(GOOD_SEARCH)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [event] = sentEvents()
    expect(event.event_type).toBe('Extension Removed')
    expect(event.device_id).toBe(DEVICE_ID)
    expect(event.app_version).toBe('0.2.0')
    expect(event.session_id).toBe(NOW)
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
    loadPage(`?d=${DEVICE_ID}&v=0.2.0`)
    expect(sentEvents()[0].event_properties).toEqual({ surface: 'site' })
  })

  it('d 가 없으면 아무것도 보내지 않는다', () => {
    loadPage('?v=0.2.0')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('d 의 형식이 틀리면 아무것도 보내지 않는다', () => {
    loadPage('?d=not-a-uuid&v=0.2.0')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('키가 빈 문자열이면 아무것도 보내지 않는다(계측 꺼짐)', () => {
    const doc = loadPage(GOOD_SEARCH, { apiKey: '' })
    clickReason(doc, 'layout')
    expect(globalThis.fetch).not.toHaveBeenCalled()
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
      '쿠팡 화면이 이상해져요',
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
