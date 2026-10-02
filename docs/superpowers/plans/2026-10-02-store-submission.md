# 계획 3a: 웹스토어 제출 준비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확장을 크롬 웹스토어 정책에 맞게 만들어(동의, 최소 수집) 심사에 제출한다.

**Architecture:** 이벤트 전송을 백그라운드의 동의 게이트 한 곳에서 막고, 상품과 리뷰 번호는 기기 밖으로 나가기 전에 솔트 해시로 바꾼다. 설치 직후 확장 내부 온보딩 페이지가 동의를 받고, 사이드 패널에서 언제든 바꿀 수 있다. 제출에 필요한 최소 웹 페이지(처리방침, 제거 페이지)만 먼저 배포하고 본격적인 랜딩은 심사를 기다리는 동안 만든다.

**Tech Stack:** Chrome Extension Manifest V3, plain ES modules, esbuild, Vitest + jsdom, Amplitude HTTP API V2, 정적 사이트(Vercel), sharp(아이콘 PNG 생성), fflate(zip)

**Spec:** `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md`. **11절(2026-10-02 개정: 동의와 최소 수집)이 이 계획의 근거다.** 11절은 3.1, 6.1, 6.2, 6.3, 6.9 의 일부를 대체한다.

**이 계획이 대체하는 문서:** `docs/superpowers/plans/2026-09-28-landing-and-release.md` (계획 1 직후에 쓰여 현재 코드와 맞지 않는다. 실행하지 않는다)

## 순서의 원칙

웹스토어 심사는 1~2주 걸리고 그동안 사용자를 받을 수 없다. 그래서 순서는 이렇다.

1. **계획 3a (이 문서)**: 제출에 필요한 것만 만들고 제출한다
2. **계획 3b**: 심사를 기다리는 동안 본격적인 랜딩을 만든다 (문서 끝의 로드맵)
3. **계획 3c**: 대시보드와 분석 (문서 끝의 로드맵)

**확장 패키지에 들어가는 것은 제출 전에 확정해야 한다.** 바꾸려면 다시 심사를 받는다. 웹 페이지는 언제든 다시 배포할 수 있다. 그래서 확장이 여는 주소(처리방침, 제거 페이지)와 확장 안의 화면(온보딩, 동의)은 3a 에서 끝내고, 랜딩의 내용은 3b 로 미룬다.

3b 와 3c 는 지금 상세히 쓰지 않는다. 계획 2 와 옛 계획 3 을 미리 써 뒀다가 코드가 바뀌어 전부 다시 쓴 경험 때문이다. 각 계획은 시작할 때 그 시점의 코드를 보고 쓴다.

## 이 프로젝트의 계획 작성 방식

태스크마다 **결정, 인터페이스, 정확한 문구, 필수 테스트, 필수 변이**를 적는다. 구현 코드 전문은 정확성이 중요한 곳(해시, 게이트, 매니페스트, 패키지 허용 목록)에만 싣는다. 계획 2 에서 코드 전문을 미리 적어 둔 것이 낡은 함정의 출처였고, 결정 수준의 브리프와 변이 테스트로 일한 쪽이 결함이 적었다.

컨트롤러는 태스크를 보내기 전에 현재 코드를 읽고 이 문서의 해당 절을 브리프로 옮긴다. 코드와 이 문서가 어긋나면 코드가 우선이고, 어긋난 점을 원장에 Ruling 으로 남긴다.

## Global Constraints

- **`granted` 일 때만 이벤트를 보낸다.** `denied` 와 `undecided` 에서는 네트워크 요청이 0건이고 이벤트를 쌓아 두지도 않는다 (명세 11.2)
- 쿠팡 상품 번호와 리뷰 번호 원문은 기기 밖으로 나가지 않는다. 솔트 해시(`product_key`, `page_key`)만 보낸다 (명세 11.3)
- 리뷰 본문을 이벤트 프로퍼티에 담지 않는다
- 확장의 기능(배지, 숨기기, 배너, 패널)은 동의와 무관하게 전부 동작한다
- 모든 네트워크 요청은 백그라운드 서비스 워커에서만 한다. 콘텐츠 스크립트, 사이드 패널, 온보딩 페이지는 `chrome.runtime.sendMessage` 로만 요청한다
- 매니페스트 `permissions` 는 정확히 `["storage", "sidePanel"]`. `host_permissions`, `tabs`, `web_accessible_resources` 를 추가하지 않는다. 콘텐츠 스크립트의 `matches` 는 `https://www.coupang.com/vp/products/*` 하나뿐이다
- 앰플리튜드 API 키는 `extension/src/shared/config.local.js` 에만 둔다(gitignore). 열지 않고, 출력하지 않고, 커밋하지 않는다. 사이트의 키와 연락처 이메일은 빌드 시 환경 변수로 넣고 커밋하지 않는다
- 이벤트 이름은 `shared/events.js` 의 `EVENTS`, 메시지 이름은 `shared/messages.js` 의 `MESSAGES` 로만 참조한다
- 실험 배정은 `device_id` 기반 결정적 해시이고 `assignAll` 한 곳에서 계산한다. 공통 프로퍼티는 이벤트 프로퍼티가 덮어쓸 수 없다
- 관측(`pagesSeen`, `Banner Rendered`)은 관측 키가 바뀔 때만. 다시 그리기는 관측하지 않는다
- 확장 코드에 innerHTML 을 쓰지 않는다. DOM 은 `createElement` 와 `textContent` 로 만든다
- 사용자에게 보이는 모든 문구는 한국어로 쓰고 엠대시(—)와 가운데 점(·)을 쓰지 않는다. 코드 주석, 문서, 커밋 메시지도 같다
- 커밋 메시지는 conventional commits, 설명은 한국어. `Co-Authored-By` 같은 attribution 줄을 붙이지 않는다
- 모든 태스크는 TDD 로 하고 지정된 변이를 적용해 테스트가 실패함을 확인한 뒤 원복한다. 변이가 실패하지 않으면 테스트를 고친다
- 테스트의 쿠팡 마크업은 실측 원문을 쓴다. 줄여 쓰지 않는다
- 새 `debugLog` 호출부에는 `/* @__PURE__ */` 주석을 단다
- 사용자 터미널은 Windows PowerShell 5.1 이다. 문서의 명령 예시에 `&&` 를 쓰지 않는다

## 사용자 결정 (기록)

| 항목 | 결정 | 시점 |
|---|---|---|
| 수집 방식 | 동의 화면 + 최소 수집 | 2026-10-02 확정 |
| 확장 이름 | `체험단 리뷰 제거기` (쿠팡 상표를 이름에 넣지 않는다. 쿠팡용이라는 점은 요약과 설명에서 밝힌다) | 2026-10-02 확정 |
| 온보딩 화면 디자인 | 시각 시안 2개 중 선택 | Task 4 전에 사용자 확인 |
| 아이콘 디자인 | 시각 시안 3개 중 선택 | Task 7 전에 사용자 확인 |
| 사이트 주소 | Vercel 무료 주소 | Task 10 에서 확정 |
| 처리방침에 적을 연락처 이메일 | 사용자가 정함(공개되는 주소) | Task 10 |
| 개발자 등록(1회 5달러)과 제출 | 사용자가 직접 | Task 10 |

## 파일 구조

