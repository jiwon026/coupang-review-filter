# 계측 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확장에 앰플리튜드 계측을 붙이고, 사이드 패널을 추가하고, A/B 실험 배정 로직을 넣어 설계된 11개 확장 이벤트가 실제로 수집되게 한다.

**Architecture:** 이벤트 전송은 전부 백그라운드 서비스 워커에서 한다. 콘텐츠 스크립트는 `chrome.runtime.sendMessage` 로 의도만 넘긴다. 쿠팡 페이지의 보안 정책이 외부 요청을 막을 수 있기 때문이다. 앰플리튜드는 SDK 대신 HTTP V2 API를 직접 호출해 이벤트 스키마를 완전히 통제한다.

**Tech Stack:** JavaScript (ES 모듈), esbuild, Vitest, Amplitude HTTP API V2, Chrome Side Panel API

**Spec:** `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md`

**선행 계획:** `docs/superpowers/plans/2026-09-28-extension-core.md` 가 완료되어 있어야 한다.

## Global Constraints

- 모든 네트워크 요청은 백그라운드 서비스 워커에서만 한다. 콘텐츠 스크립트와 사이드 패널은 `chrome.runtime.sendMessage` 로만 전송을 요청한다
- 앰플리튜드 API 키는 `extension/src/shared/config.local.js` 에만 두며 이 파일은 `.gitignore` 대상이다. 저장소에는 `config.example.js` 만 커밋한다
- 리뷰 본문을 이벤트 프로퍼티에 담지 않는다. 리뷰 식별이 필요하면 `review_id_hash` 만 보낸다
- 이벤트 이름은 `shared/events.js` 의 `EVENTS` 상수로만 참조한다. 문자열을 직접 쓰지 않는다
- 실험 배정은 `device_id` 기반 결정적 해시다. 같은 사용자는 항상 같은 변형을 받는다
- 사용자에게 보이는 모든 문구는 한국어로 쓰고 엠대시(—)와 가운데 점(·)을 쓰지 않는다

## 이 계획에서 구현하는 이벤트

| 이벤트 | 태스크 |
|---|---|
| `Banner Rendered` | 6 |
| `Filter Toggled` | 6 |
| `Panel Opened` | 8 |
| `Purchase Intent Clicked` | 7 |
| `Extension Installed` | 9 |
| `Extension Error` | 9 |
| `Extension Removed` | 9 |

`Onboarding Viewed`, `Onboarding Example Clicked`, `Evidence Expanded`, `Panel Review Scrolled` 는 이 계획에서 다루지 않는다. 앞의 둘은 랜딩 도메인에서 발생하므로 계획 3에서, 뒤의 둘은 패널에 리뷰 목록을 넣을 때 다룬다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `extension/src/shared/config.example.js` | 설정 템플릿. 커밋됨 |
| `extension/src/shared/config.local.js` | 실제 API 키. 커밋 안 됨 |
| `extension/src/shared/events.js` | 이벤트 이름 상수 |
| `extension/src/shared/messages.js` | 콘텐츠와 백그라운드 간 메시지 타입 상수 |
| `extension/src/core/experiment.js` | 결정적 실험 배정. 순수 함수 |
| `extension/src/background/identity.js` | device_id 생성과 저장 |
| `extension/src/background/analytics.js` | 앰플리튜드 페이로드 조립과 전송 |
| `extension/src/background/index.js` | 서비스 워커 진입점. 메시지 수신 |
| `extension/src/sidepanel/index.html` | 사이드 패널 마크업 |
| `extension/src/sidepanel/index.js` | 사이드 패널 로직 |
| `extension/src/sidepanel/style.css` | 사이드 패널 스타일 |
| `tests/helpers/chrome-mock.js` | 크롬 API 테스트 더블 |

---

## Task 1: 설정과 백그라운드 뼈대

**Files:**
- Create: `extension/src/shared/config.example.js`
- Create: `extension/src/shared/config.local.js`
- Create: `extension/src/background/index.js`
- Modify: `build.js` (엔트리 추가)
- Modify: `extension/manifest.json` (background 선언)

**Interfaces:**
- Consumes: 없음
- Produces: `CONFIG = { amplitudeApiKey: string, amplitudeEndpoint: string, landingOrigin: string }`

- [ ] **Step 1: 앰플리튜드 프로젝트 생성**

1. 앰플리튜드에 로그인하고 새 프로젝트를 만든다
2. Settings → Projects → 해당 프로젝트 → General 에서 API Key를 복사한다
3. 데이터 저장 지역이 EU면 엔드포인트가 `https://api.eu.amplitude.com/2/httpapi` 다. 기본은 `https://api2.amplitude.com/2/httpapi` 다

- [ ] **Step 2: 설정 템플릿 작성**

`extension/src/shared/config.example.js`:

```js
export const CONFIG = {
  amplitudeApiKey: 'YOUR_AMPLITUDE_API_KEY',
  amplitudeEndpoint: 'https://api2.amplitude.com/2/httpapi',
  landingOrigin: 'https://example.com',
}
```

- [ ] **Step 3: 실제 설정 작성**

`extension/src/shared/config.local.js` 를 만들고 Step 1에서 복사한 키를 넣는다. `landingOrigin` 은 계획 3에서 확정하므로 지금은 `http://localhost:5173` 으로 둔다.

```js
export const CONFIG = {
  amplitudeApiKey: '실제 키를 여기에',
  amplitudeEndpoint: 'https://api2.amplitude.com/2/httpapi',
  landingOrigin: 'http://localhost:5173',
}
```

- [ ] **Step 4: gitignore 확인**

Run: `git check-ignore -v extension/src/shared/config.local.js`
Expected: `.gitignore:15:config.local.js` 형태의 출력. 출력이 없으면 `.gitignore` 에 `config.local.js` 가 있는지 확인한다

- [ ] **Step 5: 백그라운드 진입점 작성**

`extension/src/background/index.js`:

```js
import { CONFIG } from '../shared/config.local.js'

console.log('[체험단 필터] 서비스 워커 시작', CONFIG.amplitudeEndpoint)
```

- [ ] **Step 6: build.js에 엔트리 추가**

