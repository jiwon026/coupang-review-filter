# 랜딩과 배포 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확장을 소개하고 설치로 이끄는 랜딩을 만들어 배포하고, 랜딩과 확장의 신원을 연결하고, 크롬 웹스토어에 제출해 실제 사용자를 받을 수 있는 상태로 만든다.

**Architecture:** 랜딩은 빌드 없는 정적 HTML이다. 앰플리튜드는 CDN UMD 스크립트로 불러 쓴다. 신원 연결은 `/installed` 페이지가 자기 `device_id` 를 DOM 데이터 속성에 노출하고, 확장의 전용 콘텐츠 스크립트가 그 값을 읽어 저장하는 방식이다.

**Tech Stack:** 정적 HTML/CSS/JS, Amplitude Browser SDK 2 (CDN), Vercel, Chrome Web Store

**Spec:** `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md`

**선행 계획:** `2026-09-28-extension-core.md` 와 `2026-09-28-instrumentation.md` 가 완료되어 있어야 한다.

## 설계 변경 하나

명세 3.4절은 모바일 핸드오프를 이메일 수집으로 적었다. 이 계획에서는 **링크 공유** 로 바꾼다.

| | 이메일 수집 | 링크 공유 |
|---|---|---|
| 서버 | 발송 인프라 필요 | 불필요 |
| 개인정보 | 이메일 수집과 보관 | 수집 없음 |
| 사용자 마찰 | 입력 후 대기 | 버튼 한 번 |
| 신원 연결 | 이메일 해시 | 랜덤 토큰 |

`navigator.share()` 로 카카오톡 등에 링크를 보내고, 사용자가 PC에서 그 링크를 연다. 링크에 담긴 랜덤 토큰이 두 기기를 잇는다. 개인정보를 아예 받지 않으므로 명세 6.9절의 원칙에도 더 부합한다.

명세 파일의 3.4절과 6.1절을 이 내용으로 갱신한다. 이 계획 Task 3의 마지막 단계에 포함되어 있다.

## Global Constraints

- 랜딩은 빌드 도구를 쓰지 않는다. `landing/` 폴더를 그대로 배포한다
- 앰플리튜드 API 키는 `landing/src/config.local.js` 에만 둔다. 저장소에는 `config.example.js` 만 커밋한다
- 랜딩 이벤트에는 `surface: 'site'` 가, 확장 이벤트에는 `surface: 'extension'` 이 붙는다
- 모든 문구는 한국어로 쓰고 엠대시(—)와 가운데 점(·)을 쓰지 않는다
- 리뷰 원문이나 상품 데이터를 랜딩에 싣지 않는다. 랜딩은 확장 소개만 한다
- 모바일에서 완전히 동작해야 한다. 최소 너비 320px 기준으로 좌우 스크롤이 생기지 않아야 한다

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `landing/index.html` | 소개와 설치 유도 |
| `landing/installed.html` | 설치 완료 온보딩. 신원 연결 지점 |
| `landing/uninstalled.html` | 제거 추적 |
| `landing/privacy.html` | 개인정보 처리 방침 |
| `landing/assets/style.css` | 전체 스타일 |
| `landing/src/config.example.js` | 설정 템플릿 |
| `landing/src/config.local.js` | 실제 키. 커밋 안 됨 |
| `landing/src/analytics.js` | 앰플리튜드 초기화와 track 래퍼 |
| `landing/src/index.js` | 메인 페이지 로직 |
| `landing/src/installed.js` | 온보딩 로직과 신원 노출 |
| `landing/src/uninstalled.js` | 제거 이벤트 전송 |
| `extension/src/link/index.js` | 랜딩에서 device_id를 읽어 오는 콘텐츠 스크립트 |
| `extension/assets/icon-*.png` | 확장 아이콘 |

---

## Task 1: 랜딩 뼈대와 계측

**Files:**
- Create: `landing/index.html`
- Create: `landing/assets/style.css`
- Create: `landing/src/config.example.js`
- Create: `landing/src/config.local.js`
- Create: `landing/src/analytics.js`
- Create: `landing/src/index.js`
- Modify: `.gitignore` (landing 설정 추가)

**Interfaces:**
- Consumes: `CONFIG` from `landing/src/config.local.js`
- Produces:
  - `initAnalytics(): void`
  - `track(eventType: string, properties?: object): void`
  - `getDeviceId(): string`
  - `setUserId(id: string): void`
  - `Landing Viewed`, `Demo Viewed` 수집

- [ ] **Step 1: gitignore에 랜딩 설정 추가**

`.gitignore` 의 `src/config.local.*` 줄 다음에 추가한다.

```
landing/src/config.local.js
```

- [ ] **Step 2: 설정 파일 작성**

`landing/src/config.example.js`:

```js
window.CRF_CONFIG = {
  amplitudeApiKey: 'YOUR_AMPLITUDE_API_KEY',
  storeUrl: 'https://chromewebstore.google.com/detail/PLACEHOLDER',
}
```

`landing/src/config.local.js` 에 계획 2 Task 1에서 만든 것과 **같은** 앰플리튜드 키를 넣는다. 프로젝트가 같아야 랜딩과 확장의 퍼널이 이어진다.

```js
window.CRF_CONFIG = {
  amplitudeApiKey: '계획 2에서 쓴 것과 같은 키',
  storeUrl: 'https://chromewebstore.google.com/detail/PLACEHOLDER',
}
```

