# 인수인계: 체험단 리뷰 제거기

작성일 2026-10-27. 이 폴더(`C:\Users\eldorado\Projects\바이브코딩`)에서 한 작업 전체를 다음 작업자(새 계정의 Claude 포함)가 이어받을 수 있게 정리했다. 세부 기록은 아래 "문서 지도" 의 파일에 있고, 이 문서는 그 입구다.

---

## 1. 프로젝트 목적과 구조

### 목적

쿠팡과 무신사 상품 페이지에서 체험단 리뷰에 표시를 붙이고, 버튼으로 숨기고, 체험단 리뷰를 뺀 평점을 보여 주는 크롬 확장이다. 사용자(개발자가 아님)의 **커머스 데이터 분석 취업 포트폴리오**이고, 제품을 실제로 내놓아 동의한 사용자의 행동 데이터를 Amplitude 로 모아 분석하는 것이 본체다. 확장 자체는 그 데이터를 얻는 수단이다.

| 항목 | 주소 또는 값 |
|---|---|
| 크롬 웹스토어 | https://chromewebstore.google.com/detail/diefbidjmimlnigjmkdbghjdhokhhpdk |
| 확장 ID | `diefbidjmimlnigjmkdbghjdhokhhpdk` |
| 소개 페이지(랜딩) | https://crf-review-remover.vercel.app |
| 개인정보 처리방침 | https://crf-review-remover.vercel.app/privacy |
| GitHub(공개) | https://github.com/jiwon026/coupang-review-filter |
| Vercel 프로젝트 | `review-remover` (main 푸시 시 자동 배포) |
| Amplitude | 조직 `tight-hall-464335`, 프로젝트 `쿠팡 체험단 리뷰 필터`. Claude 의 Amplitude 커넥터와는 다른 조직이다 |

### 폴더 구조

```
.
├─ extension/                  크롬 확장(스토어에 올라가는 것)
│  ├─ manifest.json            MV3. 권한 storage, sidePanel. 대상 주소 3개
│  ├─ icons/                   아이콘 SVG 원본과 PNG
│  └─ src/
│     ├─ core/                 순수 로직: 체험단 판별(sponsored.js), 평점 계산(rating.js), 실험 배정(experiment.js)
│     ├─ content/              쇼핑몰 페이지 조작: 누적, 표시, 숨기기, 배너(index.js 가 중심)
│     │  └─ sites/             쇼핑몰별 부품 coupang.js, musinsa.js. 주소, 선택자, 문구, 정렬, 숨기는 방식
│     ├─ background/           이벤트 전송(analytics.js), 동의(consent.js), 기기 번호, 탭별 요약, 설치와 업데이트(lifecycle.js)
│     ├─ sidepanel/            사이드 패널
│     ├─ onboarding/           설치 직후 통계 안내와 동의 화면
│     └─ shared/               이벤트 이름, 메시지, 설정. config.local.js(키, git 밖)
├─ site/                       랜딩, 처리방침, 제거 안내(Vercel 정적 사이트)
│  ├─ public/                  HTML, CSS, 사진(img/)
│  └─ src/landing/             랜딩 스크립트: 방문자 번호, 유입원, 화면 종류, 실험, 전송
├─ scripts/                    아이콘 생성, 사진 가공, 제출 패키지(package.js), 무신사 실브라우저 확인(verify-musinsa.mjs, lib/cdp.mjs)
├─ tests/                      Vitest + jsdom. 51개 파일, 1,497개
├─ docs/
│  ├─ superpowers/specs/       설계 명세(하나의 파일, 13개 절)
│  ├─ superpowers/plans/       단계별 구현 계획 6개
│  ├─ research/                다른 쇼핑몰 지원 가능성 조사
│  ├─ store/listing.md         스토어 등록 자료(붙여 넣을 문구)
│  ├─ launch/                  홍보 채널 조사, 채널별 링크와 글 초안
│  └─ development.md           개발 방법
├─ dev/active/coupang-review-filter/   진행 상태(context), 체크리스트(tasks), 초기 계획(plan)
├─ release/                    (git 밖) 제출 zip, 스크린샷 원본과 스토어용 사진, 사진 만드는 스크립트
├─ .superpowers/sdd/           (git 밖) 계획별 구현 판정 기록(Ruling)과 리뷰 diff
├─ build.js                    확장 번들 빌드(esbuild)
├─ vercel.json                 사이트 배포 설정
├─ README.md                   공개용 소개
├─ HANDOFF.md                  이 문서
└─ CLAUDE.md                   Claude 가 이 폴더에서 지킬 규칙
```

