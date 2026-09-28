# 확장 코어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 쿠팡 상품 페이지에서 체험단 제공 리뷰를 판별해 숨기고, 협찬을 제외한 평점을 배너로 보여주는 크롬 확장을 동작하는 상태로 만든다.

**Architecture:** 매니페스트 V3 확장. 순수 로직(판별, 집계)을 `core/`에 분리해 단위 테스트하고, DOM을 다루는 코드는 `content/`에 두어 실제 쿠팡 HTML 픽스처로 검증한다. 프레임워크 없이 esbuild로만 번들한다.

**Tech Stack:** JavaScript (ES 모듈), esbuild, Vitest, jsdom, Manifest V3

**Spec:** `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md`

## Global Constraints

- 대상 플랫폼은 쿠팡 단일. 매치 패턴은 `https://www.coupang.com/vp/products/*`로 한정한다
- 체험단 판별 문구는 `쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.` 이며, 코드에 직접 쓰지 않고 `core/sponsored.js`의 `SPONSORED_MARKERS` 상수에만 둔다
- 리뷰에 붙이는 표기는 판정이 아니라 근거 제시다. 문구는 `체험단 제공 리뷰` 로 고정하며 "가짜", "조작" 같은 단어를 쓰지 않는다
- 리뷰 원문을 어떤 형태로도 서버로 보내거나 저장하지 않는다. 이 계획 범위에는 네트워크 요청이 전혀 없다
- 평점 재계산은 페이지에 로드된 리뷰만 대상으로 하며, 화면에 계산 범위를 명시한다
- 사용자에게 보이는 모든 문구는 한국어로 쓰고 엠대시(—)와 가운데 점(·)을 쓰지 않는다
- 쿠팡 DOM 셀렉터는 `content/selectors.js` 한 파일에만 둔다. 다른 파일에서 하드코딩하지 않는다

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json` | 의존성과 스크립트 |
| `build.js` | esbuild 번들 설정 |
| `extension/manifest.json` | 확장 선언 |
| `extension/src/core/sponsored.js` | 체험단 판별. 순수 함수 |
| `extension/src/core/rating.js` | 평점 집계와 재계산. 순수 함수 |
| `extension/src/content/selectors.js` | 쿠팡 DOM 셀렉터 상수 |
| `extension/src/content/parser.js` | 리뷰 DOM을 데이터 배열로 변환 |
| `extension/src/content/banner.js` | 배너 엘리먼트 생성 |
| `extension/src/content/filter.js` | 리뷰 숨김과 배지 삽입 |
| `extension/src/content/index.js` | 진입점. 파싱, 집계, 렌더, 토글 배선 |
| `extension/src/content/content.css` | 배너와 배지 스타일 |
| `tests/fixtures/review-section.html` | 실제 쿠팡 리뷰 영역 HTML |
| `tests/*.test.js` | 단위 테스트 |

`core/`는 DOM을 모른다. `content/`는 `core/`를 소비한다. 이 방향이 뒤집히면 안 된다.

---

## Task 1: 프로젝트 뼈대와 확장 로드

**Files:**
- Create: `package.json`
- Create: `build.js`
- Create: `extension/manifest.json`
- Create: `extension/src/content/index.js`
- Create: `extension/src/content/content.css`
- Create: `.gitignore` 수정 없음 (이미 `dist/` 포함)

**Interfaces:**
- Consumes: 없음
- Produces: `npm run build` 가 `extension/dist/content.js` 를 생성한다. `npm test` 가 Vitest를 실행한다

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "coupang-review-filter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.js",
    "watch": "node build.js --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "jsdom": "^25.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`
Expected: `node_modules/` 생성, 오류 없음

- [ ] **Step 3: build.js 작성**

```js
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const options = {
  entryPoints: {
    content: 'extension/src/content/index.js',
  },
  bundle: true,
  format: 'iife',
  outdir: 'extension/dist',
  target: 'chrome120',
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('watching...')
} else {
  await esbuild.build(options)
}
```

- [ ] **Step 4: manifest.json 작성**

`storage` 와 `sidePanel` 권한을 지금 넣는다. 나중에 권한을 추가하면 웹스토어 재심사가 걸리기 때문이다.

```json
{
  "manifest_version": 3,
  "name": "쿠팡 체험단 리뷰 필터",
  "version": "0.1.0",
  "description": "쿠팡 리뷰에서 체험단 제공 리뷰를 걸러내고 협찬을 제외한 평점을 보여줍니다.",
  "permissions": ["storage", "sidePanel"],
  "content_scripts": [
    {
      "matches": ["https://www.coupang.com/vp/products/*"],
      "js": ["dist/content.js"],
      "css": ["src/content/content.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "체험단 리뷰 필터"
  }
}
```

- [ ] **Step 5: 최소 진입점과 스타일 작성**

`extension/src/content/index.js`:

```js
console.log('[체험단 필터] 콘텐츠 스크립트 로드됨')
```

`extension/src/content/content.css`:

```css
.crf-banner {
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  padding: 12px 14px;
  margin: 12px 0;
  font-family: inherit;
}
```

- [ ] **Step 6: 빌드 실행**

Run: `npm run build`
Expected: `extension/dist/content.js` 생성, 오류 없음

- [ ] **Step 7: 크롬에 로드하고 동작 확인**

1. 크롬에서 `chrome://extensions` 열기
2. 우측 상단 개발자 모드 켜기
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `extension/` 폴더 선택 (`extension/dist` 아님)
5. 쿠팡 상품 페이지를 열고 개발자도구 콘솔 확인

Expected: 콘솔에 `[체험단 필터] 콘텐츠 스크립트 로드됨` 출력

- [ ] **Step 8: 커밋**

```bash
git add package.json package-lock.json build.js extension/
git commit -m "feat: 확장 뼈대와 esbuild 빌드 구성"
```

---

## Task 2: 체험단 판별 로직

**Files:**
- Create: `extension/src/core/sponsored.js`
- Test: `tests/sponsored.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `SPONSORED_MARKERS: string[]` 판별 문구 목록
  - `isSponsored(text: string): boolean` 리뷰 본문이 체험단 표기를 포함하는지 판정

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/sponsored.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { isSponsored } from '../extension/src/core/sponsored.js'

const MARKER = '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.'

describe('isSponsored', () => {
  it('판별 문구가 있으면 true', () => {
    expect(isSponsored(`정말 좋아요 추천합니다\n${MARKER}`)).toBe(true)
  })

  it('판별 문구가 없으면 false', () => {
    expect(isSponsored('3주 썼는데 유분은 잡히는데 겨울엔 건조해요')).toBe(false)
  })

  it('줄바꿈과 공백이 섞여도 잡는다', () => {
    const messy = '좋아요\n\n쿠팡체험단  이벤트로 상품을\n무료로 제공 받아 작성한 구매 후기입니다.'
    expect(isSponsored(messy)).toBe(true)
  })

  it('빈 문자열은 false', () => {
    expect(isSponsored('')).toBe(false)
  })

  it('문자열이 아니면 false', () => {
    expect(isSponsored(null)).toBe(false)
    expect(isSponsored(undefined)).toBe(false)
    expect(isSponsored(123)).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/sponsored.test.js`
Expected: FAIL. `Failed to resolve import` 또는 `isSponsored is not a function`

- [ ] **Step 3: 구현 작성**

`extension/src/core/sponsored.js`:

```js
export const SPONSORED_MARKERS = [
  '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.',
]

export const SPONSORED_LABEL = '체험단 제공 리뷰'

function squash(value) {
  return value.replace(/\s+/g, '')
}

export function isSponsored(text) {
  if (typeof text !== 'string' || text.length === 0) return false
  const target = squash(text)
  return SPONSORED_MARKERS.some((marker) => target.includes(squash(marker)))
}
```

공백을 모두 제거하고 비교하는 이유는 쿠팡이 문구를 줄바꿈으로 쪼개 렌더링하는 경우가 있기 때문이다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/sponsored.test.js`
Expected: PASS, 5개 통과

- [ ] **Step 5: 커밋**

```bash
git add extension/src/core/sponsored.js tests/sponsored.test.js
git commit -m "feat: 체험단 리뷰 판별 로직"
```

---

## Task 3: 평점 집계와 재계산

**Files:**
- Create: `extension/src/core/rating.js`
- Test: `tests/rating.test.js`

**Interfaces:**
- Consumes: `isSponsored` from `core/sponsored.js`
- Produces:
  - `summarize(reviews: {rating: number, text: string}[]): Summary`
  - `Summary = { total, sponsoredCount, organicCount, sponsoredRatio, ratingOfficial, ratingFiltered, ratingDelta }`
  - `ratingOfficial`, `ratingFiltered`, `ratingDelta` 는 소수점 한 자리로 반올림하며, 계산 불가 시 `null`
  - `sponsoredRatio` 는 0과 1 사이 소수 세 자리

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/rating.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { summarize } from '../extension/src/core/rating.js'

const MARKER = '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.'

const sponsored = (rating) => ({ rating, text: `좋아요\n${MARKER}` })
const organic = (rating) => ({ rating, text: '직접 사서 써 봤습니다' })

describe('summarize', () => {
  it('체험단을 제외한 평점을 계산한다', () => {
    const result = summarize([
      sponsored(5), sponsored(5),
      organic(4), organic(3),
    ])
    expect(result.total).toBe(4)
    expect(result.sponsoredCount).toBe(2)
    expect(result.organicCount).toBe(2)
    expect(result.sponsoredRatio).toBe(0.5)
    expect(result.ratingOfficial).toBe(4.3)
    expect(result.ratingFiltered).toBe(3.5)
    expect(result.ratingDelta).toBe(-0.8)
  })

  it('체험단이 없으면 두 평점이 같고 차이는 0', () => {
    const result = summarize([organic(5), organic(4)])
    expect(result.sponsoredCount).toBe(0)
    expect(result.sponsoredRatio).toBe(0)
    expect(result.ratingOfficial).toBe(4.5)
    expect(result.ratingFiltered).toBe(4.5)
    expect(result.ratingDelta).toBe(0)
  })

  it('전부 체험단이면 제외 평점이 null', () => {
    const result = summarize([sponsored(5), sponsored(5)])
    expect(result.organicCount).toBe(0)
    expect(result.ratingOfficial).toBe(5)
    expect(result.ratingFiltered).toBeNull()
    expect(result.ratingDelta).toBeNull()
  })

  it('빈 배열을 안전하게 처리한다', () => {
    const result = summarize([])
    expect(result.total).toBe(0)
    expect(result.sponsoredRatio).toBe(0)
    expect(result.ratingOfficial).toBeNull()
    expect(result.ratingFiltered).toBeNull()
    expect(result.ratingDelta).toBeNull()
  })

  it('배열이 아니면 빈 집계를 반환한다', () => {
    expect(summarize(null).total).toBe(0)
    expect(summarize(undefined).total).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/rating.test.js`
Expected: FAIL. `Failed to resolve import`

- [ ] **Step 3: 구현 작성**

`extension/src/core/rating.js`:

```js
import { isSponsored } from './sponsored.js'

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function average(list) {
  if (list.length === 0) return null
  const sum = list.reduce((acc, item) => acc + item.rating, 0)
  return round(sum / list.length, 1)
}

export function summarize(reviews) {
  const list = Array.isArray(reviews) ? reviews : []
  const sponsoredList = list.filter((review) => isSponsored(review.text))
  const organicList = list.filter((review) => !isSponsored(review.text))

  const ratingOfficial = average(list)
  const ratingFiltered = average(organicList)
  const ratingDelta =
    ratingOfficial === null || ratingFiltered === null
      ? null
      : round(ratingFiltered - ratingOfficial, 1)

  return {
    total: list.length,
    sponsoredCount: sponsoredList.length,
    organicCount: organicList.length,
    sponsoredRatio: list.length === 0 ? 0 : round(sponsoredList.length / list.length, 3),
    ratingOfficial,
    ratingFiltered,
    ratingDelta,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/rating.test.js`
Expected: PASS, 5개 통과

- [ ] **Step 5: 커밋**

```bash
git add extension/src/core/rating.js tests/rating.test.js
git commit -m "feat: 협찬 제외 평점 집계"
```

---

## Task 4: 쿠팡 리뷰 DOM 파서

이 태스크는 실제 쿠팡 HTML이 있어야 진행할 수 있다. 픽스처 확보가 첫 단계다.

**Files:**
- Create: `tests/fixtures/review-section.html`
- Create: `extension/src/content/selectors.js`
- Create: `extension/src/content/parser.js`
- Test: `tests/parser.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `SELECTORS: { reviewItem, reviewRating, reviewText }`
  - `parseReviews(root: Document | Element): ParsedReview[]`
  - `ParsedReview = { id: string, rating: number, text: string, element: Element }`
  - `findReviewContainer(root): Element | null` 배너를 삽입할 기준 엘리먼트

- [ ] **Step 1: 실제 쿠팡 리뷰 HTML을 픽스처로 저장**

1. 쿠팡에서 리뷰가 많은 상품 페이지를 연다. 체험단 리뷰가 섞여 있는 상품을 고른다
2. 리뷰 목록이 보일 때까지 스크롤한다
3. 개발자도구를 열고 리뷰 하나를 우클릭해 검사한다
4. 리뷰 목록 전체를 감싸는 부모 엘리먼트까지 올라간다
5. 그 엘리먼트를 우클릭하고 Copy → Copy outerHTML
6. `tests/fixtures/review-section.html` 에 붙여넣어 저장한다

체험단 리뷰와 일반 리뷰가 최소 한 개씩 들어 있어야 한다. 없으면 다른 상품으로 다시 뜬다.

- [ ] **Step 2: 픽스처에서 셀렉터 네 개를 도출**

개발자도구 콘솔에서 후보를 확인한다. 리뷰 하나를 검사한 뒤 클래스 이름을 보고 아래를 실행해 개수가 맞는지 확인한다.

```js
document.querySelectorAll('후보-셀렉터').length
```

확인할 것은 넷이다.

| 이름 | 확인 방법 |
|---|---|
| `reviewItem` | 개수가 화면의 리뷰 개수와 같아야 한다 |
| `reviewRating` | 리뷰 하나 안에서 별점을 담은 엘리먼트. 숫자를 어디서 읽는지도 같이 본다 (`data-rating` 속성, `aria-label`, 또는 클래스 이름) |
| `reviewText` | 리뷰 본문 텍스트 엘리먼트 |
| `reviewContainer` | 리뷰 목록 전체를 감싸는 엘리먼트. 배너를 이 위에 삽입한다 |

별점을 읽는 방식이 속성인지 클래스인지에 따라 Step 5의 `extractRating` 구현이 달라진다. 확인한 내용을 이 단계에서 메모해 둔다.

- [ ] **Step 3: selectors.js에 기록**

`extension/src/content/selectors.js`. 아래 값은 Step 2에서 확인한 실제 값으로 채운다. 예시는 형태만 보여 준다.

```js
export const SELECTORS = {
  reviewContainer: 'Step 2에서 확인한 값',
  reviewItem: 'Step 2에서 확인한 값',
  reviewRating: 'Step 2에서 확인한 값',
  reviewText: 'Step 2에서 확인한 값',
}

export const RATING_SOURCE = 'attribute'
export const RATING_ATTRIBUTE = 'data-rating'
```

별점을 클래스 이름에서 읽어야 하면 `RATING_SOURCE` 를 `'class'` 로 두고 `RATING_CLASS_PREFIX` 상수를 추가한다.

- [ ] **Step 4: 실패하는 테스트 작성**

`tests/parser.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { parseReviews, findReviewContainer } from '../extension/src/content/parser.js'

const html = readFileSync(new URL('./fixtures/review-section.html', import.meta.url), 'utf8')

describe('parseReviews', () => {
  let doc

  beforeEach(() => {
    doc = new JSDOM(`<body>${html}</body>`).window.document
  })

  it('리뷰를 하나 이상 파싱한다', () => {
    const reviews = parseReviews(doc)
    expect(reviews.length).toBeGreaterThan(0)
  })

  it('각 리뷰가 별점과 본문을 가진다', () => {
    const reviews = parseReviews(doc)
    for (const review of reviews) {
      expect(typeof review.rating).toBe('number')
      expect(review.rating).toBeGreaterThanOrEqual(1)
      expect(review.rating).toBeLessThanOrEqual(5)
      expect(typeof review.text).toBe('string')
      expect(review.element).toBeTruthy()
    }
  })

  it('리뷰마다 고유한 id를 부여한다', () => {
    const reviews = parseReviews(doc)
    const ids = new Set(reviews.map((r) => r.id))
    expect(ids.size).toBe(reviews.length)
  })

  it('배너를 삽입할 컨테이너를 찾는다', () => {
    expect(findReviewContainer(doc)).toBeTruthy()
  })

  it('리뷰가 없는 문서에서는 빈 배열을 반환한다', () => {
    const empty = new JSDOM('<body><div>리뷰 없음</div></body>').window.document
    expect(parseReviews(empty)).toEqual([])
    expect(findReviewContainer(empty)).toBeNull()
  })
})
```

- [ ] **Step 5: 파서 구현**

`extension/src/content/parser.js`. `extractRating` 은 Step 2에서 확인한 방식에 맞춰 둘 중 하나를 남기고 나머지를 지운다.

```js
import { SELECTORS, RATING_SOURCE, RATING_ATTRIBUTE } from './selectors.js'

function extractRating(item) {
  const node = item.querySelector(SELECTORS.reviewRating)
  if (!node) return null

  if (RATING_SOURCE === 'attribute') {
    const raw = node.getAttribute(RATING_ATTRIBUTE)
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : null
  }

  const label = node.getAttribute('aria-label') || node.textContent || ''
  const matched = label.match(/([1-5])/)
  return matched ? Number.parseInt(matched[1], 10) : null
}

function extractText(item) {
  const node = item.querySelector(SELECTORS.reviewText)
  return node ? node.textContent.trim() : ''
}

export function findReviewContainer(root) {
  return root.querySelector(SELECTORS.reviewContainer)
}

export function parseReviews(root) {
  const items = root.querySelectorAll(SELECTORS.reviewItem)
  const reviews = []

  items.forEach((item, index) => {
    const rating = extractRating(item)
    if (rating === null) return
    reviews.push({
      id: `crf-${index}`,
      rating,
      text: extractText(item),
      element: item,
    })
  })

  return reviews
}
```

별점을 못 읽는 리뷰는 건너뛴다. 잘못된 값으로 평균을 오염시키는 것보다 낫다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run tests/parser.test.js`
Expected: PASS, 5개 통과

실패하면 셀렉터가 틀린 것이다. Step 2로 돌아가 다시 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add tests/fixtures/review-section.html extension/src/content/selectors.js extension/src/content/parser.js tests/parser.test.js
git commit -m "feat: 쿠팡 리뷰 DOM 파서"
```

---

## Task 5: 배너 렌더링

**Files:**
- Create: `extension/src/content/banner.js`
- Modify: `extension/src/content/content.css`
- Test: `tests/banner.test.js`

**Interfaces:**
- Consumes: `Summary` from `core/rating.js`
- Produces:
  - `createBanner(summary: Summary, options: { hidden: boolean, onToggle: (next: boolean) => void }): HTMLElement`
  - 반환 엘리먼트는 `class="crf-banner"` 를 가지며 `data-crf-banner="1"` 속성으로 중복 삽입을 막는다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/banner.test.js`:

```js
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
    expect(el.textContent).toContain('현재 로드된 리뷰')
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
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/banner.test.js`
Expected: FAIL. `Failed to resolve import`

- [ ] **Step 3: 구현 작성**

`extension/src/content/banner.js`:

```js
function formatCount(value) {
  return value.toLocaleString('ko-KR')
}

function formatPercent(ratio) {
  return `${Math.round(ratio * 100)}%`
}

export function createBanner(summary, options) {
  const root = document.createElement('div')
  root.className = 'crf-banner'
  root.setAttribute('data-crf-banner', '1')

  if (summary.sponsoredCount === 0) {
    const clean = document.createElement('p')
    clean.className = 'crf-headline'
    clean.textContent = `현재 로드된 리뷰 ${formatCount(summary.total)}개 중 체험단 리뷰가 없습니다`
    root.appendChild(clean)
    return root
  }

  const headline = document.createElement('p')
  headline.className = 'crf-headline'
  headline.textContent =
    `리뷰 ${formatCount(summary.total)}개 중 체험단 ${formatCount(summary.sponsoredCount)}개 ` +
    `(${formatPercent(summary.sponsoredRatio)})`
  root.appendChild(headline)

  const ratings = document.createElement('p')
  ratings.className = 'crf-ratings'
  ratings.textContent =
    `쿠팡 평점 ${summary.ratingOfficial} → 체험단 제외 ` +
    `${summary.ratingFiltered === null ? '계산 불가' : summary.ratingFiltered}`
  root.appendChild(ratings)

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'crf-toggle'
  toggle.setAttribute('aria-pressed', String(options.hidden))
  toggle.textContent = options.hidden ? '체험단 리뷰 다시 보기' : '체험단 리뷰 숨기기'
  toggle.addEventListener('click', () => options.onToggle(!options.hidden))
  root.appendChild(toggle)

  const scope = document.createElement('p')
  scope.className = 'crf-scope'
  scope.textContent = `현재 로드된 리뷰 ${formatCount(summary.total)}개 기준입니다`
  root.appendChild(scope)

  return root
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/banner.test.js`
Expected: PASS, 6개 통과

- [ ] **Step 5: 스타일 보강**

`extension/src/content/content.css` 전체를 아래로 교체한다.

```css
.crf-banner {
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  padding: 14px 16px;
  margin: 16px 0;
  background: #fafafa;
  font-family: inherit;
  line-height: 1.6;
}

.crf-headline {
  margin: 0 0 6px;
  font-size: 13px;
  color: #555;
}

.crf-ratings {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 600;
  color: #111;
}

.crf-toggle {
  border: 1px solid #b0b0b0;
  border-radius: 6px;
  background: #fff;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}

.crf-toggle:hover {
  background: #f0f0f0;
}

.crf-scope {
  margin: 10px 0 0;
  font-size: 12px;
  color: #888;
}

.crf-hidden {
  display: none !important;
}

.crf-badge {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fff3e0;
  color: #8a5300;
  font-size: 12px;
}
```

- [ ] **Step 6: 커밋**

```bash
git add extension/src/content/banner.js extension/src/content/content.css tests/banner.test.js
git commit -m "feat: 체험단 요약 배너"
```

---

## Task 6: 리뷰 필터 적용

**Files:**
- Create: `extension/src/content/filter.js`
- Test: `tests/filter.test.js`

**Interfaces:**
- Consumes: `ParsedReview` from `content/parser.js`, `isSponsored`, `SPONSORED_LABEL` from `core/sponsored.js`
- Produces:
  - `markSponsored(reviews: ParsedReview[]): void` 체험단 리뷰에 배지를 한 번만 삽입
  - `applyFilter(reviews: ParsedReview[], hidden: boolean): void` 체험단 리뷰의 표시 여부 전환

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/filter.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { markSponsored, applyFilter } from '../extension/src/content/filter.js'

const MARKER = '쿠팡체험단 이벤트로 상품을 무료로 제공 받아 작성한 구매 후기입니다.'

function buildReviews(doc) {
  const make = (text) => {
    const el = doc.createElement('div')
    doc.body.appendChild(el)
    return el
  }
  return [
    { id: 'a', rating: 5, text: `좋아요\n${MARKER}`, element: make() },
    { id: 'b', rating: 4, text: '직접 사서 써 봤습니다', element: make() },
  ]
}

describe('filter', () => {
  let doc
  let reviews

  beforeEach(() => {
    doc = new JSDOM('<body></body>').window.document
    globalThis.document = doc
    reviews = buildReviews(doc)
  })

  it('체험단 리뷰에만 배지를 넣는다', () => {
    markSponsored(reviews)
    expect(reviews[0].element.querySelector('.crf-badge')).toBeTruthy()
    expect(reviews[1].element.querySelector('.crf-badge')).toBeNull()
  })

  it('배지 문구는 근거 제시형이다', () => {
    markSponsored(reviews)
    expect(reviews[0].element.querySelector('.crf-badge').textContent).toBe('체험단 제공 리뷰')
  })

  it('여러 번 호출해도 배지가 하나만 생긴다', () => {
    markSponsored(reviews)
    markSponsored(reviews)
    expect(reviews[0].element.querySelectorAll('.crf-badge').length).toBe(1)
  })

  it('숨기면 체험단 리뷰만 crf-hidden을 가진다', () => {
    applyFilter(reviews, true)
    expect(reviews[0].element.classList.contains('crf-hidden')).toBe(true)
    expect(reviews[1].element.classList.contains('crf-hidden')).toBe(false)
  })

  it('다시 보이면 crf-hidden이 사라진다', () => {
    applyFilter(reviews, true)
    applyFilter(reviews, false)
    expect(reviews[0].element.classList.contains('crf-hidden')).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/filter.test.js`
Expected: FAIL. `Failed to resolve import`

- [ ] **Step 3: 구현 작성**

`extension/src/content/filter.js`:

```js
import { isSponsored, SPONSORED_LABEL } from '../core/sponsored.js'

const BADGE_CLASS = 'crf-badge'
const HIDDEN_CLASS = 'crf-hidden'

export function markSponsored(reviews) {
  for (const review of reviews) {
    if (!isSponsored(review.text)) continue
    if (review.element.querySelector(`.${BADGE_CLASS}`)) continue

    const badge = document.createElement('span')
    badge.className = BADGE_CLASS
    badge.textContent = SPONSORED_LABEL
    review.element.appendChild(badge)
  }
}

export function applyFilter(reviews, hidden) {
  for (const review of reviews) {
    if (!isSponsored(review.text)) continue
    review.element.classList.toggle(HIDDEN_CLASS, hidden)
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/filter.test.js`
Expected: PASS, 5개 통과

- [ ] **Step 5: 커밋**

```bash
git add extension/src/content/filter.js tests/filter.test.js
git commit -m "feat: 체험단 리뷰 배지와 숨김 처리"
```

---

## Task 7: 통합과 실제 페이지 검증

**Files:**
- Modify: `extension/src/content/index.js` (Task 1의 콘솔 로그를 전부 교체)

**Interfaces:**
- Consumes: `parseReviews`, `findReviewContainer`, `summarize`, `createBanner`, `markSponsored`, `applyFilter`
- Produces: 없음. 이 파일은 진입점이며 다른 모듈이 소비하지 않는다

- [ ] **Step 1: 진입점 구현**

쿠팡은 리뷰를 비동기로 로드하고 페이지 이동 없이 교체하기도 한다. `MutationObserver` 로 변화를 감지하고, 리뷰 개수가 바뀔 때만 다시 그린다.

`extension/src/content/index.js` 전체를 아래로 교체한다.

```js
import { parseReviews, findReviewContainer } from './parser.js'
import { summarize } from '../core/rating.js'
import { createBanner } from './banner.js'
import { markSponsored, applyFilter } from './filter.js'

const state = {
  hidden: false,
  lastCount: -1,
}

function render() {
  const container = findReviewContainer(document)
  if (!container) return

  const reviews = parseReviews(document)
  if (reviews.length === 0) return
  if (reviews.length === state.lastCount) return
  state.lastCount = reviews.length

  markSponsored(reviews)
  applyFilter(reviews, state.hidden)

  const summary = summarize(reviews)
  const banner = createBanner(summary, {
    hidden: state.hidden,
    onToggle: (next) => {
      state.hidden = next
      applyFilter(reviews, next)
      state.lastCount = -1
      render()
    },
  })

  const existing = document.querySelector('[data-crf-banner="1"]')
  if (existing) existing.remove()
  container.parentNode.insertBefore(banner, container)
}

function start() {
  render()
  const observer = new MutationObserver(() => render())
  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
```

- [ ] **Step 2: 전체 테스트 실행**

Run: `npm test`
Expected: PASS. sponsored 5개, rating 5개, parser 5개, banner 6개, filter 5개

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: `extension/dist/content.js` 갱신, 오류 없음

- [ ] **Step 4: 실제 쿠팡 페이지에서 검증**

1. `chrome://extensions` 에서 확장의 새로고침 버튼을 누른다
2. Task 4에서 픽스처를 뜬 상품 페이지를 연다
3. 리뷰 영역까지 스크롤한다

확인할 것:

| 항목 | 기대 |
|---|---|
| 배너 위치 | 리뷰 목록 바로 위에 하나만 |
| 리뷰 수 | 화면에 보이는 리뷰 개수와 일치 |
| 체험단 수 | 실제로 문구가 붙은 리뷰 개수와 일치 |
| 평점 두 개 | 쿠팡 표시 평점과 계산된 제외 평점이 모두 보임 |
| 배지 | 체험단 리뷰에만 "체험단 제공 리뷰" |
| 토글 | 누르면 체험단 리뷰가 사라지고, 다시 누르면 돌아옴 |
| 스크롤 추가 로드 | 리뷰를 더 불러오면 배너 숫자가 갱신됨 |
| 콘솔 | 오류 없음 |

- [ ] **Step 5: 체험단이 없는 상품에서도 확인**

체험단 리뷰가 없는 상품 페이지를 연다.

Expected: 배너에 "체험단 리뷰가 없습니다" 문구가 보이고, 토글 버튼은 나타나지 않는다

- [ ] **Step 6: 커밋**

```bash
git add extension/src/content/index.js
git commit -m "feat: 확장 진입점 통합과 동적 로딩 대응"
```

---

## 완료 기준

- [ ] `npm test` 가 26개 테스트를 모두 통과한다
- [ ] 실제 쿠팡 상품 페이지에서 배너가 뜨고 토글이 동작한다
- [ ] 체험단 리뷰가 없는 상품에서도 오류 없이 동작한다
- [ ] 리뷰를 추가 로드하면 숫자가 갱신된다
- [ ] 콘솔에 오류가 없다

이 시점에서 확장은 계측 없이 완전히 동작한다. 다음 계획에서 앰플리튜드를 붙인다.

---

## 다음 계획

- 계획 2: 계측. 백그라운드 서비스 워커, 앰플리튜드 전송, 신원 관리, 실험 배정, 사이드 패널
- 계획 3: 랜딩과 배포. 랜딩 페이지, 온보딩, 모바일 핸드오프, 웹스토어 제출