`storeUrl` 은 Task 8에서 실제 값으로 바꾼다.

- [ ] **Step 3: 계측 래퍼 작성**

`landing/src/analytics.js`:

```js
(function () {
  const COMMON = {
    surface: 'site',
    platform: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
  }

  function isExtensionInstalled() {
    return document.documentElement.hasAttribute('data-crf-installed')
  }

  window.CRF = {
    init() {
      amplitude.init(window.CRF_CONFIG.amplitudeApiKey, undefined, {
        defaultTracking: { pageViews: false, sessions: true, formInteractions: false },
      })
    },
    track(eventType, properties = {}) {
      amplitude.track(eventType, {
        ...COMMON,
        is_extension_installed: isExtensionInstalled(),
        ...properties,
      })
    },
    getDeviceId() {
      return amplitude.getDeviceId()
    },
    setUserId(id) {
      amplitude.setUserId(id)
    },
  }
})()
```

`is_extension_installed` 는 확장이 심는 속성으로 판단한다. Task 6에서 확장이 이 속성을 심게 만든다.

- [ ] **Step 4: 메인 페이지 작성**

`landing/index.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>쿠팡 체험단 리뷰 필터</title>
  <meta name="description" content="쿠팡 리뷰에서 체험단 제공 리뷰를 걸러내고 협찬을 제외한 진짜 평점을 보여줍니다.">
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <main>
    <section class="hero">
      <h1>평점 4.7이 실은 4.1입니다</h1>
      <p class="lead">
        쿠팡 리뷰에는 체험단 제공 리뷰가 섞여 있습니다.
        표기는 되어 있지만 평점에는 그대로 반영됩니다.
      </p>
      <div class="cta-area" id="cta-top"></div>
    </section>

    <section class="demo" id="demo">
      <h2>이렇게 보입니다</h2>
      <img src="assets/demo.png" alt="쿠팡 상품 페이지에 체험단 비중과 협찬 제외 평점을 보여주는 배너가 삽입된 화면" width="720">
      <p class="caption">상품 페이지를 열면 리뷰 위에 자동으로 뜹니다. 따로 할 일은 없습니다.</p>
    </section>

    <section class="how">
      <h2>어떻게 동작하나요</h2>
      <ol>
        <li>쿠팡이 체험단 리뷰에 붙이는 고정 문구를 찾습니다.</li>
        <li>그 리뷰를 빼고 평점을 다시 계산합니다.</li>
        <li>원하면 체험단 리뷰를 숨길 수 있습니다.</li>
      </ol>
      <p class="note">
        판정하지 않고 근거만 보여줍니다. 리뷰 내용은 어디에도 저장되지 않습니다.
        자세한 내용은 <a href="privacy.html">개인정보 처리 방침</a>에 있습니다.
      </p>
    </section>

    <section class="cta-bottom">
      <div class="cta-area" id="cta-bottom"></div>
    </section>
  </main>

  <script src="https://cdn.amplitude.com/libs/analytics-browser-2.11.1-min.js.gz"></script>
  <script src="src/config.local.js"></script>
  <script src="src/analytics.js"></script>
  <script src="src/index.js"></script>
</body>
</html>
```

- [ ] **Step 5: 스타일 작성**

`landing/assets/style.css`:

```css
* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0 16px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
  line-height: 1.7;
  background: #fff;
}

main {
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 0 80px;
}

h1 {
  font-size: 32px;
  line-height: 1.3;
  margin: 0 0 16px;
}

h2 {
  font-size: 20px;
  margin: 48px 0 16px;
}

.lead {
  font-size: 17px;
  color: #444;
  margin: 0 0 28px;
}

.demo img {
  width: 100%;
  height: auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.caption, .note {
  font-size: 14px;
  color: #666;
}

.btn {
  display: inline-block;
  border: none;
  border-radius: 8px;
  background: #1a1a1a;
  color: #fff;
  padding: 14px 28px;
  font-size: 16px;
  cursor: pointer;
  text-decoration: none;
}

.btn:hover { background: #333; }

.btn-secondary {
  background: #fff;
  color: #1a1a1a;
  border: 1px solid #ccc;
}

.hint {
  font-size: 14px;
  color: #666;
  margin-top: 12px;
}

@media (max-width: 480px) {
  h1 { font-size: 26px; }
  main { padding: 32px 0 56px; }
}
```

- [ ] **Step 6: 페이지 로직 작성 (CTA는 Task 2에서 채운다)**

`landing/src/index.js`:

```js
(function () {
  window.CRF.init()
  window.CRF.track('Landing Viewed', {
    referrer_domain: document.referrer ? new URL(document.referrer).hostname : 'direct',
  })

  const demo = document.getElementById('demo')
  let demoSeen = false

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || demoSeen) continue
      demoSeen = true
      window.CRF.track('Demo Viewed', {
        scroll_depth: Math.round((window.scrollY / document.body.scrollHeight) * 100),
      })
      observer.disconnect()
    }
  }, { threshold: 0.5 })

  observer.observe(demo)
})()
```

- [ ] **Step 7: 데모 이미지 준비**

계획 1 완료 상태의 확장이 동작하는 쿠팡 페이지를 스크린샷으로 찍는다. 배너가 잘 보이도록 리뷰 영역 위주로 자르고 `landing/assets/demo.png` 로 저장한다. 가로 720px 이상 권장.

- [ ] **Step 8: 로컬에서 확인**

Run: `npx serve landing`