```
extension/
  manifest.json                    수정: 이름, 설명, 버전 1.0.0, 아이콘
  icons/icon.svg, icon-{16,32,48,128}.png   새로 만듦
  src/
    background/
      consent.js                   새로 만듦: 동의 상태 저장과 판정
      pseudonym.js                 새로 만듦: 솔트 해시
      analytics.js                 수정: 동의 게이트, 식별자 치환
      lifecycle.js                 수정: 설치 시 온보딩 열기, 제거 주소의 동의 연동
      index.js                     수정: 동의 메시지 처리
    onboarding/
      index.html, style.css        새로 만듦
      view.js                      새로 만듦: 순수 렌더 함수
      index.js                     새로 만듦: 배선
    sidepanel/
      view.js, index.js            수정: 동의 토글
    shared/
      site.js                      새로 만듦: 공개 설정(사이트 주소, 경로, 예시 상품)
      events.js, messages.js       수정
    core/experiment.js             수정: onboarding_example 실험
site/
  public/index.html, privacy.html, uninstalled.html, style.css
  src/analytics.js, uninstalled.js
  build.js
vercel.json                        저장소 최상위: cleanUrls, 빌드 명령, 출력 폴더
scripts/
  build-icons.js                   SVG 에서 PNG 4종 생성
  package.js                       release 빌드 후 zip
docs/store/listing.md              스토어 등록 자료
tests/                             태스크별 테스트
```

---

## Task 1: 동의 상태와 전송 게이트

**Files:**
- Create: `extension/src/background/consent.js`, `tests/consent.test.js`
- Modify: `extension/src/background/analytics.js`, `extension/src/background/index.js`, `extension/src/background/lifecycle.js`, `extension/src/shared/messages.js`, `tests/messages.test.js`, `tests/install.test.js`, `tests/helpers/chrome-mock.js`

**Interfaces:**
- Consumes: `track(eventType, properties)` (`analytics.js`), `getInstalledAt()` (`identity.js`), `configureUninstallUrl()` (`lifecycle.js`), `EVENTS.EXTENSION_INSTALLED`
- Produces:
  - `consent.js`: `CONSENT = { GRANTED: 'granted', DENIED: 'denied', UNDECIDED: 'undecided' }`, `CONSENT_KEY = 'crf_consent'`
  - `getConsent(): Promise<{ status, decidedAt }>` 저장값이 없으면 `{ status: 'undecided', decidedAt: null }`
  - `setConsent(status, now = Date.now()): Promise<{ status, decidedAt, firstGrant }>` `firstGrant` 는 이 호출이 이 설치의 첫 `granted` 일 때만 true
  - `isCollectionAllowed(): Promise<boolean>`
  - `MESSAGES.GET_CONSENT = 'crf:get-consent'`, `MESSAGES.SET_CONSENT = 'crf:set-consent'`
  - 메시지 계약: `{ type: GET_CONSENT }` → `{ consent: { status, decidedAt } }`. `{ type: SET_CONSENT, status, source }` → `{ consent }` 또는 `{ error: 'invalid' }`

**결정:**

- 저장 위치는 `chrome.storage.local`, 값은 `{ status, decidedAt, everGranted }`. `everGranted` 는 한 번 true 가 되면 내려가지 않는다(껐다 켜도 `Extension Installed` 는 한 번).
- `analytics.track` 은 API 키 검사 직후 `isCollectionAllowed()` 를 확인하고 false 면 **조용히** 반환한다. 경고를 찍지 않는다(미동의는 정상 상태다). 저장소를 읽지 못하면 보내지 않는다(실패 시 닫힘).
- `SET_CONSENT` 는 `status` 가 `granted` 또는 `denied` 일 때만 받는다. `source` 는 `onboarding` 또는 `panel` 만 받고 그 밖은 `unknown` 으로 기록한다.
- `SET_CONSENT` 는 **확장 페이지에서 온 메시지만** 받는다. 콘텐츠 스크립트(쿠팡 페이지 안에서 도는 코드)가 동의를 바꿀 수 없어야 한다. 판정: `sender.url` 이 `chrome.runtime.getURL('')` 로 시작해야 한다. 아니면 `{ error: 'invalid' }` 로 응답하고 상태를 바꾸지 않는다.
- 첫 동의(`firstGrant`)에 `track(EVENTS.EXTENSION_INSTALLED, { consent_source, seconds_since_install })` 를 보낸다. `seconds_since_install` 은 `getInstalledAt()` 기준 반올림 초, 설치 시각이 없으면 `null`.
- 동의가 바뀔 때마다 `configureUninstallUrl()` 을 다시 부른다(Task 3 에서 동의에 따라 주소가 달라진다).
- `lifecycle.handleInstalled` 에서 `track(EXTENSION_INSTALLED)` 호출을 **없앤다**. 설치 순간에는 동의가 없다.
- 응답은 항상 보낸다. 비동기 응답이므로 리스너는 `true` 를 반환하고, 실패 경로에서도 `sendResponse` 를 정확히 한 번 부른다(기존 `GET_SUMMARY` 의 `.then(onOk, onErr)` 와 뒤따르는 `.catch` 구조를 따른다).

게이트의 모양(정확성이 중요한 부분):

```js
// analytics.js 의 track 안, 키 검사 바로 다음
if (!(await isCollectionAllowed())) return
```

```js
// consent.js
export async function isCollectionAllowed() {
  try {
    return (await getConsent()).status === CONSENT.GRANTED
  } catch {
    return false
  }
}
```

**필수 테스트:**

- [ ] `getConsent`: 저장값 없음 → `undecided`. `setConsent('granted')` 후 → `granted` 와 시각
- [ ] `setConsent`: 첫 `granted` 는 `firstGrant: true`. `denied` 후 다시 `granted` 는 `firstGrant: false`. 워커 재시작(`vi.resetModules` 후 재 import, storage 유지) 뒤에도 `firstGrant: false`
- [ ] `track`: `undecided` 에서 fetch 0회, `denied` 에서 0회, `granted` 에서 1회. `granted` → `denied` 로 바꾼 뒤 0회
- [ ] `track`: 동의 저장소 읽기가 실패하면 fetch 0회
- [ ] `SET_CONSENT`: 확장 페이지 발신(`sender.url` 이 확장 주소) `granted` → 상태 변경, `Extension Installed` 1건, 프로퍼티 `consent_source`, `seconds_since_install`
- [ ] `SET_CONSENT`: 껐다가 다시 켜도 `Extension Installed` 는 총 1건
- [ ] `SET_CONSENT`: 콘텐츠 스크립트 발신(`sender.tab` 있고 `sender.url` 이 `https://www.coupang.com/...`) → `{ error: 'invalid' }`, 상태 불변
- [ ] `SET_CONSENT`: `status: 'maybe'` → `{ error: 'invalid' }`, 상태 불변
- [ ] `handleInstalled`: reason `install` 에서 fetch 0회(설치만으로는 아무것도 보내지 않는다)
- [ ] `tests/messages.test.js` 의 전체 값 고정 테스트에 새 메시지 2개 반영
- [ ] 기존 테스트 중 이벤트 전송을 기대하는 것들은 테스트 준비 단계에서 동의를 `granted` 로 둔다. 공통 헬퍼(`tests/helpers/chrome-mock.js` 에 `grantConsent()` 류)를 만들어 쓴다

**필수 변이:**

- [ ] C1: `track` 의 게이트를 지운다 → 미동의 fetch 0회 테스트 실패
- [ ] C2: `isCollectionAllowed` 가 `undecided` 도 허용 → `undecided` 테스트 실패
- [ ] C3: 저장소 실패 시 true 반환 → 실패 시 닫힘 테스트 실패
- [ ] C4: `firstGrant` 를 매 `granted` 마다 true → 재동의 1건 테스트 실패
- [ ] C5: 발신자 검사를 지운다 → 콘텐츠 스크립트 발신 테스트 실패

- [ ] **Commit:** `feat: 동의한 경우에만 이벤트를 보내는 게이트와 동의 메시지 추가`

---

## Task 2: 식별자 최소화

**Files:**
- Create: `extension/src/background/pseudonym.js`, `tests/pseudonym.test.js`
- Modify: `extension/src/background/analytics.js`, `tests/analytics-track.test.js`