`build.js` 의 `entryPoints` 를 아래로 교체한다.

```js
  entryPoints: {
    content: 'extension/src/content/index.js',
    background: 'extension/src/background/index.js',
  },
```

- [ ] **Step 7: manifest.json에 background 선언 추가**

`"permissions"` 아래에 다음을 추가한다.

```json
  "background": {
    "service_worker": "dist/background.js"
  },
```

- [ ] **Step 8: 빌드하고 서비스 워커 확인**

Run: `npm run build`

1. `chrome://extensions` 에서 확장 새로고침
2. 확장 카드의 "서비스 워커" 링크 클릭
3. 열린 개발자도구 콘솔 확인

Expected: `[체험단 필터] 서비스 워커 시작 https://api2.amplitude.com/2/httpapi`

- [ ] **Step 9: 커밋**

```bash
git add extension/src/shared/config.example.js extension/src/background/index.js build.js extension/manifest.json
git commit -m "feat: 백그라운드 서비스 워커와 설정 분리"
```

`config.local.js` 는 스테이징되지 않아야 한다. `git status` 로 확인한다.

---

## Task 2: 신원 관리

**Files:**
- Create: `tests/helpers/chrome-mock.js`
- Create: `extension/src/background/identity.js`
- Test: `tests/identity.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `getDeviceId(): Promise<string>` 저장된 id가 있으면 반환, 없으면 생성 후 저장
  - `setDeviceId(id: string): Promise<void>` 랜딩에서 받은 id로 덮어쓰기
  - `getUserId(): Promise<string | null>`
  - `setUserId(id: string): Promise<void>`
  - 저장 키는 `crf_device_id`, `crf_user_id`

- [ ] **Step 1: 크롬 API 테스트 더블 작성**

`tests/helpers/chrome-mock.js`:

```js
export function installChromeMock(initial = {}) {
  const store = { ...initial }

  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys]
          const result = {}
          for (const key of list) {
            if (key in store) result[key] = store[key]
          }
          return result
        },
        async set(items) {
          Object.assign(store, items)
        },
      },
    },
    runtime: {
      setUninstallURL() {},
      getManifest: () => ({ version: '0.1.0' }),
    },
  }

  globalThis.chrome = chrome
  return store
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/identity.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { installChromeMock } from './helpers/chrome-mock.js'
import { getDeviceId, setDeviceId, getUserId, setUserId } from '../extension/src/background/identity.js'

