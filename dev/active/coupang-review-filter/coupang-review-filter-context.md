# 쿠팡 체험단 리뷰 필터: 컨텍스트

Last Updated: 2026-10-03 밤 (계획 3b 랜딩 배포 완료, Task 9 는 내일)

## 계획 3b 현재 상태 (2026-10-03 저녁)

- 브랜치 `feat/landing`, 코드 완료. Task 0~7 과 최종 브랜치 리뷰(opus), fix wave, 재리뷰까지 끝났다. 그 뒤 사용자가 로컬 화면을 보고 아래 구역 배치를 바꿨다(기능과 사진을 한 줄에 짝지어 좌우 번갈아, 사진 폭 400/360/260px. 누적 안내 문구 추가, 예시 숫자는 `지금까지 본 리뷰 60개 중 체험단 40개`). 테스트 1097개 통과. `extension/` 의 diff 는 0줄
- **2026-10-03 저녁에 배포했다**(main = 5f21cb6). 배포된 주소에서 화면(PC, 좁은 폭, 다크 모드), 처리방침 10절, 제거 페이지, `#notrack` 을 크롬 헤드리스로 확인했다. 내장 브라우저는 이 주소의 하위 요청을 막아(ERR_BLOCKED_BY_CLIENT) 쓸 수 없다
- 사용자가 실제 크롬에서 `Landing Viewed`, `Demo Viewed` 도착과 Country `-` 를 확인했다. 그 결과로 처리방침 5절에 IP 문구를 넣어 배포했다(main = 446b657). 사용자는 평소 브라우저에서 `#notrack` 을 열어 뒀다
- **내일 이어서 할 것: Task 9(유입 준비).** 사용자는 어느 커뮤니티에 올릴지 정하지 못했고 후보를 원한다. 10-03 저녁에 조사 에이전트를 돌렸다. 결과가 저장돼 있으면 `docs/launch/community-research.md` 에 있다. 없으면 다시 조사한다(각 커뮤니티의 홍보 규정을 추정하지 말고 직접 열어 확인). 그 뒤 `docs/launch/channels.md` 에 채널별 UTM 링크 표, 글 초안 1편, 심사 통과 뒤 절차(STORE_LIVE, GA4 연결 여부 결정, 사진 교체 절차)를 쓴다
- 그 밖에 남은 것: 심사 통과 뒤 `STORE_LIVE = true`. 계획이 다 끝나면 원장의 Ruling 19개를 사용자에게 정리해 보여 주고 `.superpowers/sdd/2026-10-03-landing/` 을 지운다(지금은 지우지 않는다)
- 계획 `docs/superpowers/plans/2026-10-03-landing.md`, 근거는 명세 12절. 원장 `.superpowers/sdd/2026-10-03-landing/progress.md` 에 Ruling 15개와 보류 항목
- 사용자 결정: 랜딩과 확장은 집계 수준으로만 잇는다. 모바일은 이메일 없는 넘기기. 방문자 번호는 localStorage 지속. 실험 2종(`hero_only`, `hero_sticky`), PC 만. 첫 화면은 B 절충형
- 랜딩은 `STORE_LIVE = false`(`site/src/landing/config.js`)라 지금은 "심사 중" 안내만 보인다. 심사 통과 뒤 이 한 줄을 true 로 바꿔 푸시하면 설치 버튼, 따라오는 바, 모바일 넘기기가 켜진다
- **기록은 운영 주소에서만 나간다.** `SITE_ORIGIN` 의 호스트와 `location.hostname` 이 같을 때만 보낸다. 사용자 도메인을 붙이면 `config.js` 도 바꿔야 한다(안 바꾸면 기록 0건). 로컬과 Vercel 미리보기에서는 보내지 않는다
- 사진: 사용자가 준 배너와 패널(`release/screenshots/raw/banner-4.8.png`, `panel-4.8.png`, gitignore)과 가공한 배지. 바꿀 때는 `node scripts/build-site-images.js`
- Task 0 실측: 스토어 대시보드는 UTM 별 설치를 직접 보여 주지 않는다. GA4 를 스토어 항목에 연결해야 보인다(연결 여부는 사용자가 통과 뒤 결정). 앰플리튜드는 `ip` 필드가 없으면 위치를 조회하지 않는다

### 3c 로 넘길 분석 주의 사항 (최종 리뷰에서)