---

## 2. 완료한 작업

| 단계 | 기간 | 내용 | 계획 문서 |
|---|---|---|---|
| 계획 1 확장 코어 | 09-28~30 | 체험단 판별, 평점 계산, 배지, 숨기기, 배너, 본 리뷰 누적 | `plans/2026-09-28-extension-core.md` |
| 계획 2 계측 | 09-30~10-02 | Amplitude 전송, 기기 번호, 실험 배정, 정렬 기록, 구매 의도, 사이드 패널, 오류 신호 | `plans/2026-09-28-instrumentation.md` |
| 계획 3a 스토어 제출 | 10-02 | 동의 화면과 전송 게이트, 식별자 가명화, 처리방침, 패키징, 이름과 아이콘. 10-05 게시(1.0.0) | `plans/2026-10-02-store-submission.md` |
| 계획 3b 랜딩 | 10-03~07 | 소개 페이지, 방문 계측, 설치 버튼 실험, 모바일 넘기기, 처리방침 개정, 홍보 채널 조사와 글 초안 | `plans/2026-10-03-landing.md` |
| 다른 쇼핑몰 조사 | 10-07 | 무신사 가능(표시 있음, 빼고 볼 방법 없음), 올리브영 불가(표시 없음) | `research/2026-10-07-other-stores.md` |
| 계획 4 무신사 지원 | 10-08~12 | 쇼핑몰 부품 구조, 무신사 부품, 동의 범위 표시, 이름 변경, 패널 숨김 버튼, 범위 안내 문구. 10-12 게시(1.1.0) | `plans/2026-10-08-musinsa.md` |
| 마무리 | 10-12~27 | 랜딩에 무신사 문구와 사진, README 정리, 저장소 공개 전환(10-24), Amplitude와 스토어 대시보드 대조 | |

확인된 것

- 1.0.0 → 1.1.0 업데이트 때 크롬이 권한을 다시 묻고, 허용하면 통계 안내 화면이 다시 열린다(사용자 크롬에서 확인)
- 무신사 실제 페이지 확인 35개 항목 통과(`npm run verify:musinsa`)
- 테스트 1,497개 통과

### 지금까지의 데이터 (2026-10-27, 지난 30일)

| 단계 | 수 | 출처 |
|---|---|---|
| 랜딩 방문 | 27 | Amplitude `Landing Viewed` |
| 설치 버튼 누름 | 8 | Amplitude `Install CTA Clicked` |
| 랜딩을 거친 스토어 페이지 조회 | 11 | 스토어 대시보드 노출수, 매체 `landing` |
| 스토어 설치 | 56 | 대시보드. **대부분 자동 점검**(미국 68%, ChromeOS 39%, 언어 정보 9건) |
| 사람의 설치 | 약 9 | 대시보드의 한국어 설치 |
| 주간 사용자 | 11~12 | 대시보드(설치돼 켜진 크롬. 실제 사용이 아님) |
| 동의하고 배너를 본 실제 사용자 | 4 | Amplitude, 본인 기기 5대 제외 |

유입: 부트캠프 슬랙 한 번(10-06), 홍보하지 않은 `chatgpt.com` 3회(10-05 무렵, 10-19, 10-25). 나머지 채널(티스토리, Threads, 인스타그램, 긱뉴스, 디스콰이엇, 카카오톡)은 아직 올리지 않았다.

---

## 3. 남은 작업과 다음에 할 일

우선순위 순서다.

