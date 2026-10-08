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
    expect(el.textContent).toContain('지금까지 본 리뷰')
  })

  describe('범위 안내', () => {
    const HINT = '리뷰 페이지를 넘기면 숫자가 늘어납니다'
    const clean = {
      total: 100, sponsoredCount: 0, organicCount: 100, sponsoredRatio: 0,
      ratingOfficial: 4.5, ratingFiltered: 4.5, ratingDelta: 0,
    }
    const scopes = (el) => [...el.querySelectorAll('.crf-scope')].map((node) => node.textContent)

    it('체험단이 있으면 범위 줄에 본 리뷰 수와 안내를 이어 쓴다', () => {
      const el = createBanner(summary, { hidden: false, onToggle: () => {}, scopeHint: HINT })
      expect(scopes(el)).toEqual(['지금까지 본 리뷰 1,204개 기준입니다. 리뷰 페이지를 넘기면 숫자가 늘어납니다'])
    })

    it('안내가 없으면 범위 줄은 앞 문장만 쓴다', () => {
      for (const options of [{}, { scopeHint: undefined }, { scopeHint: null }, { scopeHint: '' }, { scopeHint: 7 }]) {
        const el = createBanner(summary, { hidden: false, onToggle: () => {}, ...options })
        expect(scopes(el)).toEqual(['지금까지 본 리뷰 1,204개 기준입니다'])
      }
    })

    it('체험단 0건이면 헤드라인 아래 범위 줄에 안내만 쓴다', () => {
      const el = createBanner(clean, { hidden: false, onToggle: () => {}, onDetail: () => {}, scopeHint: HINT })
      expect(el.querySelector('.crf-headline').textContent).toBe('지금까지 본 리뷰 100개 중 체험단 리뷰가 없습니다')
      expect(scopes(el)).toEqual([HINT])
      expect([...el.children].map((child) => child.className)).toEqual(['crf-headline', 'crf-scope', 'crf-detail'])
    })

    it('체험단 0건이고 안내가 없으면 범위 줄이 없다', () => {
      const el = createBanner(clean, { hidden: false, onToggle: () => {} })
      expect(el.querySelector('.crf-headline').textContent).toBe('지금까지 본 리뷰 100개 중 체험단 리뷰가 없습니다')
      expect(scopes(el)).toEqual([])
    })

    it('요약이 없는 배너에는 안내를 줘도 범위 줄이 없다', () => {
      const el = createBanner(null, { note: '체험단 후기만 모아 보는 중입니다', scopeHint: HINT })
      expect([...el.children].map((child) => child.className)).toEqual(['crf-note'])
    })

    it('banner_copy 의 두 변형은 범위 줄이 같다', () => {
      const scopeOf = (copyVariant) =>
        scopes(createBanner(summary, { hidden: false, copyVariant, onToggle: () => {}, scopeHint: HINT }))
      expect(scopeOf('ratio')).toEqual(scopeOf('rating'))
      expect(scopeOf('ratio')).toHaveLength(1)
    })
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
    expect(el.textContent).toContain('리뷰 평균')
    expect(el.textContent).not.toContain('현재 리뷰 평균')
    expect(el.textContent).not.toContain('쿠팡 평점')
  })

  describe('banner_copy 변형', () => {
    const lines = (el) => ({
      headline: el.querySelector('.crf-headline').textContent,
      sub: el.querySelector('.crf-sub').textContent,
    })

    it('rating 변형은 평점 변화를 헤드라인으로, 개수와 비중을 보조 줄로 쓴다', () => {
      const el = createBanner(summary, { hidden: false, copyVariant: 'rating', onToggle: () => {} })
      expect(lines(el)).toEqual({
        headline: '리뷰 평균 4.7 → 체험단 제외 4.1',
        sub: '리뷰 1,204개 중 체험단 341개 (28%)',
      })
    })

    it('ratio 변형은 비중을 헤드라인으로, 평점 변화를 보조 줄로 쓴다', () => {
      const el = createBanner(summary, { hidden: false, copyVariant: 'ratio', onToggle: () => {} })
      expect(lines(el)).toEqual({
        headline: '지금까지 본 리뷰의 28%가 체험단입니다',
        sub: '리뷰 평균 4.7 → 체험단 제외 4.1',
      })
    })

    it('체험단 제외 평점을 못 내면 rating 헤드라인에 계산 불가라고 쓴다', () => {
      const el = createBanner(
        { ...summary, ratingFiltered: null, ratingDelta: null },
        { hidden: false, copyVariant: 'rating', onToggle: () => {} },
      )
      expect(lines(el).headline).toBe('리뷰 평균 4.7 → 체험단 제외 계산 불가')
    })

    // 체험단 개수(341)는 정해진 ratio 문구에 없다. 총계(범위 줄)와 비중으로 같은 정보를 전한다.
    it('두 변형은 같은 숫자를 담고 강조만 다르다', () => {
      const text = (copyVariant) =>
        createBanner(summary, { hidden: false, copyVariant, onToggle: () => {} }).textContent
      for (const value of ['1,204', '28%', '4.7', '4.1']) {
        expect(text('rating')).toContain(value)
        expect(text('ratio')).toContain(value)
      }
    })
  })

  it('ratio 변형은 비중을 앞세운다', () => {
    const el = createBanner(summary, { hidden: false, copyVariant: 'ratio', onToggle: () => {} })
    expect(el.textContent).toContain('지금까지 본 리뷰의 28%가 체험단입니다')
  })

  it('변형을 안 주면 기본 문구를 쓴다', () => {
    const el = createBanner(summary, { hidden: false, onToggle: () => {} })
    expect(el.textContent).toContain('리뷰 1,204개 중 체험단 341개')
  })

  it('자세히 보기를 누르면 onDetail을 부른다', () => {
    const onDetail = vi.fn()
    const el = createBanner(summary, { hidden: false, onToggle: () => {}, onDetail })
    el.querySelector('.crf-detail').click()
    expect(onDetail).toHaveBeenCalledTimes(1)
  })

  it('onDetail이 없으면 자세히 보기 버튼을 만들지 않는다', () => {
    const el = createBanner(summary, { hidden: false, onToggle: () => {} })
    expect(el.querySelector('.crf-detail')).toBeNull()
  })

  describe('체험단 후기만 모아 보는 조건', () => {
    const NOTE = '체험단 후기만 모아 보는 중입니다'

    it('note 가 있으면 숨김 버튼 대신 그 글을 넣는다', () => {
      for (const note of [NOTE, '무신사 화면이 바뀌어 지금은 숨기기를 쓸 수 없습니다']) {
        const el = createBanner(summary, { hidden: true, note, onToggle: () => {} })
        expect(el.querySelector('.crf-toggle')).toBeNull()
        const notes = el.querySelectorAll('.crf-note')
        expect(notes).toHaveLength(1)
        expect(notes[0].tagName).toBe('P')
        expect(notes[0].textContent).toBe(note)
      }
    })

    it('note 가 있어도 나머지 줄은 같다', () => {
      const onDetail = vi.fn()
      const options = { hidden: false, onToggle: () => {}, onDetail }
      const plain = createBanner(summary, options)
      const el = createBanner(summary, { ...options, note: NOTE })

      for (const selector of ['.crf-headline', '.crf-sub', '.crf-scope', '.crf-detail']) {
        expect(el.querySelector(selector).textContent).toBe(plain.querySelector(selector).textContent)
      }
      expect([...el.children].map((child) => child.className)).toEqual([
        'crf-headline',
        'crf-sub',
        'crf-note',
        'crf-detail',
        'crf-scope',
      ])
      el.querySelector('.crf-detail').click()
      expect(onDetail).toHaveBeenCalledTimes(1)
    })

    it('note 가 없으면 숨김 버튼을 넣고 안내 글은 없다', () => {
      for (const options of [{}, { note: undefined }, { note: null }]) {
        const el = createBanner(summary, { hidden: false, onToggle: () => {}, ...options })
        expect(el.querySelector('.crf-toggle')).not.toBeNull()
        expect(el.querySelector('.crf-note')).toBeNull()
      }
    })

    // 누적에 체험단이 없는데 화면에는 체험단 후기만 보이는 경우다. 안내 글이 없으면 배너와 화면이 어긋나 보인다.
    it('체험단 0건 배너에도 note 가 있으면 안내 글을 더한다', () => {
      const clean = {
        total: 100, sponsoredCount: 0, organicCount: 100, sponsoredRatio: 0,
        ratingOfficial: 4.5, ratingFiltered: 4.5, ratingDelta: 0,
      }
      const options = { hidden: false, onToggle: () => {}, onDetail: () => {} }
      const plain = createBanner(clean, options)
      const el = createBanner(clean, { ...options, note: NOTE })
      expect(plain.querySelector('.crf-note')).toBeNull()
      expect([...el.children].map((child) => child.className)).toEqual([
        'crf-headline',
        'crf-note',
        'crf-detail',
      ])
      expect(el.querySelector('.crf-headline').textContent).toBe(
        plain.querySelector('.crf-headline').textContent,
      )
      expect(el.querySelector('.crf-note').textContent).toBe(NOTE)
    })

    it('요약이 없으면 안내 글 한 줄만 있는 배너를 만든다', () => {
      const el = createBanner(null, { note: NOTE, onToggle: () => {}, onDetail: () => {} })
      expect(el.getAttribute('data-crf-banner')).toBe('1')
      expect(el.className).toBe('crf-banner')
      expect([...el.children].map((child) => child.className)).toEqual(['crf-note'])
      expect(el.textContent).toBe(NOTE)
    })
  })

  describe('체험단 0건 요약', () => {
    const clean = {
      total: 100, sponsoredCount: 0, organicCount: 100, sponsoredRatio: 0,
      ratingOfficial: 4.5, ratingFiltered: 4.5, ratingDelta: 0,
    }

    it('onDetail이 있으면 자세히 보기 버튼을 만들고 누르면 onDetail을 부른다', () => {
      const onDetail = vi.fn()
      const el = createBanner(clean, { hidden: false, onToggle: () => {}, onDetail })
      const button = el.querySelector('.crf-detail')
      expect(button).not.toBeNull()
      expect(button.textContent).toBe('자세히 보기')
      button.click()
      expect(onDetail).toHaveBeenCalledTimes(1)
    })

    it('숨길 대상이 없으므로 토글은 만들지 않는다', () => {
      const el = createBanner(clean, { hidden: false, onToggle: () => {}, onDetail: () => {} })
      expect(el.querySelector('.crf-toggle')).toBeNull()
    })

    it('onDetail이 없으면 버튼을 만들지 않는다', () => {
      const el = createBanner(clean, { hidden: false, onToggle: () => {} })
      expect(el.querySelector('.crf-detail')).toBeNull()
    })
  })
})