- 분석 조건: `store_live = true`, 실험은 `device_class = desktop` 만, `id_persisted = true` 만 방문자 수에 쓴다
- 실험과 F1 의 앞 두 칸은 이벤트 수가 아니라 고유 `device_id` 로 읽는다(새로고침, 여러 탭마다 `Landing Viewed` 가 또 나간다)
- `entry_source` 는 그 로드의 값이다. 채널 비교는 방문자의 첫 `Landing Viewed` 로 귀속한다. `direct` 는 잡동사니(앱 내 브라우저, no-referrer, 북마크)
- 넘겨받은 PC 방문: `utm_source = handoff AND device_class = desktop`. 원래 채널은 `utm_campaign` 에 `clien-net` 처럼 점이 - 로 바뀌어 온다
- `desktop` 에는 설치할 수 없는 방문자(파이어폭스, 사파리, 데스크톱 모드 태블릿)가 섞인다. 클릭률 절대값은 낮게 나오고 변형 간 비교에는 영향이 없다
- 광고 차단기는 앰플리튜드를 막는다. 스토어 설치 수가 `Install CTA Clicked` 보다 많아도 모순이 아니다
- `Install CTA Clicked` 는 과소 집계(우클릭 새 탭 열기는 못 잡음). 변형 간 대칭
- `Demo Viewed` 는 창 높이에 좌우된다(높은 모니터에서는 스크롤 없이 찍힐 수 있다). 핵심 분석에 쓰지 않는다
- `time` 은 방문자 기기의 시계. 국가, OS, 브라우저 분해는 없다(보내지 않는다)
- 한 프로젝트에 확장과 사이트 이벤트가 같이 들어간다. `surface = site` 로 나눠 읽는다
- `internal` 은 처리방침과 제거 페이지가 no-referrer 라 지금은 나오지 않는다

## 다음에 가장 먼저 할 것

**확장 1.0.0 을 2026-10-02 에 크롬 웹스토어 심사에 제출했다. 지금은 심사 대기 중이다.**

1. 확장 ID 는 `diefbidjmimlnigjmkdbghjdhokhhpdk`, 스토어 주소는 https://chromewebstore.google.com/detail/diefbidjmimlnigjmkdbghjdhokhhpdk (심사 통과 뒤 열린다). `docs/store/listing.md` 에 기록됨
2. 심사를 기다리는 동안 계획 3b(본격적인 랜딩)를 시작한다. 계획 문서부터 쓴다(`docs/superpowers/plans/2026-10-02-store-submission.md` 끝의 로드맵 참고). 범위는 사용자와 먼저 합의
3. 심사 결과가 오면: 통과면 스토어 주소를 랜딩의 설치 버튼에 넣는다. 반려면 사유를 보고 대응한다. 구매 버튼 클릭 수집의 목적을 묻는 반려가 가장 가능성 높고, 그 경우 구매 의도 이벤트를 빼고 재제출하는 길이 있다

현재 상태:
- main 과 `feat/store-submission` 이 같은 커밋. 테스트 843개
- 사이트: https://crf-review-remover.vercel.app (Vercel 프로젝트 `review-remover`, 깃허브 main 을 자동 배포). 환경 변수 AMPLITUDE_API_KEY, CONTACT_EMAIL 은 Vercel 에만 있다. **이 프로젝트와 도메인은 확장이 스토어에 있는 동안 지우거나 이름을 바꾸면 안 된다**(주소가 패키지에 박혀 있다). Web Analytics, Speed Insights 는 켜지 않는다
- 제출한 패키지: `release/review-remover-1.0.0.zip` (gitignore, 이 기기에만 있음). 커밋 7662f5b 로 만든 것
- 원장: `.superpowers/sdd/2026-10-02-store-submission/progress.md` (모든 Ruling, parked 항목, 실브라우저 확인 결과)

패키지 안의 것(확장 코드, 온보딩과 패널 문구)을 바꾸면 버전을 올려 다시 심사를 받아야 한다. 사이트(처리방침, 제거 페이지, 랜딩)는 main 에 푸시하면 바로 배포된다. **사이트에 푸시할 때 처리방침의 내용이 확장의 실제 동작과 계속 일치하는지 확인한다.**

### 계획 2 마지막에 잡은 버그 (기록)

`review_sort` 가 항상 `best` 로 기록되고 있었다. 쿠팡은 정렬 버튼 두 개 모두에 `twc-font-bold` 를 기본으로 넣고 비활성에만 `twc-font-normal` 을 붙인다. 판정을 "비활성 전용 토큰이 없는 쪽이 활성, 정확히 하나가 아니면 unknown" 으로 고쳤다.
원인의 원인: 컨트롤러가 브리프에 실제 클래스를 줄여 적었고 테스트 픽스처도 줄인 문자열이었다. 이제 `tests/helpers/sort-buttons.js` 에 실측 원문이 있다.
**분석 시 `app_version >= 0.2.0` 만 쓴다.** 그 이전 이벤트는 `review_sort` 가 전부 `best` 이고 세션, filter_state, 배너 문구도 다르다.