1. **홍보.** 표본이 4명이라 분석을 시작할 수 없다. 초안은 `docs/launch/channels.md` 에 있다(무신사 반영됨). 올리면 같은 파일의 "올린 기록" 에 날짜와 주소를 적는다. 슬랙 두 번째 글은 `utm_campaign=update` 링크를 쓰라고 안내했다(표에는 넣지 않았다. 같은 `utm_source` 가 두 번 나오면 링크 테스트가 실패한다)
2. **포트폴리오 장표 숫자 갱신.** `C:\Users\eldorado\Projects\포트폴리오` 의 `p-web-a.html`(기존 판)과 `v5-web-a.html`(5초 판). 고칠 것: "유입은 슬랙 한 번이 전부" 는 이제 틀림(chatgpt.com 유입), 주간 사용자 날짜 10/16 → 10/25, 커밋 수. 새로 넣을 만한 것: "설치 56건 중 사람은 약 9건" 을 걸러낸 이야기, 동의율 약 절반, ChatGPT 유입. 바꿀 문구 초안은 10-27 대화에서 사용자에게 줬다
3. **계획 3c: 대시보드와 분석.** 데이터가 쌓이면 시작한다. 시작할 때 계획을 쓴다. 다룰 것: 북극성(숨김이 켜진 상태로 배너를 본 세션), 퍼널, 가드레일, 명세 4.4절(정렬별 체험단 비중) 검증, 실험 판독, 포트폴리오 문서. Amplitude 를 어떻게 볼지(사용자 크롬으로 열기, 데이터 내보내기, 커넥터) 그때 정한다
4. **(선택) 스토어 사진 3번 교체.** 1.1.0 패널 사진 `release/screenshots/store/3-panel-v3.jpg` 을 만들어 뒀다. 올릴지는 사용자가 정한다
5. **(선택) GA4 를 스토어에 연결.** 채널별 설치 수를 보려면 필요하다. 사용자가 대시보드에서 직접 해야 한다. `docs/launch/channels.md` 의 "구글 애널리틱스 연결"
6. **(보류) 무신사 "전체 후기로 계산하기" 버튼.** 사용자 문의(10-08). 무신사의 공개되지 않은 후기 목록 주소를 부르게 되므로 버튼을 눌렀을 때만 부르는 방식으로 검토한다
7. **(보류) 계획 4 최종 리뷰에서 미룬 것.** 주소가 먼저 바뀌는 이동에서 앞 상품 카드가 섞임, 건강 신호 임계값을 부품이 정하기, 체험단 문구를 표시 부품 안에서만 찾기. 명세 13.5 에 주의로 적어 둠
8. **(정리) 판정 기록.** `.superpowers/sdd/2026-10-03-landing/` 과 `2026-10-08-musinsa/` 의 Ruling 을 사용자에게 정리해 보여 준 뒤 지우기로 했다(아직 안 함)
9. **(확인) macOS.** 주간 사용자의 23% 가 macOS 인데 맥에서 확인해 본 적이 없다

---

## 4. 중요한 결정과 이유

전체 목록은 명세 맨 끝의 "부록: 의사결정 기록" 과 각 절에 있다. 자주 다시 묻게 되는 것만 모았다.

### 제품

