import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { detectSort } from '../extension/src/content/sort.js'
import { ACTIVE_SORT_CLASS, INACTIVE_SORT_CLASS, sortButtonsHtml } from './helpers/sort-buttons.js'

function build(bestClass, latestClass) {
  return new JSDOM(`<body><div id="sdpReview">
    <button class="${bestClass}">베스트순</button>
    <button class="${latestClass}">최신순</button>
  </div></body>`).window.document
}

describe('detectSort', () => {
  it('실제 클래스에서 베스트순이 활성이면 best', () => {
    expect(detectSort(build(ACTIVE_SORT_CLASS, INACTIVE_SORT_CLASS))).toBe('best')
  })

  it('실제 클래스에서 최신순이 활성이면 latest', () => {
    expect(detectSort(build(INACTIVE_SORT_CLASS, ACTIVE_SORT_CLASS))).toBe('latest')
  })

  it('둘 다 비활성이면 unknown', () => {
    expect(detectSort(build(INACTIVE_SORT_CLASS, INACTIVE_SORT_CLASS))).toBe('unknown')
  })

  it('둘 다 활성으로 보이면 틀린 값을 기록하지 않고 unknown', () => {
    expect(detectSort(build(ACTIVE_SORT_CLASS, ACTIVE_SORT_CLASS))).toBe('unknown')
  })

  it('desktop-hover:twc-font-normal 만 있고 twc-font-normal 토큰은 없으면 활성으로 본다', () => {
    const variantOnly = 'twc-inline-flex desktop-hover:twc-font-normal twc-font-bold'
    expect(detectSort(build(INACTIVE_SORT_CLASS, variantOnly))).toBe('latest')
  })

  it('버튼이 없으면 unknown', () => {
    const doc = new JSDOM('<body><div id="sdpReview"></div></body>').window.document
    expect(detectSort(doc)).toBe('unknown')
  })

  it('컨테이너가 없으면 unknown', () => {
    const doc = new JSDOM('<body><div>리뷰 없음</div></body>').window.document
    expect(detectSort(doc)).toBe('unknown')
  })

  it('컨테이너 밖의 같은 이름 버튼은 무시한다', () => {
    const doc = new JSDOM(`<body>
      <button class="${ACTIVE_SORT_CLASS}">베스트순</button>
      <div id="sdpReview">${sortButtonsHtml('latest')}</div>
    </body>`).window.document
    expect(detectSort(doc)).toBe('latest')
  })
})