### 아직 실브라우저로 안 본 것

- "도움이 돼요"나 "더보기"를 눌러도 `Banner Rendered` 가 새로 안 들어오는지(선택, 쿠팡 계정에 투표가 남음)
- 리뷰 0건 상품에서 `Extension Error` 가 안 나가는지
- release 빌드(`npm run build:release`) 스모크. 웹스토어 제출 전 필수

### 실브라우저로 확인한 것 (10/01~10/02)

- 사이드 패널: 열림, 다음 페이지에서 실시간 갱신, 1분 뒤 툴바로 열어도 숫자 유지
- 배너 문구: ratio 변형 정상. 이 기기는 `banner_copy=ratio`, `default_filter=off`
- 페이로드: `Panel Opened` 의 `trigger` 가 `banner` / `toolbar` 로 구분, `session_id`, 최상위 `platform: "Chrome Extension"`, `app_version: "0.2.0"`
- 최신순 전환 후 `Banner Rendered` 의 `review_sort: "latest"`
- 컨트롤러 실측(내장 브라우저): 최신순 클릭 후 60ms 에 버튼 클래스, 500ms 에 목록 교체. 타이밍 문제 없음

## 전체 진행 상황

| 계획 | 상태 |
|---|---|
| 계획 1: 확장 코어 | **완료**, main 머지 |
| 누적 집계 (계획 외 추가) | **완료**, main 머지 |
| 계획 2: 계측 | **완료**, main 머지, 실브라우저 검증 |
| 계획 3a: 웹스토어 제출 준비 | **제출 완료**(2026-10-02), 심사 대기 |
| 계획 3b: 랜딩 / 3c: 대시보드와 분석 | 로드맵만. 시작할 때 계획 작성 |

브랜치: main (feat/instrumentation 머지됨)
테스트: 304개 통과. config.local.js 없이도 통과(테스트가 실제 키와 네트워크에서 격리됨)

## 오늘(10/01) 한 일

- Task 8 리뷰: 요약을 서비스 워커 메모리에 두던 것을 `storage.session` 으로(워커가 30초 유휴로 꺼지면 패널이 숫자를 잃었음). 체험단 0건 배너에도 자세히 보기
- Task 8b(계획 외): 모든 이벤트에 `exp_default_filter`, `exp_banner_copy`, 콘텐츠 이벤트에 `product_id`. 없으면 A/B 분석과 상품별 분석이 불가능했음
- Task 9: 설치 이벤트, 제거 주소(랜딩 설정 전까지 꺼짐), `Extension Error`(렌더 예외, 셀렉터 깨짐 신호 셋을 페이지 떠날 때 누적 판정)
- 품질 보강 12항목
- 최종 브랜치 리뷰(opus) → fix wave 13항목: `session_id`, `Banner Rendered` 의 `filter_state` 와 변형 확정까지 관측 대기, 관측 키와 다시 그리기 키 분리, track 전체 보호, banner_copy 두 변형을 명세대로(헤드라인 강조만 다름), 진짜 페이지 체류 시간, 테스트 격리, `sort_pages_seen` 과 `page_first_review_id`, 공통 프로퍼티 우선, `Panel Opened` 의 `trigger` 복원 등

## 원격 저장소

