# 쿠팡 체험단 리뷰 필터: 컨텍스트

Last Updated: 2026-10-02 (계획 3a 작성 시점)

## 다음에 가장 먼저 할 것

**계획 3a(웹스토어 제출 준비)의 계획 문서를 썼다. 실행은 아직 시작하지 않았다.**

- 계획: `docs/superpowers/plans/2026-10-02-store-submission.md` (브랜치 `docs/plan-3-store-submission`)
- 근거: 명세 11절. 크롬 웹스토어 정책(웹 브라우징 활동 수집 제한, 화면 안의 명시적 동의)을 확인하고 사용자가 **동의 화면 + 최소 수집**을 골랐다(2026-10-02)
- 핵심 변화: `granted` 일 때만 전송, 상품과 리뷰 번호는 솔트 해시(`product_key`, `page_key`), `Extension Installed` 는 첫 동의 시점, 온보딩은 확장 내부 페이지
- 옛 계획 3(`2026-09-28-landing-and-release.md`)은 대체됐다. 실행하지 않는다

재개 절차:

1. 확장 이름은 `체험단 리뷰 제거기` 로 확정됐다(쿠팡 상표를 이름에 넣지 않는다). 실행 방식은 지금까지처럼 서브에이전트 방식
2. `feat/store-submission` 브랜치를 계획 브랜치에서 만들고 superpowers:subagent-driven-development 로 Task 1 부터. 새 SDD 작업 폴더는 `.superpowers/sdd/2026-10-02-store-submission/`
3. Task 4(온보딩)와 Task 7(아이콘) 전에는 시안을 사용자에게 시각적으로 보여 주고 고르게 한다
4. Task 10 의 배포, 개발자 등록(5달러), 제출은 사용자가 직접 한다

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
| 계획 3a: 웹스토어 제출 준비 | 계획 작성 완료, 실행 대기 |
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