**Interfaces:**
- Consumes: `track` 에 들어오는 `properties` 의 `product_id`, `page_first_review_id`(콘텐츠가 TRACK 메시지에 싣는 값. 콘텐츠 코드는 바꾸지 않는다)
- Produces:
  - `pseudonym.js`: `SALT_KEY = 'crf_salt'`, `pseudonymize(value): Promise<string | null>` (16자리 소문자 hex. `value` 가 `null` 또는 `undefined` 면 `null`)
  - 전송되는 프로퍼티 이름: `product_key`, `page_key`. 원문 키 `product_id`, `page_first_review_id` 는 전송 페이로드에 **존재하지 않는다**

**결정:**

- 솔트는 설치마다 무작위 32바이트(hex 64자), `chrome.storage.local` 의 `crf_salt`. 처음 필요할 때 만들고, `identity.js` 의 `getDeviceId` 처럼 진행 중 Promise 를 공유해 동시 호출이 솔트를 둘 만들지 않게 한다.
- 해시는 `crypto.subtle.digest('SHA-256', utf8(`${salt}:${value}`))` 의 앞 8바이트를 hex 16자로.
- 치환은 백그라운드 `track` 에서, 페이로드를 만들기 직전에 한다. 콘텐츠는 지금처럼 원문을 메시지에 싣는다(메시지는 확장 안에서만 오간다).
- 치환 대상은 표로 둔다. 새 식별자가 생기면 표에 한 줄 추가한다.

```js
// analytics.js
const PSEUDONYMIZED = { product_id: 'product_key', page_first_review_id: 'page_key' }

async function minimize(properties) {
  const result = { ...properties }
  for (const [rawKey, safeKey] of Object.entries(PSEUDONYMIZED)) {
    if (!(rawKey in result)) continue
    const raw = result[rawKey]
    delete result[rawKey]
    try {
      result[safeKey] = await pseudonymize(raw)
    } catch {
      result[safeKey] = null
    }
  }
  return result
}
```

- 해시가 실패하면 `null` 을 보낸다. **어떤 경우에도 원문을 보내지 않는다.**
- `review_sort`, 개수, 비율 같은 다른 프로퍼티는 그대로 둔다.

**필수 테스트:**

- [ ] `pseudonymize`: 같은 입력은 같은 값, 다른 입력은 다른 값, 결과는 `/^[0-9a-f]{16}$/`
- [ ] 저장소를 비우고 모듈을 다시 불러오면(다른 설치) 같은 입력이 다른 값이 된다
- [ ] 워커 재시작(storage 유지) 뒤에는 같은 값
- [ ] 동시 두 호출이 솔트를 하나만 만든다(`storage.local.set` 의 솔트 저장 1회)
- [ ] `null`, `undefined` 입력은 `null`
- [ ] `track(EVENTS.BANNER_RENDERED, { product_id: '7590830589', page_first_review_id: '1020990898', review_sort: 'best' })` 의 fetch 본문: `product_key` 와 `page_key` 가 16자리 hex, `product_id` 와 `page_first_review_id` 키가 없음, **본문 문자열 전체에 `7590830589` 와 `1020990898` 이 부분 문자열로도 없음**, `review_sort` 는 그대로
- [ ] `pseudonymize` 가 던지면 `product_key: null` 이고 본문에 원문이 없음
- [ ] `product_id` 가 없는 이벤트(`Panel Opened`)는 `product_key` 키가 생기지 않음

**필수 변이:**

- [ ] P1: `minimize` 를 통과시키지 않고 원문 그대로 → 본문 부분 문자열 테스트 실패
- [ ] P2: 솔트 없이 해시 → 다른 설치 테스트 실패
- [ ] P3: 실패 시 원문을 그대로 둠 → 실패 경로 테스트 실패
- [ ] P4: 원문 키를 지우지 않음(키 둘 다 전송) → 키 부재 테스트 실패

- [ ] 명세 6.2 표의 `product_id` 행과 6.3 의 `page_first_review_id` 옆에 "11.3절에 따라 `product_key`, `page_key` 로 전송" 한 줄을 덧붙인다
- [ ] **Commit:** `feat: 상품과 리뷰 번호를 솔트 해시로 바꿔 전송`

---

## Task 3: 공개 설정 분리와 제거 주소의 동의 연동

**Files:**
- Create: `extension/src/shared/site.js`, `tests/site-settings.test.js`
- Modify: `extension/src/background/lifecycle.js`, `tests/install.test.js`, `extension/src/shared/config.example.js`, `README.md`

**Interfaces:**
- Consumes: `getConsent()` (Task 1)
- Produces:
  - `site.js`: `SITE = { landingOrigin, privacyPath: '/privacy', uninstallPath: '/uninstalled', exampleProductUrl }`, `isLandingConfigured(origin)` (lifecycle.js 에서 옮겨 오고 lifecycle.js 는 다시 내보내지 않는다), `privacyUrl(): string | null`
  - `buildUninstallUrl({ origin, version, deviceId, installedAt })`: `deviceId` 와 `installedAt` 이 `null` 이면 그 쿼리를 싣지 않는다

**결정:**

- 사이트 주소는 비밀이 아니다. 지금은 gitignore 된 `config.local.js` 의 `landingOrigin` 에 있어 컨트롤러가 바꿀 수 없고 제출용 빌드에 실수로 빠질 수 있다. 커밋되는 `shared/site.js` 로 옮긴다. `config.local.js` 에는 키와 엔드포인트만 남는다(`config.example.js` 에서 `landingOrigin` 을 지우고 README 안내를 고친다. 사용자의 `config.local.js` 에 남은 `landingOrigin` 은 쓰이지 않을 뿐 해가 없다).
- 초기값: `landingOrigin: 'https://example.com'`(미설정 자리표시자, Task 10 에서 실제 주소로 바꾼다), `exampleProductUrl: 'https://www.coupang.com/vp/products/7590830589'`.
- 제거 주소: 사이트가 설정돼 있으면 항상 설정한다. 쿼리 `v`(버전)는 항상, `d`(기기 번호)와 `i`(설치 시각)는 **동의가 `granted` 일 때만** 싣는다. 동의하지 않은 사용자가 확장을 지우면 제거 페이지는 열리지만 누구인지 알 수 없다.
- `configureUninstallUrl` 의 직렬화(Promise 체인)는 그대로 둔다.
- `privacyUrl()` 은 사이트가 설정돼 있으면 `origin + privacyPath`, 아니면 `null`.

**필수 테스트:**

- [ ] `isLandingConfigured`: 기존 테스트를 새 위치로 옮긴다(example.com, 하위 도메인, 빈 값, 파싱 불가, 정상 주소)
- [ ] 제거 주소: `granted` → `d`, `v`, `i` 모두. `denied` → `v` 만. `undecided` → `v` 만
- [ ] 동의를 `granted` 에서 `denied` 로 바꾸면(SET_CONSENT) 마지막 `setUninstallURL` 인자에 `d` 가 없다
- [ ] `privacyUrl`: 설정됨과 미설정
- [ ] 사이트 미설정이면 `setUninstallURL` 미호출(기존 동작 유지)

**필수 변이:**

- [ ] U1: 동의와 무관하게 `d` 를 싣는다 → `denied` 테스트 실패
- [ ] U2: 동의 변경 시 재설정을 지운다 → 변경 테스트 실패

- [ ] **Commit:** `refactor: 사이트 주소를 공개 설정으로 옮기고 제거 주소의 기기 번호를 동의에 묶음`

---

## Task 4: 온보딩 페이지

**사전 단계(컨트롤러):** 화면 시안 2개를 사용자에게 시각적으로 보여 주고 고르게 한다. 고른 시안의 배치를 브리프에 적는다. 문구는 아래 것을 쓴다.