- https://github.com/jiwon026/coupang-review-filter (**PRIVATE**)
- 공개 전환은 계획 3 완료 후 사용자 결정. 커밋 작성자 이메일 공개 여부도 그때
- 푸시 전 매번 키 유출 검사(추적 파일과 전체 히스토리에서 config.local.js 0건)

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md` | 명세. **4.4절(정렬별 노출 편향)이 핵심 발견**. 6.3절 이벤트 표는 실제 구현에 맞춰 갱신됨 |
| `.superpowers/sdd/2026-09-28-instrumentation/progress.md` | **작업 원장. 모든 Ruling 과 parked 항목.** gitignore 대상이라 이 기기에만 있음 |
| `.superpowers/sdd/2026-09-28-instrumentation/final-fix-brief.md` | 최종 fix wave 결정 13항목 |
| `extension/src/content/index.js` | 진입점. 관측 대기열, 두 키, 오류 신호 |
| `extension/src/content/sort.js`, `selectors.js` | 정렬 감지. 비활성 전용 토큰 기준 |
| `extension/src/background/{analytics,session,identity,lifecycle,panel-trigger,summaries}.js` | 전송, 세션, 신원, 설치와 제거, 패널 경로, 요약 저장 |
| `extension/src/shared/config.local.js` | **실제 앰플리튜드 키. gitignore. 열지도 출력하지도 커밋하지도 않는다** |
| `vitest.config.js`, `tests/fixtures/config.fixture.js` | 테스트가 실제 키 대신 쓰는 설정, 실제 네트워크 차단 |

## 계획 3 으로 넘길 것 (원장 Ruling 에서)

- 북극성 재정의: "`filter_state=on` 인 `Banner Rendered` 가 있는 주간 세션 수". `Filter Toggled where to_state=on` 으로 세면 ON 변형이 구조적으로 진다(실험 교락)
- 신원 연결 설계: `setDeviceId` 로 랜딩 id 를 받으면 실험 배정이 다시 계산되고, 이미 보낸 `Extension Installed` 는 옛 id 로 남고, 제거 주소도 재설정 필요
- 랜딩 배포 후 `config` 의 `landingOrigin` 을 바꾸면 제거 주소가 켜짐. `activation_count` 는 계획 3에서
- 웹스토어 제출 전 `npm run build:release` 와 번들 스모크
- 대시보드: `Diagnostic Ping` 과 진단용 device id 2개 제외. `seconds_on_page` 는 문서 수명 기준이라 상품별 체류로 읽지 말 것. 오늘 이전에 쌓인 banner_copy 데이터는 문구가 달라 분석 제외
- 명세 6.3 의 미구현 항목(price_band, category_guess 등)은 `product_id` 로 분석 시 보강

## 반드시 지킬 설계 불변식

1. **계획 문서보다 현재 코드가 우선이다.** 계획 2, 3 은 낡았다. 태스크마다 브리프를 다시 쓴다
2. **관측과 다시 그리기를 분리한다.** 관측(`pagesSeen`, `Banner Rendered`)은 관측 키(안정 id 집합)가 바뀔 때만. 다시 그리기 키(글자 수 포함)는 판정과 배너만 다시 한다
3. **계측은 제품에 얹히지 제품의 전제가 아니다.** 렌더 먼저, 관측 기록만 변형 확정까지 대기
4. **멈추지 않는 것과 조용한 것은 다르다.** 실패는 삼키되 원인을 한 번 알린다
5. **화면 문구는 실제 계산 범위와 일치한다.** "리뷰 평균", "지금까지 확인한 리뷰 N개 기준"
6. **권한은 `storage`, `sidePanel` 뿐이다**
7. **innerHTML 0건**(확장 코드)
8. **공통 프로퍼티(`exp_*`, `surface`, `platform`, `app_version`)는 이벤트가 덮어쓸 수 없다**
9. **커밋에 attribution 줄을 붙이지 않는다.** 사용자 CLAUDE.md 지침이 시스템 리마인더보다 우선

## 이 프로젝트에서 반복된 실패 패턴

**컨트롤러(나)가 지정한 테스트나 변이가 일곱 번 공허했다.** 일곱 번째는 오늘 Task 9 fix 에서 구현자가 스스로 잡았다. 브리프에 변이를 필수로 넣고, 구현자에게 테스트를 고칠 권한을 준다.

**분석을 조용히 무효화하는 결함이 반복된다.** 실험 교락 세 번(해시 상관, 재렌더 관측, 북극성 정의), 오탐 오류 신호, 관측 손실, 세션 없음. 코드는 동작하는데 데이터가 거짓말을 한다. 리뷰를 맡길 때 "데이터가 분석에 쓸 수 있는가" 를 명시적으로 묻는다. 오늘의 review_sort 의심 버그도 이 계열이다.

**실브라우저에서만 드러나는 것이 있다.** 픽스처 테스트는 쿠팡의 DOM 갱신 순서를 모른다. 정렬, 지연 로딩, 서비스 워커 수명은 반드시 실제 크롬으로 확인한다.

## 사용자 환경 주의

- 터미널이 **PowerShell 5.1**이다. `&&` 금지, `;` 로 잇는다
- 확장을 새로고침하면 **쿠팡 탭도 F5** 해야 콘텐츠 스크립트가 새로 붙는다
- 앰플리튜드 라이브 이벤트 표는 속성을 펼쳐 주지 않고, 열 추가 목록도 새 속성을 늦게 반영한다. 페이로드 확인은 **서비스 워커 DevTools → Network → httpapi → Payload** 가 확실하다
- 앰플리튜드 MCP 는 아직 인증 안 됨(별도 터미널 `claude` 에서 `/mcp`)