브라우저에서 표시된 주소를 열고 개발자도구 Network 탭을 연다.

Expected: `api2.amplitude.com` 으로 요청 2건. 스크롤해서 데모 이미지가 보이면 `Demo Viewed` 가 추가로 나간다

- [ ] **Step 9: 커밋**

```bash
git add .gitignore landing/
git commit -m "feat: 랜딩 페이지와 기본 계측"
```

`config.local.js` 가 스테이징되지 않았는지 `git status` 로 확인한다.

---

## Task 2: 설치 CTA와 기기 분기

**Files:**
- Modify: `landing/src/index.js`

**Interfaces:**
- Consumes: `window.CRF`
- Produces: `Install CTA Clicked`, `Store Redirected` 수집. 모바일에서는 설치 버튼 대신 핸드오프 영역을 그린다

- [ ] **Step 1: CTA 렌더링 함수 추가**

`landing/src/index.js` 의 IIFE 안, `observer.observe(demo)` 앞에 추가한다.

```js
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  function renderDesktopCta(container, location) {
    const button = document.createElement('a')
    button.className = 'btn'
    button.href = window.CRF_CONFIG.storeUrl
    button.textContent = '크롬에 추가하기'
    button.addEventListener('click', () => {
      window.CRF.track('Install CTA Clicked', { cta_location: location })
      window.setTimeout(() => window.CRF.track('Store Redirected', { cta_location: location }), 0)
    })
    container.appendChild(button)

    const hint = document.createElement('p')
    hint.className = 'hint'
    hint.textContent = '엣지와 웨일에서도 그대로 동작합니다.'
    container.appendChild(hint)
  }

  for (const id of ['cta-top', 'cta-bottom']) {
    const container = document.getElementById(id)
    if (!isMobile) renderDesktopCta(container, id)
  }
```

`Store Redirected` 를 `setTimeout` 으로 분리하는 이유는, 클릭은 했지만 이동이 막히거나 취소된 경우를 구분하기 위해서다. 이동이 일어나면 페이지가 바뀌어도 이벤트는 이미 큐에 들어간다.

- [ ] **Step 2: 데스크톱에서 확인**

Run: `npx serve landing`

Expected: 상단과 하단에 "크롬에 추가하기" 버튼이 보인다. 누르면 앰플리튜드에 `Install CTA Clicked` 와 `Store Redirected` 가 `cta_location` 과 함께 들어간다

- [ ] **Step 3: 모바일 에뮬레이션에서 확인**

개발자도구에서 기기를 iPhone으로 바꾸고 새로고침한다.

Expected: 설치 버튼이 보이지 않는다. CTA 영역이 비어 있다. 다음 태스크에서 채운다

- [ ] **Step 4: 커밋**

```bash
git add landing/src/index.js
git commit -m "feat: 설치 CTA와 기기별 분기"
```

---

## Task 3: 모바일 핸드오프

**Files:**
- Modify: `landing/src/index.js`
- Modify: `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md`

**Interfaces:**
- Consumes: `window.CRF`
- Produces:
  - `Handoff Link Requested`, `Handoff Link Opened` 수집
  - 링크 형식은 `{origin}/?ht={token}`. `token` 은 `crypto.randomUUID()`
  - 토큰은 `localStorage.crf_handoff_token` 에 보관

- [ ] **Step 1: 핸드오프 UI와 로직 추가**

`landing/src/index.js` 의 `renderDesktopCta` 함수 다음에 추가한다.

```js
  function getHandoffToken() {
    let token = localStorage.getItem('crf_handoff_token')
    if (!token) {
      token = crypto.randomUUID()
      localStorage.setItem('crf_handoff_token', token)
    }
    return token
  }

  function renderMobileCta(container, location) {
    const notice = document.createElement('p')
    notice.className = 'lead'
    notice.textContent = '모바일에서는 확장을 설치할 수 없습니다. PC에서 쓰시려면 링크를 보내 두세요.'
    container.appendChild(notice)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'btn'
    button.textContent = 'PC에서 열 링크 보내기'
    button.addEventListener('click', async () => {
      const token = getHandoffToken()
      window.CRF.setUserId(token)
      const url = `${location.origin}/?ht=${token}`

      window.CRF.track('Handoff Link Requested', { cta_location: location, channel: 'share' })

      try {
        if (navigator.share) {
          await navigator.share({ title: '쿠팡 체험단 리뷰 필터', url })
        } else {
          await navigator.clipboard.writeText(url)
          button.textContent = '링크를 복사했습니다'
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          await navigator.clipboard.writeText(url)
          button.textContent = '링크를 복사했습니다'
        }
      }
    })
    container.appendChild(button)
  }
```

`location` 이라는 이름이 전역 `window.location` 과 겹치므로 함수 인자 이름을 `slot` 으로 바꾸고 URL 조립에는 `window.location.origin` 을 쓴다. 수정한 형태는 다음과 같다.

```js
  function renderMobileCta(container, slot) {
    const notice = document.createElement('p')
    notice.className = 'lead'
    notice.textContent = '모바일에서는 확장을 설치할 수 없습니다. PC에서 쓰시려면 링크를 보내 두세요.'
    container.appendChild(notice)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'btn'
    button.textContent = 'PC에서 열 링크 보내기'
    button.addEventListener('click', async () => {
      const token = getHandoffToken()
      window.CRF.setUserId(token)
      const url = `${window.location.origin}/?ht=${token}`

      window.CRF.track('Handoff Link Requested', { cta_location: slot, channel: 'share' })

      try {
        if (navigator.share) {
          await navigator.share({ title: '쿠팡 체험단 리뷰 필터', url })
        } else {
          await navigator.clipboard.writeText(url)
          button.textContent = '링크를 복사했습니다'
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          await navigator.clipboard.writeText(url)
          button.textContent = '링크를 복사했습니다'
        }
      }
    })
    container.appendChild(button)
  }
```

