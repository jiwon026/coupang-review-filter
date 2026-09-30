import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderPanel } from '../extension/src/sidepanel/view.js'

const summary = {
  total: 40,
  sponsoredCount: 18,
  organicCount: 22,
  sponsoredRatio: 0.45,
  ratingOfficial: 4.6,
  ratingFiltered: 4.2,
  ratingDelta: -0.4,
}

describe('renderPanel', () => {
  let root

  beforeEach(() => {
    const dom = new JSDOM('<body><main id="root"></main></body>')
    globalThis.document = dom.window.document
    root = dom.window.document.getElementById('root')
  })

  it('체험단 제외 평점과 리뷰 평균을 모두 보여준다', () => {
    renderPanel(root, summary)
    expect(root.textContent).toContain('4.2')
    expect(root.textContent).toContain('4.6')
  })

  it('평점 라벨이 계산 범위를 정확히 말한다', () => {
    renderPanel(root, summary)
    expect(root.textContent).toContain('리뷰 평균')
    expect(root.textContent).not.toContain('쿠팡 표시 평점')
    expect(root.textContent).not.toContain('쿠팡 평점')
  })

  it('체험단 비중과 개수를 보여준다', () => {
    renderPanel(root, summary)
    expect(root.textContent).toContain('45%')
    expect(root.textContent).toContain('40')
    expect(root.textContent).toContain('18')
  })

  it('비중 막대 폭이 비중과 같다', () => {
    renderPanel(root, summary)
    expect(root.querySelector('.bar-fill').style.width).toBe('45%')
  })

  it('누적 범위를 밝힌다', () => {
    renderPanel(root, summary)
    expect(root.textContent).toContain('지금까지 확인한 리뷰 40개 기준입니다')
  })

  it('요약이 없으면 안내 문구를 보여준다', () => {
    renderPanel(root, null)
    expect(root.textContent).toContain('리뷰 영역까지 스크롤')
    expect(root.querySelector('.bar-fill')).toBeNull()
  })

  it('체험단 제외 평점을 못 내면 계산 불가라고 쓴다', () => {
    renderPanel(root, { ...summary, organicCount: 0, ratingFiltered: null, ratingDelta: null })
    expect(root.textContent).toContain('계산 불가')
  })

  it('다시 그리면 이전 내용을 지운다', () => {
    renderPanel(root, summary)
    renderPanel(root, { ...summary, total: 50 })
    expect(root.querySelectorAll('h1')).toHaveLength(1)
    expect(root.textContent).toContain('50')
  })

  it('innerHTML을 쓰지 않는다', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../extension/src/sidepanel/view.js', import.meta.url), 'utf8')
    expect(source).not.toMatch(/innerHTML/)
  })
})