| 결정 | 이유 |
|---|---|
| 웹사이트가 아니라 브라우저 확장 | 주소를 붙여 넣는 사이트는 쇼핑몰의 봇 차단과 약관 문제가 있다. 확장은 사용자가 이미 연 화면만 읽는다 |
| 쇼핑몰이 붙인 문구만 보고 판별 | 말투로 추측하면 틀린 판정이 생기고 설명할 수 없다. 쿠팡 `쿠팡체험단 이벤트로 상품을 무료로 제공받아...`, 무신사 `이 후기는 제품을 무상으로 제공받아...` |
| 화면에서 본 리뷰만 누적해 계산 | 쇼핑몰의 후기 목록 주소를 확장이 직접 부르지 않는다(공개되지 않은 주소, 요청 폭주, 약관). 대신 "본 리뷰 기준, 더 보면 늘어남" 을 배너와 패널에 적었다 |
| 무신사는 같은 확장에 추가, 이름에서 "for 쿠팡" 제거 | 설치 수와 데이터가 한곳에 모인다. 따로 내면 등록, 심사, 처리방침이 두 벌이다 |
| 올리브영은 넣지 않음 | 체험단 리뷰에 구분할 표시가 없다 |
| 무신사에서는 카드를 없애지 않고 1px 로 접음 | 후기 전체보기는 화면 밖 카드를 지우고 카드 높이로 자리를 잡는 목록이라 높이 0 이 계산을 깨뜨릴 수 있다 |
| 무신사 `체험단` 조건에서는 숨기지 않고 누적도 하지 않음 | 숨기면 빈 화면이 되고, 누적하면 사용자가 고른 조건 때문에 비중이 부푼다 |
| 대상 주소는 상품 페이지와 후기 전체보기만 | 권한을 좁게 둔다. 실측에서 상품 링크는 새 탭으로 열렸다 |

### 계측과 개인정보

| 결정 | 이유 |
|---|---|
| 동의한 경우에만 전송(설치 직후 화면에서 선택) | 크롬 웹스토어 사용자 데이터 정책. 미동의면 아무것도 보내지 않고 쌓아 두지도 않는다 |
| 상품 번호와 리뷰 번호는 설치마다 다른 솔트로 해시해 보냄(`product_key`, `page_key`) | 원문 번호가 기기 밖으로 나가지 않는다. 무신사는 `musinsa:<번호>` 로 만들어 쿠팡과 겹치지 않는다 |
| 동의에 범위 표시(`CONSENT_SCOPE = 2`) | 1.0.x 의 동의는 쿠팡만 알리고 받았다. 업데이트 순간에 저장값을 고치면 실패할 때 옛 동의로 무신사 통계가 나간다. 읽을 때 범위가 다르면 미선택으로 보면 실패해도 닫힌다 |
| 실험은 기기 번호 해시로 고정 배정 | 서버 없이 같은 사람에게 같은 변형. 해시 끝에 최종 혼합을 넣어 실험끼리 배정이 상관되지 않게 했다 |
| 무신사의 `Banner Rendered` 는 처음 한 번과 새 후기 10개마다 | 후기 전체보기는 스크롤마다 카드가 바뀌어 페이지 단위로 보내면 폭주한다 |
| 랜딩과 확장은 사람 단위로 잇지 않고 집계로 잇는다 | 잇으려면 확장이 랜딩에 접근해야 해서 권한과 고지가 늘어난다. 목표 표본에서 사람 단위로 이어도 얻는 것이 적다 |
| 랜딩 방문자 번호는 localStorage 에 지속, `#notrack` 으로 제외 | 동의 배너 없이 처리방침에 적었다. 만든 사람의 방문을 빼는 방법이기도 하다 |
| 랜딩은 운영 주소에서만 전송 | 로컬과 미리보기 배포가 데이터를 오염시키지 않게 한다 |

### 기술

| 결정 | 이유 |
|---|---|
| 프레임워크 없이 순수 JavaScript, esbuild | 확장이 작고 번들 네 개뿐이다. 심사에서 원격 코드나 큰 의존성을 설명할 일이 없다 |
| Vitest + jsdom, 실측 원문 픽스처 | 쿠팡 정렬 버튼의 클래스를 줄여 적은 픽스처 때문에 정렬이 늘 `best` 로 기록된 버그가 있었다. 픽스처는 실측 원문을 줄이지 않는다 |
| 무신사 실브라우저 확인은 크롬 헤드리스 + CDP 로 콘텐츠 스크립트를 직접 넣음 | 일반 크롬은 명령줄로 확장을 싣는 것을 막는다 |
| 쇼핑몰별 부품(`content/sites/`) | 쿠팡 전용 코드가 공통 코드에 섞여 있었다. 새 쇼핑몰은 파일 하나로 더한다 |

### 운영