같은 이유로 `renderDesktopCta` 의 두 번째 인자 이름도 `slot` 으로 바꾸고 본문의 `location` 참조를 `slot` 으로 교체한다.

- [ ] **Step 2: CTA 분기 교체**

```js
  for (const id of ['cta-top', 'cta-bottom']) {
    const container = document.getElementById(id)
    if (isMobile) renderMobileCta(container, id)
    else renderDesktopCta(container, id)
  }
```

- [ ] **Step 3: 링크 수신 처리 추가**

`window.CRF.init()` 바로 다음, `Landing Viewed` 전송 **앞에** 추가한다. user_id를 먼저 세팅해야 이후 이벤트가 올바른 사용자에 붙는다.

```js
  const params = new URLSearchParams(window.location.search)
  const handoffToken = params.get('ht')
  if (handoffToken) {
    window.CRF.setUserId(handoffToken)
    localStorage.setItem('crf_handoff_token', handoffToken)
  }
```

`Landing Viewed` 전송 다음에 추가한다.

```js
  if (handoffToken) {
    window.CRF.track('Handoff Link Opened', {})
  }
```

- [ ] **Step 4: 모바일 에뮬레이션에서 확인**

개발자도구에서 기기를 iPhone으로 바꾸고 새로고침한다.

Expected: 안내 문구와 "PC에서 열 링크 보내기" 버튼이 보인다. 누르면 공유 시트가 뜨거나 링크가 복사된다. 앰플리튜드에 `Handoff Link Requested` 가 들어간다

- [ ] **Step 5: 링크 수신 확인**

데스크톱 모드로 돌아가 `?ht=test-token-1` 을 붙여 접속한다.

Expected: 앰플리튜드에 `Handoff Link Opened` 가 들어가고, 해당 이벤트의 user_id가 `test-token-1` 이다

- [ ] **Step 6: 명세 갱신**

`docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md` 를 두 군데 고친다.

3.4절의 핸드오프 블록을 교체한다.

```
"모바일에서는 확장이 동작하지 않습니다.
 PC에서 쓰시려면 링크를 보내 두세요."  → 링크 공유 버튼
```

그 아래 문장을 교체한다.

> 링크에 랜덤 토큰을 실어 보내고, PC에서 열면 같은 사용자로 식별한다. 이메일을 포함한 어떤 개인정보도 수집하지 않는다.

6.1절 크로스 디바이스 문단을 교체한다.

> 핸드오프 링크에 랜덤 토큰을 실어 보낸다. PC에서 열면 같은 `user_id` 로 식별한다. 토큰은 `crypto.randomUUID()` 로 생성하며 어떤 개인정보와도 연결되지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add landing/src/index.js docs/superpowers/specs/
git commit -m "feat: 모바일 링크 핸드오프, 이메일 수집 제거"
```

---

## Task 4: 공유 버튼

**Files:**
- Modify: `landing/index.html`
- Modify: `landing/src/index.js`

**Interfaces:**
- Consumes: `window.CRF`
- Produces: `Share Clicked` 수집

- [ ] **Step 1: 마크업 추가**

`landing/index.html` 의 `.cta-bottom` 섹션 안, `cta-bottom` div 다음에 추가한다.

```html
      <p class="hint">쓸 만하면 주변에도 알려 주세요.</p>
      <div class="cta-area" id="share-area"></div>
```

- [ ] **Step 2: 로직 추가**

`landing/src/index.js` 의 CTA 분기 루프 다음에 추가한다.

```js
  const shareArea = document.getElementById('share-area')
  const shareButton = document.createElement('button')
  shareButton.type = 'button'
  shareButton.className = 'btn btn-secondary'
  shareButton.textContent = '링크 공유하기'
  shareButton.addEventListener('click', async () => {
    const url = window.location.origin
    const target = navigator.share ? 'native' : 'clipboard'
    window.CRF.track('Share Clicked', { share_target: target })

    try {
      if (navigator.share) {
        await navigator.share({ title: '쿠팡 체험단 리뷰 필터', url })
      } else {
        await navigator.clipboard.writeText(url)
        shareButton.textContent = '링크를 복사했습니다'
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        await navigator.clipboard.writeText(url)
        shareButton.textContent = '링크를 복사했습니다'
      }
    }
  })
  shareArea.appendChild(shareButton)