**Files:**
- Create: `extension/src/onboarding/index.html`, `extension/src/onboarding/style.css`, `extension/src/onboarding/view.js`, `extension/src/onboarding/index.js`, `tests/onboarding-view.test.js`, `tests/onboarding.test.js`
- Modify: `build.js`(엔트리 `onboarding`), `extension/src/background/lifecycle.js`, `extension/src/shared/events.js`, `extension/src/core/experiment.js`, `tests/events.test.js`, `tests/experiment.test.js`, `tests/install.test.js`, `tests/helpers/chrome-mock.js`

**Interfaces:**
- Consumes: `MESSAGES.GET_CONSENT`, `MESSAGES.SET_CONSENT`, `MESSAGES.GET_VARIANT`, `MESSAGES.TRACK`, `SITE.exampleProductUrl`, `privacyUrl()`
- Produces:
  - `EVENTS.ONBOARDING_VIEWED = 'Onboarding Viewed'`, `EVENTS.ONBOARDING_EXAMPLE_CLICKED = 'Onboarding Example Clicked'`
  - `EXPERIMENTS.ONBOARDING_EXAMPLE = { id: 'onboarding_example', variants: ['show', 'hide'] }` (공통 프로퍼티 `exp_onboarding_example` 이 모든 이벤트에 자동으로 붙는다)
  - `view.js`: `renderOnboarding(root, { status, showExample, exampleUrl, privacyUrl, onChoose, onExample })` 순수 렌더 함수. `onChoose('granted' | 'denied')`
  - 온보딩 페이지 주소: `chrome.runtime.getURL('src/onboarding/index.html')`

**결정:**

- 설치(`reason === 'install'`) 직후 `handleInstalled` 가 `chrome.tabs.create({ url })` 로 온보딩을 연다. `tabs.create` 는 `tabs` 권한 없이 동작한다. 실패는 경고로 삼킨다. 순서: 설치 시각 저장 → 제거 주소 설정 → 온보딩 열기.
- 페이지는 로드 시 `GET_CONSENT` 와 `GET_VARIANT` 를 묻고 그린다. 응답이 없어도 기본 상태(`undecided`, 예시 링크 표시)로 그린다. 렌더가 메시징에 의존하지 않는다.
- `동의하고 시작` → `SET_CONSENT { status: 'granted', source: 'onboarding' }` → 완료 상태로 다시 그림 → `TRACK Onboarding Viewed` 를 **그 페이지 로드에서 한 번만** 보낸다(동의 전에는 보내지 않는다. 보내도 게이트가 막지만 페이지에서도 보내지 않는다).
- `통계 없이 사용` → `SET_CONSENT { status: 'denied', source: 'onboarding' }` → 완료 상태. 아무것도 보내지 않는다.
- 이미 선택한 상태로 페이지를 다시 열면 현재 상태와 바꾸기 버튼을 보여 준다.
- 예시 링크는 `exp_onboarding_example` 이 `show` 일 때만 보인다. 클릭 시 `TRACK Onboarding Example Clicked`(동의한 경우만 전송된다), 새 탭으로 연다(`target="_blank"`, `rel="noopener"`).
- `SET_CONSENT` 응답이 `{ error }` 거나 실패하면 화면에 `설정을 저장하지 못했습니다. 다시 시도해 주세요.` 를 보여 주고 선택 전 상태를 유지한다.
- DOM 은 `createElement` 와 `textContent` 로만 만든다.

**화면 문구(그대로 쓴다):**

```
제목: 설치가 끝났습니다
설명: 쿠팡 상품 페이지의 리뷰 영역에서 자동으로 동작합니다.

사용 방법
1. 쿠팡에서 상품 페이지를 엽니다
2. 리뷰까지 내려가면 체험단 리뷰 비중과 체험단을 뺀 평점이 보입니다
3. 버튼을 누르면 체험단 리뷰를 숨기고, 다시 누르면 다시 볼 수 있습니다

예시 링크(show 변형만): 예시 상품에서 바로 확인하기

동의 제목: 익명 사용 통계를 보내 주시겠어요?
동의 설명: 이 확장이 제대로 동작하는지, 어떤 화면이 더 도움이 되는지 확인하는 데만 씁니다. 동의하지 않아도 모든 기능을 쓸 수 있습니다.

보내는 것
- 배너가 뜬 횟수, 체험단 리뷰 비중과 평점 같은 숫자
- 숨기기 버튼, 패널, 장바구니와 바로구매 버튼을 눌렀는지
- 리뷰 정렬 방식(베스트순, 최신순)
- 무작위로 만든 익명 기기 번호

보내지 않는 것
- 리뷰 내용, 상품 이름, 상품 주소
- 쿠팡 계정, 이름, 이메일, 결제 정보
- 쿠팡 상품 페이지 밖의 어떤 정보도

보충 1: 어떤 상품을 봤는지는 저희도 알 수 없습니다. 상품 번호는 이 기기 밖에서는 원래 번호로 되돌릴 수 없는 값으로 바꿔 보냅니다.
보충 2: 통계는 분석 도구 Amplitude(미국 서버)에 저장됩니다. 광고나 판매에 쓰지 않습니다. 개인을 알 수 없는 집계 결과는 공개할 수 있습니다.

버튼: 동의하고 시작 / 통계 없이 사용
처리방침 링크(사이트가 설정된 경우만): 개인정보 처리방침

완료(동의): 익명 통계를 보내도록 설정했습니다. 확장 패널에서 언제든 끌 수 있습니다.
완료(거절): 통계를 보내지 않도록 설정했습니다. 확장 패널에서 언제든 켤 수 있습니다.
완료 상태의 바꾸기 버튼: 설정 바꾸기
```

두 버튼은 같은 크기와 같은 눈에 띄는 정도로 만든다. 거절을 작게 숨기지 않는다.

**필수 테스트:**

- [ ] `renderOnboarding`: `undecided` 에서 두 버튼과 "보내는 것", "보내지 않는 것" 목록(항목 수와 문자열), innerHTML 미사용(구조 가드: 소스 파일에 `innerHTML` 문자열이 없음)
- [ ] `showExample: false` 면 예시 링크 없음, `true` 면 `exampleUrl` 로 가는 링크
- [ ] `privacyUrl: null` 이면 처리방침 링크 없음
- [ ] `granted`, `denied` 완료 상태의 문구와 `설정 바꾸기` 버튼
- [ ] 배선: 로드 시 `GET_CONSENT`, `GET_VARIANT` 요청. 응답 없이도 기본 상태로 그려짐
- [ ] 배선: `동의하고 시작` 클릭 → `SET_CONSENT { status: 'granted', source: 'onboarding' }` 1건, 그 뒤 `TRACK Onboarding Viewed` 정확히 1건. 클릭 전에는 TRACK 0건
- [ ] 배선: `통계 없이 사용` 클릭 → `SET_CONSENT { status: 'denied', ... }` 1건, TRACK 0건
- [ ] 배선: `SET_CONSENT` 가 `{ error: 'invalid' }` → 오류 문구, 두 버튼 유지, TRACK 0건
- [ ] 배선: 예시 링크 클릭 → `TRACK Onboarding Example Clicked` 1건
- [ ] `handleInstalled`: reason `install` → `tabs.create` 가 온보딩 주소로 1회. reason `update` → 0회. `tabs.create` 가 던져도 예외가 밖으로 새지 않음
- [ ] `EVENTS` 전체 값 고정 테스트를 11개로 갱신. `EXPERIMENTS` 추가에 따른 독립성 테스트(세 실험 쌍의 배정 일치율이 50% 근처)

**필수 변이:**