| 결정 | 이유 |
|---|---|
| 대시보드의 설치 수를 믿지 않음 | 스토어 공개와 업데이트마다 자동 점검 설치가 수십 건 잡힌다. 사람 수는 한국어 설치 수와 Amplitude 로 본다 |
| 커밋 작성자 이메일은 그대로 두고 저장소 공개 | 사용자 결정(10-24). 공개 전 기록 전체에서 키, 비밀 파일, 로컬 경로가 없음을 확인했다 |

---

## 5. 실행 방법, 환경, 패키지

자세한 것은 `docs/development.md`.

### 필요한 것

- Node.js 24 이상(이 컴퓨터는 v24.11.0), npm
- 크롬(`C:/Program Files/Google/Chrome/Application/chrome.exe`). 다른 곳이면 `CHROME_PATH` 환경 변수
- 개발 의존성: esbuild, vitest, jsdom, sharp, fflate (`npm install`)
- 사용자 터미널은 Windows PowerShell 5.1 이다. 안내하는 명령에 `&&` 를 쓰지 않는다

### 설정

```powershell
Copy-Item extension/src/shared/config.example.js extension/src/shared/config.local.js
```

`config.local.js` 의 `amplitudeApiKey` 에 Amplitude 키를 넣는다. git 에 올라가지 않는다. 키가 없어도 확장은 동작하고 계측만 꺼진다. 이 파일은 이 컴퓨터에만 있으니 컴퓨터를 바꾸면 Amplitude 에서 키를 다시 받아 넣는다.

사이트 운영 빌드는 Vercel 환경 변수 `AMPLITUDE_API_KEY`, `CONTACT_EMAIL` 을 쓴다(Vercel 프로젝트에 등록돼 있음).

### 명령

```bash
npm install
npm run build          # 확장 개발 빌드(디버그 로그 켜짐)
npm test               # 테스트 1,497개, 약 1분
npm run package        # 스토어 제출용 zip → release/review-remover-<버전>.zip
npm run build:site     # 랜딩 스크립트 개발 빌드
npm run verify:musinsa # 실제 무신사 페이지 확인(약 3분, 크롬 창이 화면에 보여야 할 수 있음)
```

크롬에 불러오기: `npm run build` → `chrome://extensions` → 개발자 모드 → `압축해제된 확장 프로그램을 로드합니다` → `extension/` 폴더. 스토어 설치본이 켜져 있으면 배너가 두 개 뜨니 꺼 둔다.

### 배포와 제출

- 사이트: main 에 푸시하면 Vercel 이 배포한다. 배포 확인은 `curl` 이나 크롬 헤드리스로 한다
- 확장: `npm run package` → 사용자가 개발자 대시보드에 zip 을 올리고 `docs/store/listing.md` 의 문구를 붙여 넣어 제출한다. 확장 코드를 바꾸면 재심사다. 접근 사이트가 늘면 기존 설치자의 확장이 꺼지고 권한을 다시 묻는다

---

## 6. 알려진 문제와 주의할 점

### 하면 안 되는 것

- `extension/src/shared/config.local.js` 를 열거나 출력하거나 커밋하지 않는다. 푸시 전마다 `git ls-files | grep config.local` 이 0 인지 본다. **저장소는 공개 상태다**
- Vercel 프로젝트 `review-remover` 와 주소 `crf-review-remover.vercel.app` 을 지우거나 바꾸지 않는다. 확장 패키지에 박혀 있다(처리방침 링크, 제거 주소). 자체 도메인을 붙이면 `site/src/landing/config.js` 의 `SITE_ORIGIN` 도 바꿔야 한다(안 바꾸면 랜딩 기록이 0건)
- Vercel 의 Web Analytics, Speed Insights 를 켜지 않는다(처리방침에 없다)
- main 푸시는 공개 사이트가 바뀌므로 사용자 확인 뒤에 한다

### 도구의 한계