```

- [ ] **Step 3: 확인**

Expected: 하단에 "링크 공유하기" 버튼. 누르면 `Share Clicked` 가 `share_target` 과 함께 수집된다

- [ ] **Step 4: 커밋**

```bash
git add landing/index.html landing/src/index.js
git commit -m "feat: 공유 버튼"
```

---

## Task 5: 개인정보 처리 방침

**Files:**
- Create: `landing/privacy.html`

**Interfaces:**
- Consumes: 없음
- Produces: 웹스토어 제출에 필요한 공개 URL

크롬 웹스토어는 개인정보 처리 방침 URL을 요구한다. 없으면 심사가 반려된다.

- [ ] **Step 1: 페이지 작성**

`landing/privacy.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>개인정보 처리 방침 | 쿠팡 체험단 리뷰 필터</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <main>
    <h1>개인정보 처리 방침</h1>
    <p class="lead">최종 수정일: 2026-09-28</p>

    <h2>수집하지 않는 것</h2>
    <ul>
      <li>이름, 이메일, 전화번호를 포함한 신원 정보</li>
      <li>쿠팡 계정 정보와 구매 내역</li>
      <li>리뷰 본문. 확장이 읽은 리뷰 내용은 브라우저 밖으로 나가지 않습니다</li>
      <li>사용자가 방문한 페이지의 주소</li>
    </ul>

    <h2>수집하는 것</h2>
    <p>서비스 개선을 위해 익명 사용 통계를 수집합니다. 구체적으로는 다음과 같습니다.</p>
    <ul>
      <li>무작위로 생성한 익명 식별자. 어떤 개인정보와도 연결되지 않습니다</li>
      <li>기능 사용 여부. 필터를 켰는지, 패널을 열었는지 같은 동작</li>
      <li>상품 단위 통계. 리뷰 개수, 체험단 비중, 평점 차이</li>
      <li>브라우저 종류와 확장 버전</li>
    </ul>

    <h2>보관과 위탁</h2>
    <p>
      수집한 통계는 분석 도구 앰플리튜드에 저장됩니다.
      확장 자체는 별도 서버를 두지 않으며, 모든 판별과 계산은 사용자 브라우저 안에서 이루어집니다.
    </p>

    <h2>권한 사용 목적</h2>
    <ul>
      <li>쿠팡 상품 페이지 접근: 리뷰를 읽어 체험단 표기를 찾고 평점을 다시 계산하기 위해서입니다</li>
      <li>저장소: 익명 식별자와 사용자 설정을 기기에 보관하기 위해서입니다</li>
      <li>사이드 패널: 상세 통계를 보여주기 위해서입니다</li>
    </ul>

    <h2>문의</h2>
    <p>문의는 저장소 이슈로 남겨 주세요.</p>

    <p><a href="index.html">처음으로</a></p>
  </main>
</body>
</html>
```

- [ ] **Step 2: 커밋**

```bash
git add landing/privacy.html
git commit -m "docs: 개인정보 처리 방침"
```

---

## Task 6: 배포와 도메인 확정

**Files:**
- Create: `vercel.json`
- Modify: `landing/src/config.local.js`
- Modify: `extension/src/shared/config.local.js`

**Interfaces:**
- Consumes: 없음
- Produces: 공개 도메인. 이후 태스크가 이 값을 쓴다

- [ ] **Step 1: Vercel 설정 작성**

`vercel.json`:

```json
{
  "cleanUrls": true,
  "outputDirectory": "landing"
}
```

`cleanUrls` 를 켜면 `/installed.html` 이 `/installed` 로도 접근된다. 확장이 여는 주소가 이 형태다.

- [ ] **Step 2: 배포**

Run: `npx vercel deploy --prod`

프롬프트가 나오면 새 프로젝트를 만들고 루트 디렉터리는 기본값으로 둔다.

Expected: `https://...vercel.app` 형태의 주소 출력

- [ ] **Step 3: 확장 설정에 도메인 반영**

`extension/src/shared/config.local.js` 의 `landingOrigin` 을 Step 2에서 받은 주소로 바꾼다.

```js
  landingOrigin: 'https://실제-주소.vercel.app',
```

- [ ] **Step 4: 배포 확인**

브라우저에서 배포된 주소를 연다.

Expected: 랜딩이 뜨고, 앰플리튜드에 `Landing Viewed` 가 `platform: desktop` 으로 들어간다. `/privacy` 와 `/installed` 도 404가 아니어야 한다 (installed.html은 다음 태스크에서 만들므로 지금은 404가 맞다)

- [ ] **Step 5: 커밋**

```bash
git add vercel.json
git commit -m "chore: Vercel 배포 설정"
```

---

## Task 7: 온보딩과 신원 연결

**Files:**
- Create: `landing/installed.html`
- Create: `landing/src/installed.js`
- Create: `extension/src/link/index.js`
- Modify: `build.js` (엔트리 추가)
- Modify: `extension/manifest.json` (콘텐츠 스크립트 추가)
- Modify: `extension/src/background/index.js` (신원 수신)
- Modify: `extension/src/shared/messages.js` (메시지 타입 추가)

**Interfaces:**
- Consumes: `setDeviceId`, `setUserId` from `background/identity.js`
- Produces:
  - `/installed` 페이지가 `document.documentElement.dataset.crfLandingDeviceId` 에 자기 device_id를 노출한다
  - 확장이 그 값을 읽어 자기 device_id로 덮어쓴다
  - `Onboarding Viewed`, `Onboarding Example Clicked` 수집

- [ ] **Step 1: 메시지 타입 추가**

`extension/src/shared/messages.js` 의 `MESSAGES` 에 추가한다.

```js
  LINK_IDENTITY: 'crf:link-identity',
```

- [ ] **Step 2: 온보딩 페이지 작성**