describe('identity', () => {
  let store

  beforeEach(() => {
    store = installChromeMock()
  })

  it('저장된 device_id가 없으면 새로 만든다', async () => {
    const id = await getDeviceId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(10)
  })

  it('두 번 호출하면 같은 값을 준다', async () => {
    const first = await getDeviceId()
    const second = await getDeviceId()
    expect(second).toBe(first)
  })

  it('생성한 값을 저장소에 쓴다', async () => {
    const id = await getDeviceId()
    expect(store.crf_device_id).toBe(id)
  })

  it('랜딩에서 받은 id로 덮어쓸 수 있다', async () => {
    await getDeviceId()
    await setDeviceId('abc123')
    expect(await getDeviceId()).toBe('abc123')
  })

  it('user_id는 기본값이 null이다', async () => {
    expect(await getUserId()).toBeNull()
  })

  it('user_id를 저장하고 읽는다', async () => {
    await setUserId('token-xyz')
    expect(await getUserId()).toBe('token-xyz')
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/identity.test.js`
Expected: FAIL. `Failed to resolve import`

- [ ] **Step 4: 구현 작성**

`extension/src/background/identity.js`:

```js
const DEVICE_KEY = 'crf_device_id'
const USER_KEY = 'crf_user_id'

function generateId() {
  return crypto.randomUUID()
}

export async function getDeviceId() {
  const stored = await chrome.storage.local.get(DEVICE_KEY)
  if (stored[DEVICE_KEY]) return stored[DEVICE_KEY]

  const created = generateId()
  await chrome.storage.local.set({ [DEVICE_KEY]: created })
  return created
}

export async function setDeviceId(id) {
  await chrome.storage.local.set({ [DEVICE_KEY]: id })
}

export async function getUserId() {
  const stored = await chrome.storage.local.get(USER_KEY)
  return stored[USER_KEY] ?? null
}

export async function setUserId(id) {
  await chrome.storage.local.set({ [USER_KEY]: id })
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/identity.test.js`
Expected: PASS, 6개 통과

- [ ] **Step 6: 커밋**

```bash
git add tests/helpers/chrome-mock.js extension/src/background/identity.js tests/identity.test.js
git commit -m "feat: 확장 신원 관리"
```

---

## Task 3: 앰플리튜드 전송

**Files:**
- Create: `extension/src/background/analytics.js`
- Test: `tests/analytics.test.js`

**Interfaces:**
- Consumes: `CONFIG` from `shared/config.local.js`, `getDeviceId`, `getUserId` from `background/identity.js`
- Produces:
  - `buildPayload(input): object` 순수 함수. 앰플리튜드 요청 본문을 만든다
  - `track(eventType: string, properties?: object): Promise<void>` 이벤트 하나를 전송한다
  - 전송 실패는 예외를 던지지 않고 콘솔 경고만 남긴다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/analytics.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildPayload } from '../extension/src/background/analytics.js'

describe('buildPayload', () => {
  const base = {
    apiKey: 'test-key',
    deviceId: 'device-1',
    userId: null,
    eventType: 'Banner Rendered',
    properties: { review_count: 120 },
    commonProperties: { surface: 'extension', app_version: '0.1.0' },
    time: 1700000000000,
    insertId: 'insert-1',
  }

  it('api_key를 최상위에 담는다', () => {
    expect(buildPayload(base).api_key).toBe('test-key')
  })

  it('이벤트 하나를 배열로 담는다', () => {
    const payload = buildPayload(base)
    expect(payload.events).toHaveLength(1)
    expect(payload.events[0].event_type).toBe('Banner Rendered')
  })

  it('공통 프로퍼티와 이벤트 프로퍼티를 합친다', () => {
    const props = buildPayload(base).events[0].event_properties
    expect(props.surface).toBe('extension')
    expect(props.app_version).toBe('0.1.0')
    expect(props.review_count).toBe(120)
  })

  it('이벤트 프로퍼티가 공통보다 우선한다', () => {
    const payload = buildPayload({
      ...base,
      commonProperties: { surface: 'extension' },
      properties: { surface: 'sidepanel' },
    })
    expect(payload.events[0].event_properties.surface).toBe('sidepanel')
  })

  it('user_id가 null이면 필드를 넣지 않는다', () => {
    expect('user_id' in buildPayload(base).events[0]).toBe(false)
  })

  it('user_id가 있으면 넣는다', () => {
    const payload = buildPayload({ ...base, userId: 'user-9' })
    expect(payload.events[0].user_id).toBe('user-9')
  })

  it('time과 insert_id를 담는다', () => {
    const event = buildPayload(base).events[0]
    expect(event.time).toBe(1700000000000)
    expect(event.insert_id).toBe('insert-1')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/analytics.test.js`
Expected: FAIL. `Failed to resolve import`

- [ ] **Step 3: 구현 작성**

`extension/src/background/analytics.js`:

```js
import { CONFIG } from '../shared/config.local.js'
import { getDeviceId, getUserId } from './identity.js'

export function buildPayload(input) {
  const event = {
    device_id: input.deviceId,
    event_type: input.eventType,
    event_properties: { ...input.commonProperties, ...input.properties },
    time: input.time,
    insert_id: input.insertId,
  }

  if (input.userId) event.user_id = input.userId

  return {
    api_key: input.apiKey,
    events: [event],
  }
}

async function commonProperties() {
  return {
    surface: 'extension',
    platform: 'desktop',
    app_version: chrome.runtime.getManifest().version,
  }
}

export async function track(eventType, properties = {}) {
  try {
    const payload = buildPayload({
      apiKey: CONFIG.amplitudeApiKey,
      deviceId: await getDeviceId(),
      userId: await getUserId(),
      eventType,
      properties,
      commonProperties: await commonProperties(),
      time: Date.now(),
      insertId: crypto.randomUUID(),
    })

    const response = await fetch(CONFIG.amplitudeEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.warn('[체험단 필터] 이벤트 전송 실패', response.status, eventType)
    }
  } catch (error) {
    console.warn('[체험단 필터] 이벤트 전송 오류', eventType, error)
  }
}
```

전송 실패가 확장 동작을 멈추면 안 되므로 예외를 삼킨다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/analytics.test.js`
Expected: PASS, 7개 통과

- [ ] **Step 5: 커밋**

```bash
git add extension/src/background/analytics.js tests/analytics.test.js
git commit -m "feat: 앰플리튜드 HTTP API 전송"
```

---

## Task 4: 이벤트 상수와 메시지 타입

**Files:**
- Create: `extension/src/shared/events.js`
- Create: `extension/src/shared/messages.js`
- Test: `tests/events.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `EVENTS` 객체. 키는 대문자 스네이크, 값은 앰플리튜드 이벤트 이름
  - `MESSAGES` 객체. 콘텐츠와 백그라운드 간 메시지 타입

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/events.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { EVENTS } from '../extension/src/shared/events.js'

describe('EVENTS', () => {
  it('설계된 확장 이벤트 9개를 모두 정의한다', () => {
    expect(Object.keys(EVENTS)).toHaveLength(9)
  })

  it('이벤트 이름이 중복되지 않는다', () => {
    const values = Object.values(EVENTS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('이벤트 이름은 Title Case 두 단어 이상이다', () => {
    for (const name of Object.values(EVENTS)) {
      expect(name).toMatch(/^[A-Z][a-zA-Z]+( [A-Z][a-zA-Z]+)+$/)
    }
  })

  it('핵심 이벤트가 존재한다', () => {
    expect(EVENTS.BANNER_RENDERED).toBe('Banner Rendered')
    expect(EVENTS.FILTER_TOGGLED).toBe('Filter Toggled')
    expect(EVENTS.PURCHASE_INTENT_CLICKED).toBe('Purchase Intent Clicked')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/events.test.js`
Expected: FAIL. `Failed to resolve import`

- [ ] **Step 3: 구현 작성**

`extension/src/shared/events.js`:

```js
export const EVENTS = {
  EXTENSION_INSTALLED: 'Extension Installed',
  BANNER_RENDERED: 'Banner Rendered',
  PANEL_OPENED: 'Panel Opened',
  FILTER_TOGGLED: 'Filter Toggled',
  EVIDENCE_EXPANDED: 'Evidence Expanded',
  PANEL_REVIEW_SCROLLED: 'Panel Review Scrolled',
  PURCHASE_INTENT_CLICKED: 'Purchase Intent Clicked',
  EXTENSION_REMOVED: 'Extension Removed',
  EXTENSION_ERROR: 'Extension Error',
}
```

`extension/src/shared/messages.js`:

```js
export const MESSAGES = {
  TRACK: 'crf:track',
  OPEN_PANEL: 'crf:open-panel',
  SUMMARY_UPDATED: 'crf:summary-updated',
  GET_SUMMARY: 'crf:get-summary',
  GET_VARIANT: 'crf:get-variant',
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/events.test.js`
Expected: PASS, 4개 통과

- [ ] **Step 5: 커밋**

```bash
git add extension/src/shared/events.js extension/src/shared/messages.js tests/events.test.js
git commit -m "feat: 이벤트와 메시지 타입 상수"
```

---

## Task 5: 실험 배정

**Files:**
- Create: `extension/src/core/experiment.js`
- Test: `tests/experiment.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `EXPERIMENTS: { DEFAULT_FILTER: { id, variants } }`
  - `assign(deviceId: string, experimentId: string, variants: string[]): string`
  - 같은 입력에 항상 같은 출력. 변형 간 분포가 균등

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/experiment.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { assign, EXPERIMENTS } from '../extension/src/core/experiment.js'

const VARIANTS = ['on', 'off']

describe('assign', () => {
  it('같은 입력에 항상 같은 변형을 준다', () => {
    const first = assign('device-abc', 'default_filter', VARIANTS)
    for (let i = 0; i < 20; i += 1) {
      expect(assign('device-abc', 'default_filter', VARIANTS)).toBe(first)
    }
  })

  it('정의된 변형 중 하나를 준다', () => {
    expect(VARIANTS).toContain(assign('device-abc', 'default_filter', VARIANTS))
  })

  it('실험 id가 다르면 배정이 독립적이다', () => {
    const results = new Set()
    for (let i = 0; i < 200; i += 1) {
      results.add(assign(`device-${i}`, 'exp_a', VARIANTS))
      results.add(assign(`device-${i}`, 'exp_b', VARIANTS))
    }
    expect(results.size).toBe(2)
  })

  it('1000명 기준 분포가 45%에서 55% 사이다', () => {
    let onCount = 0
    for (let i = 0; i < 1000; i += 1) {
      if (assign(`device-${i}`, 'default_filter', VARIANTS) === 'on') onCount += 1
    }
    expect(onCount).toBeGreaterThan(450)
    expect(onCount).toBeLessThan(550)
  })

  it('DEFAULT_FILTER 실험이 정의되어 있다', () => {
    expect(EXPERIMENTS.DEFAULT_FILTER.id).toBe('default_filter')
    expect(EXPERIMENTS.DEFAULT_FILTER.variants).toEqual(['on', 'off'])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/experiment.test.js`
Expected: FAIL. `Failed to resolve import`

- [ ] **Step 3: 구현 작성**

`extension/src/core/experiment.js`:

```js
export const EXPERIMENTS = {
  DEFAULT_FILTER: { id: 'default_filter', variants: ['on', 'off'] },
  BANNER_COPY: { id: 'banner_copy', variants: ['rating', 'ratio'] },
}

function hash(value) {
  let result = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

export function assign(deviceId, experimentId, variants) {
  const bucket = hash(`${experimentId}:${deviceId}`) % variants.length
  return variants[bucket]
}
```

FNV-1a 해시다. 실험 id를 앞에 붙여 실험 간 배정이 서로 얽히지 않게 한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/experiment.test.js`
Expected: PASS, 5개 통과

분포 테스트가 실패하면 해시가 편향된 것이다. 씨드 문자열 구성을 바꿔 다시 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add extension/src/core/experiment.js tests/experiment.test.js
git commit -m "feat: 결정적 실험 배정"
```

---

## Task 6: 콘텐츠와 백그라운드 배선

**Files:**
- Modify: `extension/src/background/index.js` (Task 1의 콘솔 로그 전부 교체)
- Modify: `extension/src/content/index.js` (계획 1 결과물 교체)
- Modify: `extension/src/content/banner.js` (변형별 문구 분기 추가)

**Interfaces:**
- Consumes: `EVENTS`, `MESSAGES`, `track`, `assign`, `EXPERIMENTS`, `getDeviceId`
- Produces:
  - 백그라운드가 `MESSAGES.TRACK` 과 `MESSAGES.GET_VARIANT` 메시지를 처리한다
  - 콘텐츠가 `Banner Rendered` 와 `Filter Toggled` 를 전송한다

- [ ] **Step 1: 백그라운드 메시지 핸들러 구현**

`extension/src/background/index.js` 전체를 아래로 교체한다.

```js
import { MESSAGES } from '../shared/messages.js'
import { track } from './analytics.js'
import { getDeviceId } from './identity.js'
import { assign, EXPERIMENTS } from '../core/experiment.js'

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGES.TRACK) {
    track(message.eventType, message.properties)
    sendResponse({ ok: true })
    return false
  }

  if (message?.type === MESSAGES.GET_VARIANT) {
    getDeviceId().then((deviceId) => {
      const variants = {}
      for (const experiment of Object.values(EXPERIMENTS)) {
        variants[experiment.id] = assign(deviceId, experiment.id, experiment.variants)
      }
      sendResponse({ variants })
    })
    return true
  }

  return false
})
```

비동기 응답을 하려면 리스너가 `true` 를 반환해야 한다. 이 규칙을 어기면 응답이 조용히 유실된다.

- [ ] **Step 2: 배너에 변형별 문구 추가**

`extension/src/content/banner.js` 의 `createBanner` 안에서 headline 을 만드는 부분을 아래로 교체한다. `options.copyVariant` 가 `'ratio'` 면 비중을 앞세운다.

```js
  const headline = document.createElement('p')
  headline.className = 'crf-headline'
  headline.textContent =
    options.copyVariant === 'ratio'
      ? `이 상품 리뷰의 ${formatPercent(summary.sponsoredRatio)}가 체험단입니다`
      : `리뷰 ${formatCount(summary.total)}개 중 체험단 ${formatCount(summary.sponsoredCount)}개 ` +
        `(${formatPercent(summary.sponsoredRatio)})`
  root.appendChild(headline)
```

- [ ] **Step 3: 콘텐츠 진입점 교체**

`extension/src/content/index.js` 전체를 아래로 교체한다.

```js
import { parseReviews, findReviewContainer } from './parser.js'
import { summarize } from '../core/rating.js'
import { createBanner } from './banner.js'
import { markSponsored, applyFilter } from './filter.js'
import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'

const state = {
  hidden: false,
  lastCount: -1,
  variants: { default_filter: 'off', banner_copy: 'rating' },
  renderedAt: 0,
}

function track(eventType, properties = {}) {
  chrome.runtime.sendMessage({ type: MESSAGES.TRACK, eventType, properties })
}

function secondsSinceRender() {
  return state.renderedAt === 0 ? 0 : Math.round((Date.now() - state.renderedAt) / 1000)
}

function render(isFirst) {
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
    copyVariant: state.variants.banner_copy,
    onToggle: (next) => {
      state.hidden = next
      applyFilter(reviews, next)
      track(EVENTS.FILTER_TOGGLED, {
        to_state: next ? 'on' : 'off',
        default_state: state.variants.default_filter,
        seconds_since_render: secondsSinceRender(),
      })
      state.lastCount = -1
      render(false)
    },
  })

  const existing = document.querySelector('[data-crf-banner="1"]')
  if (existing) existing.remove()
  container.parentNode.insertBefore(banner, container)

  if (isFirst) {
    state.renderedAt = Date.now()
    track(EVENTS.BANNER_RENDERED, {
      review_count: summary.total,
      sponsored_count: summary.sponsoredCount,
      sponsored_ratio: summary.sponsoredRatio,
      rating_official: summary.ratingOfficial,
      rating_filtered: summary.ratingFiltered,
      rating_delta: summary.ratingDelta,
    })
  }
}

function start() {
  chrome.runtime.sendMessage({ type: MESSAGES.GET_VARIANT }, (response) => {
    if (response?.variants) state.variants = response.variants
    state.hidden = state.variants.default_filter === 'on'
    render(true)
    const observer = new MutationObserver(() => render(false))
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
```

`Banner Rendered` 는 페이지당 한 번만 보낸다. 리뷰를 더 로드할 때마다 보내면 지표가 오염된다.

- [ ] **Step 4: 빌드하고 앰플리튜드에서 확인**

Run: `npm run build`

1. `chrome://extensions` 에서 확장 새로고침
2. 쿠팡 상품 페이지를 열고 리뷰 영역까지 스크롤
3. 토글을 두세 번 누른다
4. 앰플리튜드 → User Look-Up 또는 Events → Live Event Stream 을 연다

Expected: `Banner Rendered` 1건, `Filter Toggled` 누른 횟수만큼. 프로퍼티에 `review_count`, `rating_delta`, `surface: extension` 이 들어 있다

- [ ] **Step 5: 실험 배정 확인**

서비스 워커 콘솔에서 실행한다.

```js
chrome.storage.local.get('crf_device_id').then(console.log)
```

device_id를 바꿔 가며 배너 문구가 두 가지로 나뉘는지 확인한다.

```js
chrome.storage.local.set({ crf_device_id: 'test-a' })
chrome.storage.local.set({ crf_device_id: 'test-b' })
```

Expected: 두 값 중 하나에서 "이 상품 리뷰의 28%가 체험단입니다" 형태의 문구가 나온다. 안 나오면 다른 값으로 더 시도한다

- [ ] **Step 6: 전체 테스트와 커밋**

Run: `npm test`
Expected: 계획 1의 26개 + 이 계획의 22개, 총 48개 통과

```bash
git add extension/src/background/index.js extension/src/content/index.js extension/src/content/banner.js
git commit -m "feat: 배너와 필터 이벤트 계측"
```

---

## Task 6b: 정렬 상태 수집

> **2026-09-30 추가.** 명세 4.4절의 실측 결과로 생긴 태스크다. 같은 상품에서 최신순은 체험단 0/50, 베스트순은 20/50 이었다. 정렬을 기록하지 않으면 이 신호가 집계에서 통째로 사라진다. `rating_delta` 만 보면 "아무 일 없음" 으로 나온다.

**Files:**
- Modify: `extension/src/content/selectors.js`
- Create: `extension/src/content/sort.js`
- Modify: `extension/src/content/index.js`
- Test: `tests/sort.test.js`

**Interfaces:**
- Consumes: `SELECTORS` from `content/selectors.js`
- Produces: `detectSort(root: Document | Element): 'best' | 'latest' | 'unknown'`

### 실측한 탐지 방법

정렬 버튼 두 개가 `#sdpReview` 안에 있고, **활성 버튼만 클래스에 `twc-font-bold` 를 갖는다.** 비활성은 `twc-font-normal` 이다. 컨트롤러가 실제 페이지에서 확인했다.

**정정 (2026-10-02):** 위 문단은 틀렸다. 실제 페이지에서는 두 버튼 모두 `twc-font-bold` 를 가지며(비활성 버튼에도 뒤쪽에 붙는다), 비활성 버튼에만 `twc-font-normal` 이 추가로 붙는다. 그래서 `twc-font-bold` 로 활성을 판정하면 두 버튼이 모두 활성이 되어 `review_sort` 가 항상 `best` 로 기록됐다. 수정 후 판정은 `twc-font-normal` 토큰이 없는 버튼을 활성으로 보고, 활성이 정확히 하나일 때만 키를 반환하며 아니면 `unknown` 이다. 아래 Step 1 의 `activeClass: 'twc-font-bold'` 도 같은 이유로 `inactiveClass: 'twc-font-normal'` 로 바뀌었다.

- [ ] **Step 1: `selectors.js` 에 정렬 상수 추가**

```js
export const SORT_SELECTORS = {
  sortButton: 'button',
  activeClass: 'twc-font-bold',
}

export const SORT_LABELS = {
  best: '베스트순',
  latest: '최신순',
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/sort.test.js`:

```js
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
    expect(detectSort(build('twc-font-bold', 'twc-font-normal'))).toBe('best')
  })

  it('최신순이 굵으면 latest', () => {
    expect(detectSort(build('twc-font-normal', 'twc-font-bold'))).toBe('latest')
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
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/sort.test.js`
Expected: FAIL. `Failed to resolve import`

- [ ] **Step 4: 구현 작성**

`extension/src/content/sort.js`:

```js
import { SELECTORS, SORT_SELECTORS, SORT_LABELS } from './selectors.js'

export function detectSort(root) {
  const container = root.querySelector(SELECTORS.reviewContainer)
  if (!container) return 'unknown'

  const buttons = [...container.querySelectorAll(SORT_SELECTORS.sortButton)]

  for (const [key, label] of Object.entries(SORT_LABELS)) {
    const button = buttons.find((element) => element.textContent.trim() === label)
    if (button && String(button.className).includes(SORT_SELECTORS.activeClass)) return key
  }

  return 'unknown'
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/sort.test.js`
Expected: PASS, 5개 통과

- [ ] **Step 6: `index.js` 에 배선**

상단 import에 추가한다.

```js
import { detectSort } from './sort.js'
```

`track` 헬퍼가 모든 이벤트에 정렬을 싣도록 바꾼다.

```js
function track(eventType, properties = {}) {
  chrome.runtime.sendMessage({
    type: MESSAGES.TRACK,
    eventType,
    properties: { review_sort: detectSort(document), ...properties },
  })
}
```

`Banner Rendered` 프로퍼티에 이번 페이지 값과 누적 페이지 수를 추가한다. 누적 집계가 들어간 뒤라 `summary` 는 누적 기준이고, 현재 페이지 값은 따로 세야 한다.

```js
    track(EVENTS.BANNER_RENDERED, {
      review_count: summary.total,
      sponsored_count: summary.sponsoredCount,
      sponsored_ratio: summary.sponsoredRatio,
      rating_official: summary.ratingOfficial,
      rating_filtered: summary.ratingFiltered,
      rating_delta: summary.ratingDelta,
      page_review_count: reviews.length,
      page_sponsored_count: reviews.filter((review) => isSponsored(review.text)).length,
    })
```

- [ ] **Step 7: 전체 테스트와 커밋**

Run: `npm test`

```bash
git add extension/src/content/sort.js extension/src/content/selectors.js extension/src/content/index.js tests/sort.test.js
git commit -m "feat: 리뷰 정렬 상태 수집"
```

### 분석에 주는 의미

`review_sort` 로 분할한 `page_sponsored_count / page_review_count` 가 이 프로젝트의 핵심 지표가 된다. 상품 수십 개에서 최신순과 베스트순의 협찬 비중 차이가 재현되면, 명세 4.4절의 가설이 검증된다.

`review_sort` 가 `unknown` 인 비율이 치솟으면 쿠팡이 정렬 UI를 바꾼 것이므로 `Extension Error` 와 함께 가드레일로 감시한다.

---

## Task 7: 구매 의도 감지

**Files:**
- Modify: `extension/src/content/selectors.js` (구매 버튼 셀렉터 추가)
- Create: `extension/src/content/purchase.js`
- Modify: `extension/src/content/index.js` (배선 추가)
- Test: `tests/purchase.test.js`

**Interfaces:**
- Consumes: `ParsedReview`, `EVENTS`
- Produces:
  - `watchPurchaseIntent(root: Document, onIntent: (kind: string) => void): void`
  - `kind` 은 `'cart'` 또는 `'buy_now'`

- [ ] **Step 1: 구매 버튼 셀렉터 확인**

쿠팡 상품 페이지에서 개발자도구로 확인한다.

1. 장바구니 담기 버튼을 검사한다
2. 바로구매 버튼을 검사한다
3. 각각의 안정적인 셀렉터를 찾는다. 클래스 이름이 난독화되어 있으면 버튼의 텍스트로 찾는 방법을 쓴다

`extension/src/content/selectors.js` 에 추가한다. 아래 값은 확인한 실제 값으로 채운다.

```js
export const PURCHASE_SELECTORS = {
  cart: 'Step 1에서 확인한 값',
  buyNow: 'Step 1에서 확인한 값',
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/purchase.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { watchPurchaseIntent } from '../extension/src/content/purchase.js'

describe('watchPurchaseIntent', () => {
  let doc

  beforeEach(() => {
    doc = new JSDOM(`<body>
      <button class="crf-test-cart">장바구니 담기</button>
      <button class="crf-test-buy">바로구매</button>
      <button class="crf-test-other">공유</button>
    </body>`).window.document
  })

  it('장바구니 클릭을 감지한다', () => {
    const onIntent = vi.fn()
    watchPurchaseIntent(doc, onIntent, { cart: '.crf-test-cart', buyNow: '.crf-test-buy' })
    doc.querySelector('.crf-test-cart').click()
    expect(onIntent).toHaveBeenCalledWith('cart')
  })

  it('바로구매 클릭을 감지한다', () => {
    const onIntent = vi.fn()
    watchPurchaseIntent(doc, onIntent, { cart: '.crf-test-cart', buyNow: '.crf-test-buy' })
    doc.querySelector('.crf-test-buy').click()
    expect(onIntent).toHaveBeenCalledWith('buy_now')
  })

  it('관계없는 버튼은 무시한다', () => {
    const onIntent = vi.fn()
    watchPurchaseIntent(doc, onIntent, { cart: '.crf-test-cart', buyNow: '.crf-test-buy' })
    doc.querySelector('.crf-test-other').click()
    expect(onIntent).not.toHaveBeenCalled()
  })

  it('버튼 안쪽 엘리먼트를 눌러도 감지한다', () => {
    const inner = doc.createElement('span')
    doc.querySelector('.crf-test-cart').appendChild(inner)
    const onIntent = vi.fn()
    watchPurchaseIntent(doc, onIntent, { cart: '.crf-test-cart', buyNow: '.crf-test-buy' })
    inner.click()
    expect(onIntent).toHaveBeenCalledWith('cart')
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/purchase.test.js`
Expected: FAIL. `Failed to resolve import`

- [ ] **Step 4: 구현 작성**

`extension/src/content/purchase.js`. 쿠팡은 버튼을 비동기로 교체하므로 버튼에 직접 리스너를 달지 않고 문서 전체에서 이벤트 위임으로 잡는다.

```js
import { PURCHASE_SELECTORS } from './selectors.js'

export function watchPurchaseIntent(root, onIntent, selectors = PURCHASE_SELECTORS) {
  root.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (!target || typeof target.closest !== 'function') return

      if (target.closest(selectors.cart)) {
        onIntent('cart')
        return
      }
      if (target.closest(selectors.buyNow)) {
        onIntent('buy_now')
      }
    },
    true,
  )
}
```

캡처 단계에서 듣는 이유는 쿠팡이 클릭 이벤트의 전파를 막는 경우에도 감지하기 위해서다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/purchase.test.js`
Expected: PASS, 4개 통과

- [ ] **Step 6: 진입점에 배선**

`extension/src/content/index.js` 상단 import 에 추가한다.

```js
import { watchPurchaseIntent } from './purchase.js'
```

`start()` 안의 `observer.observe(...)` 다음 줄에 추가한다.

```js
    watchPurchaseIntent(document, (kind) => {
      track(EVENTS.PURCHASE_INTENT_CLICKED, {
        intent_kind: kind,
        filter_state: state.hidden ? 'on' : 'off',
        rating_delta: state.lastSummary?.ratingDelta ?? null,
        seconds_on_page: secondsSinceRender(),
      })
    })
```

`render()` 안에서 `const summary = summarize(reviews)` 다음 줄에 추가한다.

```js
  state.lastSummary = summary
```

`state` 객체에 `lastSummary: null` 을 추가한다.

- [ ] **Step 7: 실제 페이지에서 확인**

Run: `npm run build`

1. 확장 새로고침 후 쿠팡 상품 페이지를 연다
2. 장바구니 담기를 누른다 (담긴 상품은 나중에 비우면 된다)
3. 앰플리튜드 Live Event Stream 확인

Expected: `Purchase Intent Clicked` 가 `intent_kind: cart`, `filter_state`, `rating_delta` 와 함께 수집된다

- [ ] **Step 8: 커밋**

```bash
git add extension/src/content/purchase.js extension/src/content/selectors.js extension/src/content/index.js tests/purchase.test.js
git commit -m "feat: 구매 의도 클릭 감지"
```

---

## Task 8: 사이드 패널

**Files:**
- Create: `extension/src/sidepanel/index.html`
- Create: `extension/src/sidepanel/index.js`
- Create: `extension/src/sidepanel/style.css`
- Modify: `build.js` (엔트리 추가)
- Modify: `extension/manifest.json` (side_panel 선언)
- Modify: `extension/src/background/index.js` (패널 열기 처리, 요약 보관)
- Modify: `extension/src/content/banner.js` (자세히 보기 버튼)
- Modify: `extension/src/content/index.js` (요약 전달)

**Interfaces:**
- Consumes: `MESSAGES`, `EVENTS`, `Summary`
- Produces: 사이드 패널이 현재 탭의 요약을 표시하고 `Panel Opened` 를 전송한다

- [ ] **Step 1: manifest에 side_panel 선언 추가**

`"action"` 위에 추가한다.

```json
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
```

- [ ] **Step 2: 백그라운드에 패널 열기와 요약 보관 추가**

`extension/src/background/index.js` 의 리스너 안, `MESSAGES.TRACK` 분기 위에 추가한다.

```js
const summaries = new Map()

chrome.tabs.onRemoved.addListener((tabId) => summaries.delete(tabId))
```

리스너 안에 분기 세 개를 추가한다.

```js
  if (message?.type === MESSAGES.SUMMARY_UPDATED) {
    if (sender.tab?.id !== undefined) summaries.set(sender.tab.id, message.summary)
    sendResponse({ ok: true })
    return false
  }

  if (message?.type === MESSAGES.GET_SUMMARY) {
    sendResponse({ summary: summaries.get(message.tabId) ?? null })
    return false
  }

  if (message?.type === MESSAGES.OPEN_PANEL) {
    if (sender.tab?.windowId !== undefined) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId })
    }
    sendResponse({ ok: true })
    return false
  }
```

`chrome.sidePanel.open()` 은 사용자 제스처 안에서만 동작한다. 배너 버튼 클릭이 그 제스처다.

- [ ] **Step 3: 배너에 자세히 보기 버튼 추가**

`extension/src/content/banner.js` 의 `createBanner` 안, 토글 버튼 다음에 추가한다.

```js
  const detail = document.createElement('button')
  detail.type = 'button'
  detail.className = 'crf-detail'
  detail.textContent = '자세히 보기'
  detail.addEventListener('click', () => options.onDetail())
  root.appendChild(detail)
```

`content.css` 에 추가한다.

```css
.crf-detail {
  margin-left: 8px;
  border: none;
  background: none;
  color: #1a6fc4;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
}
```

- [ ] **Step 4: 콘텐츠에서 요약 전달과 패널 열기 배선**

`extension/src/content/index.js` 의 `createBanner` 호출에 `onDetail` 을 추가한다.

```js
    onDetail: () => {
      chrome.runtime.sendMessage({ type: MESSAGES.OPEN_PANEL })
      track(EVENTS.PANEL_OPENED, {
        trigger: 'banner',
        seconds_since_render: secondsSinceRender(),
      })
    },
```

`state.lastSummary = summary` 다음 줄에 추가한다.

```js
  chrome.runtime.sendMessage({ type: MESSAGES.SUMMARY_UPDATED, summary })
```

- [ ] **Step 5: 패널 마크업 작성**

`extension/src/sidepanel/index.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>체험단 리뷰 필터</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main id="root">
    <p class="empty">쿠팡 상품 페이지를 열어 주세요.</p>
  </main>
  <script src="../../dist/sidepanel.js"></script>
</body>
</html>
```

- [ ] **Step 6: 패널 스타일 작성**

`extension/src/sidepanel/style.css`:

```css
body {
  margin: 0;
  padding: 16px;
  font-family: system-ui, sans-serif;
  color: #111;
  line-height: 1.6;
}

h1 {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
}

.stat {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.stat-label {
  margin: 0 0 4px;
  font-size: 12px;
  color: #777;
}

.stat-value {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.bar {
  height: 6px;
  border-radius: 6px;
  background: #eee;
  overflow: hidden;
  margin-top: 8px;
}

.bar-fill {
  height: 100%;
  background: #e8a33d;
}

.empty {
  color: #888;
  font-size: 13px;
}
```

- [ ] **Step 7: 패널 로직 작성**

`extension/src/sidepanel/index.js`:

```js
import { MESSAGES } from '../shared/messages.js'

function formatCount(value) {
  return value.toLocaleString('ko-KR')
}

function render(summary) {
  const root = document.getElementById('root')

  if (!summary) {
    root.innerHTML = '<p class="empty">쿠팡 상품 페이지를 열어 주세요.</p>'
    return
  }

  const percent = Math.round(summary.sponsoredRatio * 100)
  root.innerHTML = `
    <h1>체험단 리뷰 필터</h1>
    <section class="stat">
      <p class="stat-label">체험단 제외 평점</p>
      <p class="stat-value">${summary.ratingFiltered ?? '계산 불가'}</p>
      <p class="stat-label">쿠팡 표시 평점 ${summary.ratingOfficial ?? '없음'}</p>
    </section>
    <section class="stat">
      <p class="stat-label">체험단 비중 ${percent}%</p>
      <div class="bar"><div class="bar-fill" style="width:${percent}%"></div></div>
      <p class="stat-label">리뷰 ${formatCount(summary.total)}개 중 ${formatCount(summary.sponsoredCount)}개</p>
    </section>
    <p class="empty">현재 로드된 리뷰 기준입니다.</p>
  `
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    render(null)
    return
  }
  chrome.runtime.sendMessage({ type: MESSAGES.GET_SUMMARY, tabId: tab.id }, (response) => {
    render(response?.summary ?? null)
  })
}

load()
chrome.tabs.onActivated.addListener(load)
```

- [ ] **Step 8: build.js에 엔트리 추가**

```js
    sidepanel: 'extension/src/sidepanel/index.js',
```

- [ ] **Step 9: manifest에 tabs 권한 추가**

`"permissions"` 를 아래로 교체한다.

```json
  "permissions": ["storage", "sidePanel", "tabs"],
```

- [ ] **Step 10: 실제 확인**

Run: `npm run build`

1. 확장 새로고침 후 쿠팡 상품 페이지를 연다
2. 배너의 "자세히 보기"를 누른다

Expected: 오른쪽에 패널이 열리고 체험단 제외 평점과 비중 막대가 보인다. 앰플리튜드에 `Panel Opened` 가 `trigger: banner` 와 함께 수집된다

- [ ] **Step 11: 커밋**

```bash
git add extension/src/sidepanel/ build.js extension/manifest.json extension/src/background/index.js extension/src/content/banner.js extension/src/content/index.js extension/src/content/content.css
git commit -m "feat: 사이드 패널과 패널 열기 계측"
```

---

## Task 9: 설치, 제거, 오류 추적

**Files:**
- Modify: `extension/src/background/index.js`
- Modify: `extension/src/content/index.js`

**Interfaces:**
- Consumes: `EVENTS`, `track`, `CONFIG`
- Produces: `Extension Installed`, `Extension Removed`, `Extension Error` 수집

- [ ] **Step 1: 설치와 제거 추적 추가**

`extension/src/background/index.js` 맨 아래에 추가한다.

```js
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install') return
  await track(EVENTS.EXTENSION_INSTALLED, {})
  await chrome.storage.local.set({ crf_installed_at: Date.now() })
})

async function setupUninstallTracking() {
  const deviceId = await getDeviceId()
  const url = new URL('/uninstalled', CONFIG.landingOrigin)
  url.searchParams.set('d', deviceId)
  chrome.runtime.setUninstallURL(url.toString())
}

setupUninstallTracking()
```

상단 import 에 `EVENTS` 와 `CONFIG` 를 추가한다.

```js
import { EVENTS } from '../shared/events.js'
import { CONFIG } from '../shared/config.local.js'
```

제거 이벤트는 랜딩의 `/uninstalled` 페이지에서 전송한다. 확장이 이미 사라진 뒤라 확장에서 보낼 수 없다. 이 페이지는 계획 3에서 만든다.

- [ ] **Step 2: 오류 추적 추가**

`extension/src/content/index.js` 의 `render` 함수 전체를 `try` 로 감싼다. `render` 본문 시작에 `try {` 를 넣고, 끝에 아래를 붙인다.

```js
  } catch (error) {
    chrome.runtime.sendMessage({
      type: MESSAGES.TRACK,
      eventType: EVENTS.EXTENSION_ERROR,
      properties: { error_type: error?.name ?? 'Unknown', error_message: String(error?.message ?? '') },
    })
  }
```

- [ ] **Step 3: 셀렉터 실패도 오류로 잡기**

`render` 안의 컨테이너 조회 부분을 아래로 교체한다.

```js
  const container = findReviewContainer(document)
  if (!container) {
    if (isFirst && document.querySelector('[class*="review"], [id*="review"]')) {
      chrome.runtime.sendMessage({
        type: MESSAGES.TRACK,
        eventType: EVENTS.EXTENSION_ERROR,
        properties: { error_type: 'ContainerNotFound' },
      })
    }
    return
  }
```

리뷰 비슷한 게 페이지에 있는데 컨테이너를 못 찾았다면 셀렉터가 깨진 것이다. 이게 쿠팡 마크업 변경을 가장 빨리 알아채는 신호다.

- [ ] **Step 4: 설치 이벤트 확인**

Run: `npm run build`

1. `chrome://extensions` 에서 확장을 **제거**한다
2. 다시 "압축해제된 확장 프로그램을 로드합니다"로 설치한다
3. 앰플리튜드 Live Event Stream 확인

Expected: `Extension Installed` 1건

- [ ] **Step 5: 전체 테스트와 커밋**

Run: `npm test`
Expected: 52개 통과

```bash
git add extension/src/background/index.js extension/src/content/index.js
git commit -m "feat: 설치와 오류 추적"
```

---

## 완료 기준

- [ ] `npm test` 가 52개 테스트를 통과한다
- [ ] 앰플리튜드에서 아래 이벤트가 모두 관측된다

| 이벤트 | 확인 방법 |
|---|---|
| `Extension Installed` | 확장 재설치 |
| `Banner Rendered` | 상품 페이지 열기 |
| `Filter Toggled` | 토글 클릭 |
| `Panel Opened` | 자세히 보기 클릭 |
| `Purchase Intent Clicked` | 장바구니 클릭 |
| `Extension Error` | 셀렉터를 일부러 틀리게 바꿔 확인 후 되돌리기 |

- [ ] 모든 이벤트에 `surface: extension`, `app_version` 이 붙어 있다
- [ ] `config.local.js` 가 커밋되지 않았다 (`git log --all --full-history -- '*config.local.js'` 가 비어 있음)
- [ ] 같은 device_id는 항상 같은 실험 변형을 받는다

---

## 아직 안 된 것

| 항목 | 어디서 |
|---|---|
| `Evidence Expanded`, `Panel Review Scrolled` | 패널에 리뷰 목록을 넣을 때. 계획 3 이후 선택 사항 |
| `Extension Removed` | 계획 3의 `/uninstalled` 페이지 |
| `Onboarding Viewed`, `Onboarding Example Clicked` | 계획 3 |
| 랜딩 이벤트 7개 | 계획 3 |
| device_id 신원 연결 | 계획 3 |