- **크롬 웹스토어 개발자 대시보드는 Claude 가 볼 수 없다.** 크롬이 확장(Claude in Chrome 포함)의 웹스토어 접근을 막는다. 숫자는 사용자 캡처로 받는다. Chrome Web Store API 는 업로드와 게시만 되고 통계는 없다
- **Amplitude 는 Claude in Chrome 으로 사용자 크롬에서 연다.** 크롬 창이 최소화돼 있으면 화면이 멈추니 띄워 달라고 한다. 차트는 저장하지 않고 탭은 닫는다
- **내장 브라우저(Claude Browser)는 배포된 사이트의 CSS, 스크립트, 이미지를 막는다**(`ERR_BLOCKED_BY_CLIENT`). 배포 화면 확인은 크롬 헤드리스로: `chrome.exe --headless=new --screenshot=<백슬래시 절대경로>.png <주소>`. 헤드리스는 랜딩의 로봇 규칙에 걸려 이벤트를 보내지 않으므로 실제 전송 확인은 사용자 브라우저가 필요하다
- 내장 브라우저 창이 가려져 있으면 무신사 후기 전체보기가 카드를 그리지 않는다
- 쿠팡은 헤드리스 접속을 막아 자동 확인이 안 된다. 쿠팡은 사용자가 실제 크롬에서 본다
- GitHub MCP 커넥터는 연결이 실패한다. `gh` CLI 는 로그인돼 있다

### 데이터 해석

- **분석에서 뺄 본인 기기(확장):** `a5426cee`(지금 크롬), `17049ed0`, `7c48e1ad`, `b58ff389`, `fd4408a1`. 전체 번호는 `dev/active/coupang-review-filter/coupang-review-filter-context.md`
- 랜딩의 본인 방문: 사용자 브라우저는 `#notrack` 으로 빠져 있다. `utm_source` 가 `test_` 로 시작하는 방문(`test_keepalive` 등)은 확인 작업이다
- `app_version` 0.2.0 미만은 정렬 값이 늘 `best` 로 기록된 버그가 있어 정렬 분석에서 뺀다
- 무신사 데이터의 주의(마지막 9개 이하 후기는 이벤트에 안 실림, 정렬 값은 정렬별 분석에 못 씀, `pages_seen` 은 쿠팡과 뜻이 다름)는 명세 13.5
- Amplitude 에 우리 코드에 없는 `watch_tutorial` 이벤트가 2건 있다(10-04, 10-14). 키가 확장 안에 공개돼 있어 누구나 보낼 수 있다. 우리 이벤트 이름만 골라 쓰면 된다
- Amplitude 의 숫자는 동의한 사람만이다. 동의율은 이벤트로 잴 수 없고 대시보드의 사람 설치 수로 나눠 추정한다

### 코드와 테스트

- 전체 테스트에서 가끔 시간 초과로 흔들리는 테스트가 둘 있다(`background.test.js` 의 GET_VARIANT, `sidepanel.test.js` 의 "페이지가 숨겨질 때는 묻지 않는다"). 다시 돌리면 통과한다. 원인은 확인하지 않았다
- `npm run package` 뒤에는 `extension/dist` 가 운영 빌드로 남는다. 개발을 이어 가려면 `npm run build`
- 무신사 선택자는 class 이름 앞부분(`[class*="..."]`)과 `data-` 속성에 기댄다. 무신사가 화면을 바꾸면 `npm run verify:musinsa` 로 먼저 확인한다
- git 의 "LF will be replaced by CRLF" 경고는 무시해도 된다

---

## 문서 지도

| 알고 싶은 것 | 볼 곳 |
|---|---|
| 지금 상태, 다음 할 일, 분석 주의 사항 | `dev/active/coupang-review-filter/coupang-review-filter-context.md`, `-tasks.md` |
| 왜 이렇게 만들었나 | `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md` (11절 동의, 12절 랜딩, 13절 무신사, 부록 의사결정 기록) |
| 각 단계를 어떻게 구현했나 | `docs/superpowers/plans/` |
| 구현 중 판정 | `.superpowers/sdd/<계획>/progress.md` (git 밖, 이 컴퓨터에만) |
| 스토어에 붙여 넣을 문구 | `docs/store/listing.md` |
| 홍보 링크와 글 초안, 올린 기록 | `docs/launch/channels.md` |
| 개발 방법 | `docs/development.md` |