`landing/installed.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>설치 완료 | 쿠팡 체험단 리뷰 필터</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <main>
    <h1>설치됐습니다</h1>
    <p class="lead">
      이제 쿠팡 상품 페이지를 열면 리뷰 위에 자동으로 뜹니다.
      아래 상품으로 바로 확인해 보세요.
    </p>
    <div class="cta-area">
      <a class="btn" id="example-link" href="https://www.coupang.com/" target="_blank" rel="noopener">
        예시 상품 열어보기
      </a>
    </div>
    <p class="hint">배너가 안 보이면 리뷰 영역까지 스크롤해 주세요.</p>
  </main>

  <script src="https://cdn.amplitude.com/libs/analytics-browser-2.11.1-min.js.gz"></script>
  <script src="src/config.local.js"></script>
  <script src="src/analytics.js"></script>
  <script src="src/installed.js"></script>
</body>
</html>
```

`example-link` 의 href는 리뷰가 많고 체험단이 섞인 실제 쿠팡 상품 주소로 바꾼다. 계획 1 Task 4에서 픽스처를 뜬 상품을 쓰면 된다.

- [ ] **Step 3: 온보딩 로직 작성**

`landing/src/installed.js`:

```js
(function () {
  window.CRF.init()

  const token = localStorage.getItem('crf_handoff_token')
  if (token) window.CRF.setUserId(token)

  document.documentElement.dataset.crfLandingDeviceId = window.CRF.getDeviceId()
  if (token) document.documentElement.dataset.crfLandingUserId = token

  window.CRF.track('Onboarding Viewed', {})

  document.getElementById('example-link').addEventListener('click', () => {
    window.CRF.track('Onboarding Example Clicked', {})
  })
})()
```

device_id를 DOM 데이터 속성으로 노출하는 이유는, 확장이 앰플리튜드의 내부 저장 형식을 몰라도 값을 읽을 수 있게 하기 위해서다. SDK가 저장 키를 바꿔도 이 방식은 깨지지 않는다.

- [ ] **Step 4: 연결용 콘텐츠 스크립트 작성**

`extension/src/link/index.js`:

```js
import { MESSAGES } from '../shared/messages.js'

document.documentElement.setAttribute('data-crf-installed', '1')

const deviceId = document.documentElement.dataset.crfLandingDeviceId
const userId = document.documentElement.dataset.crfLandingUserId

if (deviceId) {
  chrome.runtime.sendMessage({
    type: MESSAGES.LINK_IDENTITY,
    deviceId,
    userId: userId ?? null,
  })
}
```

`data-crf-installed` 속성을 심는 것은 랜딩의 `is_extension_installed` 판별에도 쓰인다.

- [ ] **Step 5: 백그라운드에 수신 처리 추가**

`extension/src/background/index.js` 의 리스너 안에 추가한다.

```js
  if (message?.type === MESSAGES.LINK_IDENTITY) {
    (async () => {
      await setDeviceId(message.deviceId)
      if (message.userId) await setUserId(message.userId)
      sendResponse({ ok: true })
    })()
    return true
  }
```

상단 import를 교체한다.

```js
import { getDeviceId, setDeviceId, setUserId } from './identity.js'
```

- [ ] **Step 6: build.js에 엔트리 추가**

```js
    link: 'extension/src/link/index.js',
```

- [ ] **Step 7: manifest에 콘텐츠 스크립트 추가**

`content_scripts` 배열에 항목을 추가한다. `실제-주소` 는 Task 6에서 받은 도메인으로 바꾼다.

```json
    {
      "matches": ["https://실제-주소.vercel.app/*"],
      "js": ["dist/link.js"],
      "run_at": "document_idle"
    }
```

- [ ] **Step 8: 확장이 온보딩 페이지를 열게 하기**

`extension/src/background/index.js` 의 `onInstalled` 리스너를 교체한다.

```js
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install') return
  await track(EVENTS.EXTENSION_INSTALLED, {})
  await chrome.storage.local.set({ crf_installed_at: Date.now() })
  chrome.tabs.create({ url: new URL('/installed', CONFIG.landingOrigin).toString() })
})
```

- [ ] **Step 9: 랜딩 재배포**

Run: `npx vercel deploy --prod`

- [ ] **Step 10: 신원 연결 확인**

1. `npm run build`
2. `chrome://extensions` 에서 확장을 제거하고 다시 로드한다
3. 온보딩 페이지가 자동으로 열리는지 본다
4. 서비스 워커 콘솔에서 확인한다

```js
chrome.storage.local.get(['crf_device_id', 'crf_user_id']).then(console.log)
```

Expected: `crf_device_id` 가 랜딩 페이지의 앰플리튜드 device_id와 같다. 랜딩에서 확인하려면 온보딩 페이지 콘솔에서 `document.documentElement.dataset.crfLandingDeviceId` 를 읽어 비교한다

- [ ] **Step 11: 퍼널 연결 확인**

앰플리튜드에서 해당 device_id로 User Look-Up 한다.

Expected: `Landing Viewed`, `Install CTA Clicked`, `Extension Installed`, `Onboarding Viewed`, `Banner Rendered` 가 **한 사용자** 아래에 이어져 있다. 이게 이 프로젝트 계측의 핵심 검증이다

- [ ] **Step 12: 커밋**

```bash
git add landing/installed.html landing/src/installed.js extension/src/link/ build.js extension/manifest.json extension/src/background/index.js extension/src/shared/messages.js
git commit -m "feat: 온보딩 페이지와 랜딩-확장 신원 연결"
```

---

## Task 8: 제거 추적

**Files:**
- Create: `landing/uninstalled.html`
- Create: `landing/src/uninstalled.js`

