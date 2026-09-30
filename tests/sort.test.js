import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { detectSort } from '../extension/src/content/sort.js'

function build(bestClass, latestClass) {
  return new JSDOM(`<body><div id="sdpReview">
    <button class="${bestClass}">베스트순</button>
    <button class="${latestClass}">최신순</button>
  </div></body>`).window.document
}

describe('detectSort', () => {
  it('베스트순이 굵으면 best', () => {
    expect(detectSort(build('twc-font-bold twc-inline-flex', 'twc-font-normal twc-inline-flex'))).toBe('best')
  })

  it('최신순이 굵으면 latest', () => {
    expect(detectSort(build('twc-font-normal twc-inline-flex', 'twc-font-bold twc-inline-flex'))).toBe('latest')
  })

  it('둘 다 굵지 않으면 unknown', () => {
    expect(detectSort(build('twc-font-normal', 'twc-font-normal'))).toBe('unknown')
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
      <button class="twc-font-bold">베스트순</button>
      <div id="sdpReview">
        <button class="twc-font-normal">베스트순</button>
        <button class="twc-font-bold">최신순</button>
      </div>
    </body>`).window.document
    expect(detectSort(doc)).toBe('latest')
  })
})
