import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { createBanner } from '../extension/src/content/banner.js'

const summary = {
  total: 1204,
  sponsoredCount: 341,
  organicCount: 863,
  sponsoredRatio: 0.283,
  ratingOfficial: 4.7,
  ratingFiltered: 4.1,
  ratingDelta: -0.6,
}

describe('createBanner', () => {
  beforeEach(() => {
    const dom = new JSDOM('<body></body>')
    globalThis.document = dom.window.document
  })

  it('리뷰 수와 체험단 수를 표시한다', () => {
    const el = createBanner(summary, { hidden: false, onToggle: () => {} })
    expect(el.textContent).toContain('1,204')
    expect(el.textContent).toContain('341')
    expect(el.textContent).toContain('28%')
  })

  it('두 평점을 모두 표시한다', () => {
    const el = createBanner(summary, { hidden: false, onToggle: () => {} })
    expect(el.textContent).toContain('4.7')
    expect(el.textContent).toContain('4.1')
  })

  it('계산 범위를 명시한다', () => {
    const el = createBanner(summary, { hidden: false, onToggle: () => {} })
    expect(el.textContent).toContain('지금까지 확인한 리뷰')
  })

  it('토글을 누르면 콜백에 반대 상태를 넘긴다', () => {
    const onToggle = vi.fn()
    const el = createBanner(summary, { hidden: false, onToggle })
    el.querySelector('.crf-toggle').click()
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('체험단이 없으면 안내 문구를 보여준다', () => {
    const clean = {
      total: 100, sponsoredCount: 0, organicCount: 100, sponsoredRatio: 0,
      ratingOfficial: 4.5, ratingFiltered: 4.5, ratingDelta: 0,
    }
    const el = createBanner(clean, { hidden: false, onToggle: () => {} })
    expect(el.textContent).toContain('체험단 리뷰가 없습니다')
  })

  it('중복 삽입 방지 속성을 가진다', () => {
    const el = createBanner(summary, { hidden: false, onToggle: () => {} })
    expect(el.getAttribute('data-crf-banner')).toBe('1')
  })

  it('평점 라벨이 계산 범위를 정확히 말한다', () => {
    const el = createBanner(summary, { hidden: false, onToggle: () => {} })
    expect(el.textContent).toContain('현재 리뷰 평균')
    expect(el.textContent).not.toContain('쿠팡 평점')
  })
})