**Interfaces:**
- Consumes: 쿼리 파라미터 `d` (확장의 device_id)
- Produces: `Extension Removed` 수집

- [ ] **Step 1: 페이지 작성**

`landing/uninstalled.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>삭제됨 | 쿠팡 체험단 리뷰 필터</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <main>
    <h1>삭제됐습니다</h1>
    <p class="lead">써 주셔서 고맙습니다. 불편한 점이 있었다면 알려 주시면 고치겠습니다.</p>
    <p><a href="index.html">처음으로</a></p>
  </main>

  <script src="https://cdn.amplitude.com/libs/analytics-browser-2.11.1-min.js.gz"></script>
  <script src="src/config.local.js"></script>
  <script src="src/analytics.js"></script>
  <script src="src/uninstalled.js"></script>
</body>
</html>
```

- [ ] **Step 2: 로직 작성**

`landing/src/uninstalled.js`:

```js
(function () {
  const params = new URLSearchParams(window.location.search)
  const deviceId = params.get('d')

  amplitude.init(window.CRF_CONFIG.amplitudeApiKey, undefined, {
    deviceId: deviceId ?? undefined,
    defaultTracking: { pageViews: false, sessions: false, formInteractions: false },
  })

  amplitude.track('Extension Removed', {
    surface: 'extension',
    platform: 'desktop',
  })
})()
```

`deviceId` 를 초기화 옵션으로 넘겨야 제거한 사용자와 같은 사람으로 집계된다. `surface` 를 `extension` 으로 두는 이유는 이 이벤트의 주체가 확장이기 때문이다.

- [ ] **Step 3: 재배포하고 확인**

Run: `npx vercel deploy --prod`

1. 확장의 device_id를 미리 적어 둔다
2. `chrome://extensions` 에서 확장을 삭제한다
3. 제거 페이지가 자동으로 열린다

Expected: 앰플리튜드에 `Extension Removed` 가 들어가고, device_id가 적어 둔 값과 같다

- [ ] **Step 4: 커밋**

```bash
git add landing/uninstalled.html landing/src/uninstalled.js
git commit -m "feat: 확장 제거 추적"
```

---

## Task 9: 스토어 자산과 제출

**Files:**
- Create: `extension/assets/icon-16.png`, `icon-48.png`, `icon-128.png`
- Modify: `extension/manifest.json`
- Modify: `landing/src/config.local.js`

**Interfaces:**
- Consumes: 없음
- Produces: 웹스토어에 게시된 확장과 그 설치 주소

- [ ] **Step 1: 아이콘 제작**

128x128 기준으로 만들고 48, 16으로 줄여 저장한다. 필터나 돋보기 계열의 단순한 형태가 작은 크기에서 잘 읽힌다. 쿠팡 로고나 색상을 쓰지 않는다. 상표 문제가 생기고 심사에서도 걸린다.

- [ ] **Step 2: manifest에 아이콘 등록**

`"action"` 을 교체하고 `"icons"` 를 추가한다.

```json
  "icons": {
    "16": "assets/icon-16.png",
    "48": "assets/icon-48.png",
    "128": "assets/icon-128.png"
  },
  "action": {
    "default_title": "체험단 리뷰 필터",
    "default_icon": {
      "16": "assets/icon-16.png",
      "48": "assets/icon-48.png"
    }
  },
```

- [ ] **Step 3: 패키징**

Run: `npm run build`

```bash
cd extension && zip -r ../extension.zip . -x 'src/*' && cd ..
```

`src/` 를 제외하는 이유는 `config.local.js` 에 담긴 키가 번들에 이미 들어갔고, 원본 소스를 굳이 배포할 필요가 없기 때문이다. 다만 `src/sidepanel/index.html` 과 `src/content/content.css` 는 매니페스트가 참조하므로 제외하면 안 된다. 아래로 대체한다.

```bash
cd extension && zip -r ../extension.zip manifest.json dist assets src/sidepanel/index.html src/sidepanel/style.css src/content/content.css && cd ..
```

- [ ] **Step 4: 웹스토어 제출**

1. 크롬 웹스토어 개발자 대시보드에 등록한다 (최초 1회 등록비 5달러)
2. 새 항목을 만들고 `extension.zip` 을 업로드한다
3. 아래를 입력한다

| 항목 | 내용 |
|---|---|
| 설명 | 쿠팡 리뷰에서 체험단 제공 리뷰를 찾아 표시하고, 협찬을 제외한 평점을 다시 계산합니다. 판정하지 않고 쿠팡이 붙인 표기 문구를 근거로 보여줍니다. |
| 카테고리 | 쇼핑 |
| 개인정보 처리 방침 URL | `https://실제-주소.vercel.app/privacy` |
| 스크린샷 | 1280x800. 배너가 보이는 화면과 패널이 열린 화면 두 장 이상 |
| 권한 사유 | 각 권한마다 왜 필요한지 한 줄씩. 개인정보 처리 방침의 "권한 사용 목적" 문구를 그대로 쓴다 |

4. 제출한다

심사는 보통 며칠에서 2주 걸린다.

- [ ] **Step 5: 승인 후 스토어 주소 반영**

`landing/src/config.local.js` 의 `storeUrl` 을 실제 주소로 바꾸고 재배포한다.

Run: `npx vercel deploy --prod`

- [ ] **Step 6: 실제 설치 경로 검증**

시크릿 창이나 다른 프로필에서 확인한다.