- [ ] O1: 로드 시 바로 `Onboarding Viewed` 전송 → 클릭 전 TRACK 0건 테스트 실패
- [ ] O2: `통계 없이 사용` 이 `granted` 를 보냄 → 거절 테스트 실패
- [ ] O3: 오류 응답을 무시하고 완료 상태로 → 오류 테스트 실패
- [ ] O4: `showExample` 을 무시하고 항상 링크 표시 → 숨김 테스트 실패
- [ ] O5: `handleInstalled` 가 `update` 에서도 온보딩을 엶 → update 테스트 실패

- [ ] 실브라우저 확인(사용자): 확장을 제거하고 다시 로드 → 온보딩 탭이 열림 → 고르기 전에는 서비스 워커 Network 에 `httpapi` 0건 → `동의하고 시작` 후 `Extension Installed`, `Onboarding Viewed` 도착
- [ ] **Commit:** `feat: 설치 직후 동의를 받는 온보딩 페이지`

---

## Task 5: 사이드 패널의 동의 토글

**Files:**
- Modify: `extension/src/sidepanel/view.js`, `extension/src/sidepanel/index.js`, `extension/src/sidepanel/style.css`, `tests/sidepanel-view.test.js`, `tests/sidepanel.test.js`

**Interfaces:**
- Consumes: `MESSAGES.GET_CONSENT`, `MESSAGES.SET_CONSENT`, `privacyUrl()`, 온보딩 주소
- Produces: `view.js` 의 `renderConsent(container, { status, privacyUrl, onChange, onLearnMore })`. `onChange('granted' | 'denied')`

**결정:**

- 패널 맨 아래에 동의 구역을 둔다. 요약 렌더(`renderPanel`)와 **별도 컨테이너**에 그려서, 요약이 실시간 갱신될 때 동의 구역이 지워지지 않게 한다(`index.html` 에 컨테이너를 하나 더 둔다).
- 상태별 표시:
  - `granted`: `익명 사용 통계를 보내고 있습니다` + 버튼 `보내지 않기`
  - `denied`: `익명 사용 통계를 보내지 않습니다` + 버튼 `보내기`
  - `undecided`: `익명 사용 통계를 보낼지 아직 고르지 않았습니다` + 버튼 `자세히 보고 고르기` (온보딩 페이지를 `chrome.tabs.create` 로 연다)
- 버튼 클릭 → `SET_CONSENT { status, source: 'panel' }` → 응답의 상태로 다시 그림. 실패하면 `설정을 저장하지 못했습니다. 다시 시도해 주세요.` 를 보여 주고 이전 상태 유지.
- 패널이 로드될 때 보내는 `Panel Opened` 는 그대로다(동의가 없으면 게이트가 막는다).
- 처리방침 링크는 사이트가 설정된 경우만.

**필수 테스트:**

- [ ] `renderConsent`: 세 상태의 문구와 버튼 문구
- [ ] `보내지 않기` 클릭 → `onChange('denied')`, `보내기` 클릭 → `onChange('granted')`, `자세히 보고 고르기` → `onLearnMore`
- [ ] 배선: 로드 시 `GET_CONSENT`, 버튼 클릭 시 `SET_CONSENT { source: 'panel' }`, 응답 상태로 다시 그려짐
- [ ] 배선: `SUMMARY_UPDATED` 로 요약이 갱신돼도 동의 구역이 그대로 남아 있음
- [ ] 배선: `SET_CONSENT` 실패 → 오류 문구, 이전 상태 유지

**필수 변이:**

- [ ] V1: 버튼이 반대 상태를 보냄 → 클릭 테스트 실패
- [ ] V2: 동의 구역을 요약과 같은 컨테이너에 그림 → 갱신 뒤 유지 테스트 실패
- [ ] V3: 실패해도 새 상태로 그림 → 실패 테스트 실패

- [ ] **Commit:** `feat: 사이드 패널에서 익명 통계 전송을 켜고 끔`

---

## Task 6: 최소 사이트 (처리방침, 제거 페이지)

**Files:**
- Create: `site/public/index.html`, `site/public/privacy.html`, `site/public/uninstalled.html`, `site/public/style.css`, `site/src/analytics.js`, `site/src/uninstalled.js`, `site/build.js`, `vercel.json`(저장소 최상위), `tests/site-analytics.test.js`, `tests/site-uninstalled.test.js`
- Modify: `package.json`(스크립트 `build:site`), `.gitignore`(`site/public/assets/`), `README.md`

**Interfaces:**
- Consumes: 제거 주소 쿼리 `d`(기기 번호, 동의한 경우만), `v`(버전), `i`(설치 시각 ms, 동의한 경우만)
- Produces:
  - 주소: `/privacy`, `/uninstalled`. 저장소 최상위 `vercel.json`: `{ "cleanUrls": true, "buildCommand": "node site/build.js --release", "outputDirectory": "site/public" }` (esbuild 가 최상위 `package.json` 에 있어 프로젝트 루트는 저장소 최상위로 둔다)
  - `site/src/analytics.js`: `buildSiteEvent({ apiKey, deviceId, eventType, properties, appVersion, now, insertId })` 순수 함수, `sendSiteEvent(payload)`
  - `site/src/uninstalled.js`: `parseUninstallParams(search): { deviceId, version, installedAt }` (형식이 틀린 값은 `null`), `daysSince(installedAt, now)`
  - 이벤트: `Extension Removed`(프로퍼티 `days_since_install`, `surface: 'site'`), `Removal Reason Selected`(프로퍼티 `reason`)

**결정:**