1. 랜딩 접속
2. 설치 버튼 클릭
3. 웹스토어에서 설치
4. 온보딩 자동 오픈
5. 예시 상품에서 배너 확인

Expected: 앰플리튜드에서 이 다섯 단계가 한 사용자 아래에 이어진다

- [ ] **Step 7: 커밋**

```bash
git add extension/assets/ extension/manifest.json
git commit -m "feat: 확장 아이콘과 스토어 제출 준비"
```

---

## Task 10: 앰플리튜드 대시보드 구성

**Files:** 없음. 앰플리튜드 UI에서 작업한다

**Interfaces:**
- Consumes: 수집된 이벤트
- Produces: 퍼널 4개, 북극성 차트 1개, 가드레일 차트 1개

- [ ] **Step 1: 퍼널 F1 획득**

Funnel Analysis를 만들고 단계를 넣는다.

```
Landing Viewed → Install CTA Clicked → Store Redirected → Extension Installed
```

Conversion window는 1일로 둔다. `cta_location` 으로 분할해 위치별 성과를 본다.

- [ ] **Step 2: 퍼널 F2 활성화**

```
Extension Installed → Onboarding Viewed → Banner Rendered → Panel Opened
```

Conversion window는 7일로 둔다. 설치하고 며칠 뒤에 처음 쓰는 경우가 있다.

- [ ] **Step 3: 퍼널 F3 가치**

```
Banner Rendered → Panel Opened → Filter Toggled → Purchase Intent Clicked
```

Conversion window는 1시간으로 둔다. 한 세션 안의 행동을 보는 퍼널이다.

- [ ] **Step 4: 퍼널 F4 리텐션**

Retention Analysis를 만든다.

| 항목 | 값 |
|---|---|
| Start event | `Extension Installed` |
| Return event | `Banner Rendered` |
| 단위 | 주 |

- [ ] **Step 5: 북극성 차트**

Event Segmentation을 만든다.

| 항목 | 값 |
|---|---|
| Event | `Filter Toggled` where `to_state = on` |
| Measure | Unique sessions |
| Interval | Weekly |

- [ ] **Step 6: 가드레일 차트**

Event Segmentation 하나에 두 이벤트를 올린다.

- `Extension Error` 의 Unique users
- `Extension Removed` 의 Unique users

- [ ] **Step 7: 실험 비교 차트**

`exp_default_filter` 를 아직 공통 프로퍼티로 보내지 않고 있다면 여기서 보완한다. `extension/src/background/analytics.js` 의 `commonProperties()` 를 교체한다.

```js
async function commonProperties() {
  const deviceId = await getDeviceId()
  const variants = {}
  for (const experiment of Object.values(EXPERIMENTS)) {
    variants[`exp_${experiment.id}`] = assign(deviceId, experiment.id, experiment.variants)
  }
  return {
    surface: 'extension',
    platform: 'desktop',
    app_version: chrome.runtime.getManifest().version,
    ...variants,
  }
}
```

상단 import에 추가한다.

```js
import { assign, EXPERIMENTS } from '../core/experiment.js'
```

그다음 앰플리튜드에서 F3 퍼널을 `exp_default_filter` 로 분할한다.

- [ ] **Step 8: 대시보드로 묶기**

위 차트 여섯 개를 하나의 Dashboard로 모은다. 이 대시보드 스크린샷이 포트폴리오의 핵심 자료가 된다.

- [ ] **Step 9: 커밋**

```bash
npm run build
git add extension/src/background/analytics.js
git commit -m "feat: 실험 배정값을 공통 프로퍼티에 포함"
```

---

## 완료 기준

- [ ] 랜딩이 공개 주소에서 뜨고 모바일에서 좌우 스크롤 없이 보인다
- [ ] 랜딩 이벤트 7개가 모두 수집된다

| 이벤트 | 확인 |
|---|---|
| `Landing Viewed` | 접속 |
| `Demo Viewed` | 데모 이미지까지 스크롤 |
| `Install CTA Clicked` | 데스크톱에서 설치 버튼 |
| `Store Redirected` | 위와 동일 |
| `Handoff Link Requested` | 모바일에서 링크 보내기 |
| `Handoff Link Opened` | `?ht=` 링크로 접속 |
| `Share Clicked` | 공유 버튼 |

- [ ] `Onboarding Viewed`, `Onboarding Example Clicked`, `Extension Removed` 가 수집된다
- [ ] **랜딩 방문부터 확장 첫 작동까지가 앰플리튜드에서 한 사용자로 이어진다**
- [ ] 모든 확장 이벤트에 `exp_default_filter` 와 `exp_banner_copy` 가 붙어 있다
- [ ] 확장이 웹스토어에서 설치 가능하다
- [ ] 퍼널 4개와 차트 2개가 대시보드에 모여 있다

네 번째 항목이 이 계획의 핵심이다. 이게 안 되면 획득 퍼널 전체가 무의미해진다.

---

## 그다음

배포가 끝나면 구현이 아니라 운영과 분석 단계다.

1. PC 비중이 높은 쇼핑 커뮤니티에 배포글을 올린다
2. 최소 2주간 데이터를 모은다
3. F2 활성화 퍼널에서 가장 큰 이탈 구간을 찾는다
4. 가설을 세우고 A/B로 검증한다
5. 결과를 포트폴리오로 정리한다

명세 10절의 성공 기준이 이 단계의 판정 기준이다.