- 사이트는 빌드 단계가 있는 정적 사이트다. `site/build.js` 가 esbuild 로 `site/src/*.js` 를 `site/public/assets/` 에 묶고 `define` 으로 `__AMPLITUDE_KEY__`, `__AMPLITUDE_ENDPOINT__`, `__CONTACT_EMAIL__` 을 넣는다. 값은 환경 변수 `AMPLITUDE_API_KEY`, `CONTACT_EMAIL` 에서 읽는다. **키와 이메일은 저장소에 커밋하지 않는다.**
- `node site/build.js --release` 는 두 환경 변수 중 하나라도 없으면 실패한다(문의처 없는 처리방침이나 계측이 꺼진 제거 페이지를 실수로 배포하지 않게). 인자 없이 실행하면 없는 값은 빈 문자열이고 계측은 꺼진다.
- 처리방침의 시행일은 Task 10 에서 배포일로 채운다(그 전까지 본문에 `시행일: 배포 시 기재` 로 둔다). 처리방침의 연락처는 `privacy.html` 의 빈 요소에 `assets/contact.js` 가 `__CONTACT_EMAIL__` 을 `textContent` 로 채운다.
- 제거 페이지: `d` 가 있으면(동의했던 사용자) `Extension Removed` 를 한 번 보낸다. `d` 가 없으면 **아무것도 보내지 않는다.** 화면은 같다.
- 입력 검증(시스템 경계): `d` 는 UUID 형식(`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), `v` 는 `/^\d+\.\d+\.\d+$/`, `i` 는 양의 정수이고 현재보다 과거. 틀리면 그 값은 `null` 로 본다. `d` 가 `null` 이면 전송하지 않는다.
- 제거 사유 버튼 4개: `체험단 리뷰가 잘 안 걸러져요`, `쿠팡 화면이 이상해져요`, `쓸 일이 별로 없어요`, `기타`. 값은 `detection`, `layout`, `rarely_used`, `other`. `d` 가 있을 때만 `Removal Reason Selected` 를 보내고, 누른 뒤에는 `알려 주셔서 감사합니다` 로 바꾼다. 한 번만 받는다.
- 이벤트 모양은 확장과 같은 앰플리튜드 HTTP API V2 페이로드다. `device_id = d`, `platform: 'Web'`, `app_version = v`, `session_id = 페이지 로드 시각`, `insert_id = crypto.randomUUID()`. `event_properties.surface = 'site'`.
- `index.html` 은 임시 첫 화면이다: 이름, 한 줄 설명, `곧 크롬 웹스토어에서 만나요`, 처리방침 링크. 본격적인 랜딩은 계획 3b.
- 세 페이지 모두 모바일 폭에서 읽을 수 있어야 한다(좌우 여백 16px, 가로 스크롤 없음).

**처리방침 본문(`privacy.html`, 그대로 쓴다. 날짜는 배포일로):**

```
개인정보 처리방침

체험단 리뷰 제거기(이하 "확장")이 어떤 정보를 다루는지 설명합니다.

1. 확장이 하는 일
쿠팡 상품 페이지의 리뷰 영역에서 체험단 제공 리뷰를 찾아 표시하고, 숨기고, 체험단 리뷰를 뺀 평점을 보여 줍니다. 이 작업은 모두 사용자의 브라우저 안에서 이뤄집니다. 리뷰 내용은 어디로도 전송되지 않습니다.

2. 동의한 경우에만 보내는 익명 통계
설치 직후 화면에서 "동의하고 시작"을 고른 경우에만 아래 정보를 보냅니다. 동의하지 않으면 아무것도 보내지 않으며, 모든 기능은 그대로 쓸 수 있습니다.
- 배너가 표시된 횟수, 체험단 리뷰의 개수와 비중, 평점 같은 숫자
- 숨기기 버튼, 패널, 장바구니와 바로구매 버튼을 눌렀는지
- 리뷰 정렬 방식(베스트순, 최신순)
- 무작위로 만든 익명 기기 번호, 확장 버전
- 화면 문구와 기본 설정의 실험 그룹
- 확장에서 오류가 났는지와 오류의 종류

3. 보내지 않는 것
- 리뷰 내용, 상품 이름, 상품 주소
- 쿠팡 계정, 이름, 이메일, 주소, 결제 정보
- 쿠팡 상품 페이지 밖에서의 어떤 활동도
상품 번호와 리뷰 번호는 기기마다 다른 무작위 값과 섞어 되돌릴 수 없는 값으로 바꾼 뒤에만 보냅니다. 받은 쪽에서는 어떤 상품인지 알 수 없습니다.

4. 쓰는 목적
확장이 제대로 동작하는지 확인하고, 어떤 화면이 사용자에게 더 도움이 되는지 판단하는 데만 씁니다. 광고에 쓰지 않고, 판매하거나 다른 곳에 넘기지 않습니다. 개인을 알 수 없는 집계 결과(예: 리뷰 정렬 방식에 따른 체험단 리뷰 비중)는 공개할 수 있습니다.

5. 보관 위치와 처리 위탁
통계는 분석 서비스 Amplitude(Amplitude, Inc., 미국)에 저장됩니다.

6. 동의를 바꾸는 방법
확장 아이콘을 눌러 패널을 열면 맨 아래에서 언제든 켜고 끌 수 있습니다. 끄면 그 순간부터 아무것도 보내지 않습니다.

7. 확장을 제거할 때
동의한 경우에 한해 제거 사실과 사용 기간(일 수)이 익명 기기 번호와 함께 기록됩니다. 동의하지 않은 경우에는 제거 안내 페이지가 열릴 뿐 아무것도 기록되지 않습니다.

8. 삭제 요청과 문의
이미 보낸 통계의 삭제를 원하거나 궁금한 점이 있으면 아래 주소로 알려 주세요.
(연락처 이메일)

9. 쿠팡과의 관계
이 확장은 쿠팡과 관계가 없는 개인이 만든 도구입니다.

시행일: (배포일)
```

**필수 테스트:**

- [ ] `parseUninstallParams`: 정상 값, `d` 가 UUID 가 아님 → `deviceId: null`, `i` 가 미래 → `installedAt: null`, `i` 가 숫자가 아님, 쿼리 없음
- [ ] `daysSince`: 설치 3.6일 전 → 3, `null` → `null`
- [ ] `buildSiteEvent`: 최상위 `device_id`, `platform: 'Web'`, `app_version`, `session_id`, `insert_id`, `event_properties.surface`
- [ ] 제거 페이지(jsdom): `d` 있음 → fetch 1회, `event_type: 'Extension Removed'`, `days_since_install`. `d` 없음 → fetch 0회. `d` 형식 오류 → 0회
- [ ] 사유 버튼: `d` 있음 → 클릭 시 `Removal Reason Selected` 1건과 감사 문구, 두 번째 클릭은 추가 전송 없음. `d` 없음 → 클릭해도 fetch 0회, 감사 문구는 표시
- [ ] 키가 빈 문자열이면 fetch 0회(계측 꺼짐)
- [ ] `site/build.js --release` 가 환경 변수 없이 실패(종료 코드 1)
- [ ] 저장소에 커밋되는 사이트 파일 어디에도 이메일 주소 패턴과 32자리 hex 키가 없음(테스트로 고정)

**필수 변이:**

- [ ] W1: `d` 없이도 전송 → `d` 없음 테스트 실패
- [ ] W2: UUID 검증 제거 → 형식 오류 테스트 실패
- [ ] W3: 사유를 여러 번 전송 → 두 번째 클릭 테스트 실패
- [ ] W4: `--release` 의 환경 변수 검사 제거 → 빌드 실패 테스트 실패

- [ ] **Commit:** `feat: 처리방침과 제거 페이지를 담은 최소 사이트`

---

## Task 7: 이름, 아이콘, 매니페스트

**사전 단계(컨트롤러):** 아이콘 시안 3개를 사용자에게 시각적으로 보여 주고 고르게 한다(16px 에서도 알아볼 수 있는지 함께 보여 준다).

**Files:**
- Create: `extension/icons/icon.svg`, `extension/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`, `scripts/build-icons.js`, `tests/manifest.test.js`
- Modify: `extension/manifest.json`, `package.json`(devDependency `sharp`, 스크립트 `build:icons`, version), `package-lock.json`, `extension/src/sidepanel/index.html`(title), `README.md`

**Interfaces:**
- Produces: 매니페스트 필드(아래), 아이콘 파일 경로

**결정:**

```json
{
  "manifest_version": 3,
  "name": "체험단 리뷰 제거기",
  "short_name": "체험단 제거기",
  "version": "1.0.0",
  "description": "쿠팡 리뷰에서 체험단 리뷰를 찾아 숨기고, 체험단을 뺀 평점을 보여 줍니다. 숨긴 리뷰는 언제든 다시 볼 수 있습니다.",
  "minimum_chrome_version": "120",
  "icons": { "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
  "permissions": ["storage", "sidePanel"],
  "action": {
    "default_title": "체험단 리뷰 제거기",
    "default_icon": { "16": "icons/icon-16.png", "32": "icons/icon-32.png" }
  }
}
```

(`background`, `content_scripts`, `side_panel` 은 지금 그대로 둔다.)

- 설명은 132자 이하(스토어 요약 한도). 이름이 사용자 확인에서 바뀌면 이 표의 `name`, `short_name`, `default_title` 과 온보딩, 처리방침, 스토어 자료의 이름을 함께 바꾼다.
- 아이콘 원본은 SVG 하나. `scripts/build-icons.js` 가 `sharp` 로 4개 크기의 PNG 를 만든다. PNG 는 커밋한다(패키지에 들어간다).
- `package.json` 의 version 도 `1.0.0`. 두 버전이 다르면 테스트가 실패한다.
- 콘솔 로그 접두사 `[체험단 필터]` 는 내부용이라 그대로 둔다.

**필수 테스트(`tests/manifest.test.js`, 실제 `extension/manifest.json` 을 읽는다):**

- [ ] `permissions` 가 정확히 `['storage', 'sidePanel']`, `host_permissions` 와 `optional_permissions` 와 `web_accessible_resources` 가 없음
- [ ] `content_scripts` 가 1개이고 `matches` 가 정확히 `['https://www.coupang.com/vp/products/*']`
- [ ] `description` 길이 132 이하, `name` 길이 75 이하(스토어 한도)
- [ ] `icons` 와 `action.default_icon` 이 가리키는 파일이 모두 존재하고 PNG 시그니처로 시작하며 선언한 크기와 실제 크기가 같음
- [ ] 매니페스트가 가리키는 모든 파일 경로(`background.service_worker`, `content_scripts` 의 js 와 css, `side_panel.default_path`)가 허용 목록 형식에 맞음(dist 산출물은 빌드 후 존재)
- [ ] `manifest.version === package.json version`
- [ ] `name`, `description` 에 엠대시와 가운데 점이 없음

**필수 변이:**

- [ ] M1: `permissions` 에 `tabs` 추가 → 실패
- [ ] M2: 아이콘 경로 오타 → 실패
- [ ] M3: 버전 불일치 → 실패

- [ ] **Commit:** `feat: 스토어 제출용 이름, 아이콘, 매니페스트`

---

## Task 8: 패키징

**Files:**
- Create: `scripts/package.js`, `tests/package.test.js`
- Modify: `package.json`(devDependency `fflate`, 스크립트 `package`), `.gitignore`(`release/`), `README.md`

**Interfaces:**
- Consumes: `node build.js --release`, `SITE.landingOrigin`, `isLandingConfigured` (`shared/site.js`). `background/analytics.js` 는 import 하지 않는다(키 파일을 끌어온다). 키 검사는 번들 문자열로 한다
- Produces: `scripts/package.js` 의 `PACKAGE_FILES`(허용 목록), `collectPackageFiles(extensionDir): string[]`, `checkReleaseReadiness({ landingOrigin, bundles }): string[]`(문제 목록, 비어 있으면 통과). 산출물 `release/review-remover-<version>.zip`

**결정:**

- zip 에는 **허용 목록의 파일만** 넣는다. 폴더째 넣지 않는다. `extension/src` 에는 소스와 `config.local.js` 가 있다.

```js
export const PACKAGE_FILES = [
  'manifest.json',
  'dist/background.js',
  'dist/content.js',
  'dist/sidepanel.js',
  'dist/onboarding.js',
  'src/content/content.css',
  'src/sidepanel/index.html',
  'src/sidepanel/style.css',
  'src/onboarding/index.html',
  'src/onboarding/style.css',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
]
```

- `npm run package` 의 순서: release 빌드 → 준비 상태 검사 → zip. 검사에서 문제가 하나라도 있으면 zip 을 만들지 않고 문제를 한국어로 출력한 뒤 종료 코드 1.
- 준비 상태 검사:
  1. `SITE.landingOrigin` 이 설정돼 있다(자리표시자면 제거 페이지와 처리방침 링크가 꺼진 채 제출된다)
  2. `dist/background.js` 에 자리표시자 키 `PASTE_YOUR_AMPLITUDE_API_KEY_HERE` 가 없다(예시 설정으로 빌드한 패키지 방지)
  3. 세 번들과 온보딩 번들에 `console.log(` 가 없다
  4. `dist/content.js`, `dist/sidepanel.js`, `dist/onboarding.js` 에 `api2.amplitude.com` 이 없다(전송은 백그라운드만)
  5. 허용 목록의 모든 파일이 존재한다
  6. 매니페스트와 두 HTML 이 참조하는 모든 로컬 파일이 허용 목록 안에 있다
- 키 값 자체를 검사 출력이나 로그에 찍지 않는다.
- zip 안의 경로는 `manifest.json` 이 최상위에 오게 한다(폴더로 한 번 감싸지 않는다).

**필수 테스트:**

- [ ] `collectPackageFiles` 결과가 `PACKAGE_FILES` 와 정확히 같다(임시 디렉터리에 가짜 확장 폴더를 만들어, `src/shared/config.local.js` 와 `src/background/index.js` 가 있어도 결과에 없음을 확인)
- [ ] `checkReleaseReadiness`: 자리표시자 사이트 주소 → 문제 1건. 자리표시자 키 → 1건. 번들에 `console.log(` → 1건. 콘텐츠 번들에 앰플리튜드 주소 → 1건. 전부 정상 → 빈 배열
- [ ] 참조 무결성: 실제 `manifest.json`, `src/sidepanel/index.html`, `src/onboarding/index.html` 이 참조하는 로컬 경로가 모두 `PACKAGE_FILES` 에 있다
- [ ] 만든 zip 을 다시 풀어 파일 목록이 허용 목록과 같고 `manifest.json` 이 최상위에 있다

**필수 변이:**

- [ ] K1: 허용 목록 대신 `src` 폴더 전체를 넣음 → `config.local.js` 부재 테스트 실패
- [ ] K2: 사이트 주소 검사 제거 → 자리표시자 테스트 실패
- [ ] K3: `PACKAGE_FILES` 에서 `dist/onboarding.js` 삭제 → 참조 무결성 테스트 실패

- [ ] **Commit:** `feat: 허용 목록 기반 제출 패키지 스크립트와 제출 전 검사`

---

## Task 9: 스토어 등록 자료

컨트롤러가 직접 쓴다(코드가 아니라 문서). 사용자가 대시보드에 붙여 넣을 수 있게 항목별로 정리한다.

**Files:**
- Create: `docs/store/listing.md`

**내용(그대로 쓴다):**

- **이름**: 체험단 리뷰 제거기
- **요약(132자 이하)**: 매니페스트 `description` 과 같은 문장
- **카테고리**: 쇼핑. **언어**: 한국어
- **상세 설명**:

```
쿠팡에서 리뷰를 볼 때 체험단 리뷰가 얼마나 섞여 있는지 바로 보여 줍니다.

하는 일
- 체험단 제공 리뷰에 표시를 붙입니다
- 버튼 하나로 체험단 리뷰를 숨기고, 다시 누르면 다시 보여 줍니다
- 체험단 리뷰를 뺀 평점을 계산해 원래 평균과 나란히 보여 줍니다
- 지금까지 본 리뷰 중 체험단 리뷰의 비중을 알려 줍니다

판별 기준
쿠팡이 리뷰에 직접 붙이는 "쿠팡체험단 이벤트로 상품을 무료로 제공받아 작성한 구매 후기" 안내 문구가 있는 리뷰만 체험단 리뷰로 봅니다. 추측으로 판정하지 않습니다.

숫자의 범위
평점과 비중은 사용자가 화면에서 실제로 본 리뷰만으로 계산합니다. 상품 전체 리뷰의 통계가 아닙니다.

익명 사용 통계(선택)
설치 직후 화면에서 동의한 경우에만 익명 사용 통계를 보냅니다. 배너가 뜬 횟수, 체험단 비중 같은 숫자, 버튼을 눌렀는지, 리뷰 정렬 방식이 포함됩니다. 리뷰 내용, 상품 이름과 주소, 쿠팡 계정 정보는 보내지 않습니다. 상품 번호는 되돌릴 수 없는 값으로 바꿔 보내므로 어떤 상품을 봤는지는 만든 사람도 알 수 없습니다. 동의하지 않아도 모든 기능을 쓸 수 있고, 패널에서 언제든 끌 수 있습니다.

이 확장은 쿠팡과 관계가 없는 개인이 만들었습니다.
```

- **단일 목적**: `쿠팡 상품 페이지의 리뷰에서 체험단 제공 리뷰를 표시하고 숨기며, 체험단 리뷰를 제외한 평점을 보여 준다.`
- **권한 사유**:
  - `storage`: `익명 기기 번호, 통계 전송 동의 여부, 탭별 리뷰 요약을 브라우저 안에 저장한다.`
  - `sidePanel`: `체험단 비중과 체험단 제외 평점의 상세를 브라우저 사이드 패널에 표시한다.`
  - 호스트(`https://www.coupang.com/vp/products/*`, 콘텐츠 스크립트): `쿠팡 상품 페이지의 리뷰 영역을 읽어 체험단 리뷰를 표시하고 숨기며 배너를 삽입한다. 다른 사이트나 쿠팡의 다른 페이지에서는 동작하지 않는다.`
- **원격 코드**: 사용하지 않음
- **데이터 사용 공개(체크할 항목)**: `사용자 활동`(버튼 클릭), `웹 기록`(쿠팡 상품 페이지를 본 사실과 시각이 익명 통계에 포함되므로 보수적으로 체크). 체크하지 않는 항목: 개인 식별 정보, 건강, 금융, 인증, 개인 통신, 위치, 웹사이트 콘텐츠(리뷰 내용은 전송하지 않는다)
- **인증 3가지** 모두 체크: 승인된 사용 사례 외에 판매, 이전하지 않음 / 단일 목적과 무관한 용도로 쓰지 않음 / 신용도 판단에 쓰지 않음
- **개인정보 처리방침 주소**: `<사이트 주소>/privacy`
- **스크린샷(1280x800, 3장 이상)** 촬영 목록:
  1. 쿠팡 리뷰 영역 위의 배너(체험단 비중과 평점 두 줄이 보이게)
  2. 체험단 리뷰에 붙은 표시와 숨기기 버튼을 누른 뒤의 화면
  3. 사이드 패널(체험단 제외 평점, 비중 막대, 동의 토글)
  4. 온보딩 화면(보내는 것과 보내지 않는 것 목록이 보이게)
  - 스크린샷에 다른 사람의 이름, 리뷰 본문, 상품 사진이 크게 보이지 않게 한다. 리뷰 작성자 이름은 쿠팡이 이미 가려 표시한다
- **심사자 안내(테스트 방법)**: `로그인 없이 쿠팡 상품 페이지(예: https://www.coupang.com/vp/products/7590830589)를 열고 리뷰 영역까지 스크롤하면 배너가 나타납니다.`

- [ ] **Commit:** `docs: 웹스토어 등록 자료`

---

## Task 10: 배포, 최종 확인, 제출 (사용자와 함께)

코드 태스크가 아니다. 순서대로 진행하고 각 단계의 결과를 원장에 적는다.

- [ ] **사이트 배포.** 사용자가 Vercel 에 깃허브 저장소를 연결한다(Root Directory 는 저장소 최상위 그대로, 빌드 명령과 출력 폴더는 `vercel.json` 이 정한다, 환경 변수 `AMPLITUDE_API_KEY`, `CONTACT_EMAIL`). 배포 전에 `site/public/privacy.html` 의 시행일을 배포일로 채워 커밋한다. 처리방침에 공개되는 이메일은 사용자가 정한다. 컨트롤러는 사용자의 명시적 승인 없이 배포하지 않는다
- [ ] 배포된 주소에서 `/privacy`, `/uninstalled` 가 열리고 처리방침에 연락처가 보이는지 확인
- [ ] `extension/src/shared/site.js` 의 `landingOrigin` 을 배포 주소로 바꾸고 커밋
- [ ] `npm test` 전체 통과, `npm run package` 성공(준비 상태 검사 통과)
- [ ] **release 패키지 실브라우저 스모크**(사용자). zip 을 풀어 그 폴더를 크롬에 로드한다
  - 온보딩이 열리고, 고르기 전 `httpapi` 0건
  - `통계 없이 사용` 을 고른 뒤 쿠팡 상품 페이지에서 배너, 숨기기, 패널이 전부 동작하고 `httpapi` 0건
  - 패널에서 `보내기` 로 바꾸면 `Extension Installed` 가 한 번 가고 이후 `Banner Rendered` 의 페이로드에 `product_key`, `page_key` 가 있고 `product_id` 가 없음
  - 콘솔에 `[체험단 필터]` 로그가 없음(release 빌드)
  - 리뷰가 0건인 상품에서 `Extension Error` 가 나가지 않음
  - 확장을 제거하면 제거 페이지가 열림
- [ ] 스크린샷 촬영(Task 9 목록)
- [ ] **개발자 등록과 제출**(사용자). 크롬 웹스토어 개발자 대시보드에서 1회 등록비 5달러를 결제하고, zip 업로드, `docs/store/listing.md` 내용 입력, 심사 제출. 계정 생성과 결제는 사용자가 직접 한다
- [ ] 발급된 확장 ID 와 스토어 주소를 `docs/store/listing.md` 에 적는다(계획 3b 의 설치 버튼이 쓴다)
- [ ] `main` 머지와 푸시(사용자 확인 후), dev docs 갱신

---

## 완료 기준

- [ ] `npm test` 전체 통과, `npm run package` 가 검사를 통과하고 zip 을 만든다
- [ ] 동의하지 않은 상태에서 어떤 조작을 해도 네트워크 요청이 0건이다(테스트와 실브라우저 둘 다)
- [ ] 전송되는 페이로드 어디에도 쿠팡 상품 번호와 리뷰 번호 원문이 없다
- [ ] 매니페스트 권한이 `storage`, `sidePanel` 뿐이고 콘텐츠 스크립트가 쿠팡 상품 페이지에만 붙는다
- [ ] 처리방침과 제거 페이지가 공개 주소에서 열린다
- [ ] 심사에 제출됐다

---

## 로드맵: 계획 3b (심사 대기 중)

시작할 때 그 시점의 코드로 상세 계획을 쓴다. 지금 정해 둘 것은 범위와 미리 알려진 설계 문제뿐이다.

- 랜딩 첫 화면: 문제 제기, 데모 이미지, 설치 버튼, 모바일 안내, 처리방침 링크
- 랜딩 이벤트(명세 6.3)와 `exp_install_cta`. 랜딩 방문자 분석은 확장 정책이 아니라 웹사이트의 영역이지만 같은 최소 수집 원칙을 적용한다
- **신원 연결 재설계(명세 11.5)**: 랜딩 방문과 확장 설치를 같은 사람으로 잇는 방법. 후보는 동의한 사용자에 한해 확장이 랜딩의 한 페이지를 기기 번호와 함께 여는 것. 확장 쪽 변경이 필요하면 재심사가 필요하므로 3b 초기에 결정한다
- 모바일 핸드오프(이메일로 링크 보내기)는 서버와 이메일 수집이 필요하다. 표본에 주는 이득과 개인정보 부담을 비교해 할지 말지부터 정한다
- 유입 채널 글 작성(명세 7.1)

## 로드맵: 계획 3c (출시 후)

- 대시보드: 북극성은 "`filter_state=on` 인 `Banner Rendered` 가 있는 주간 세션 수"(`Filter Toggled` 로 세면 실험과 교락된다). 퍼널 F2, F3, F4, 가드레일(`Extension Error` 발생률, `Extension Removed` 비율과 사유)
- 분석 조건: `app_version >= 1.0.0`, 진단용 기기 2개 제외. 표본은 동의한 사용자라는 점과 동의율(스토어 설치 수 대비 `Extension Installed` 수)을 함께 적는다
- 4.4절 검증: (기기, `product_key`, 정렬)에서 `sort_pages_seen = 1` 인 관측으로 베스트순과 최신순의 체험단 비중 비교. `page_key` 로 같은 페이지 중복 제거
- 실험 판독: 표본이 작을 것이므로 검정력과 신뢰구간을 함께 보고, 결론을 내지 못하면 못 냈다고 쓴다
- `seconds_on_page` 는 문서 수명 기준이라 상품별 체류로 읽지 않는다
- 포트폴리오 문서: 계측 설계, 개인정보 경계(정책을 확인하고 동의와 최소 수집으로 바꾼 경위), 발견, 한계
