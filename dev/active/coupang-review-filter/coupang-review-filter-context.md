# 쿠팡 체험단 리뷰 필터: 컨텍스트

Last Updated: 2026-10-01 (세션 종료 시점)

## 내일 가장 먼저 할 것

**계획 2 코드는 전부 끝났고 리뷰도 통과했다. 머지를 막는 것은 실브라우저에서 발견된 의심 버그 하나다.**

### 의심 버그: 최신순으로 바꿨는데 review_sort 가 "best"

사용자가 쿠팡 리뷰를 최신순으로 바꾼 직후 들어온 `Banner Rendered` 의 `review_sort` 가 `"best"` 였다.
최종 리뷰가 미리 경고한 위험(I6): 쿠팡이 리뷰 목록을 바꾸는 시점이 정렬 버튼의 굵은 글씨(`twc-font-bold`)가 바뀌는 시점보다 빠르면, 관측 순간에 이전 정렬을 읽는다.
사실이면 명세 4.4절(정렬별 체험단 노출 편향, 이 포폴의 중심 분석)에 쓰는 값이 틀리게 쌓인다. 또 `sort_pages_seen` 도 정렬 변경을 못 알아채 1로 초기화되지 않는다.

**추측으로 고치지 않는다.** superpowers:systematic-debugging 으로 증거부터:

1. 사용자에게 받을 것(어제 요청해 둠):
   - 그 이벤트의 `event_properties` 를 펼친 스크린샷(`sort_pages_seen`, `page_first_review_id`, `pages_seen`)
   - 직전 동작이 최신순 클릭 한 번이었는지, 목록이 실제로 바뀌었는지
   - 최신순 상태에서 다음 페이지로 넘긴 뒤 `review_sort` 가 `"latest"` 인지
2. 판별: 다음 페이지에서 `"latest"` 면 "전환 직후 한 번 늦게 읽음"(타이밍). 계속 `"best"` 면 "최신순을 아예 못 읽음"(셀렉터나 라벨).
3. 타이밍이면 후보 수정: 정렬 버튼 클릭을 직접 감지해 정렬 상태를 갱신하거나, 정렬을 관측 시점이 아니라 버튼 클래스 변경까지 기다려 확정. 셀렉터면 `content/selectors.js` 의 `SORT_SELECTORS`, `SORT_LABELS` 를 실측으로 고침
4. 고친 뒤 실브라우저로 다시 확인. 그다음 머지 확인을 사용자에게 받음

### 그 밖에 아직 실브라우저로 안 본 것

- "도움이 돼요"나 "더보기"를 눌러도 `Banner Rendered` 가 새로 안 들어오는지(선택, 쿠팡 계정에 투표가 남음)
- 리뷰 0건 상품에서 `Extension Error` 가 안 나가는지
- release 빌드(`npm run build:release`) 스모크

### 어제(10/01) 실브라우저로 확인한 것

- 사이드 패널: 열림, 다음 페이지에서 실시간 갱신, 1분 뒤 툴바로 열어도 숫자 유지
- 배너 문구: ratio 변형 정상(제목 비율, 보조 줄 평점). 이 기기는 `banner_copy=ratio`, `default_filter=off`
- 앰플리튜드 페이로드(서비스 워커 DevTools Network → httpapi → Payload): `Panel Opened` 의 `trigger` 가 배너 경로 `banner`, 툴바 경로 `toolbar`. `session_id` 실림. 최상위 `platform: "Chrome Extension"`, `app_version` 실림

## 전체 진행 상황

| 계획 | 상태 |
|---|---|
| 계획 1: 확장 코어 | **완료**, main 머지 |
| 누적 집계 (계획 외 추가) | **완료**, main 머지 |
| 계획 2: 계측 | **코드 완료, 리뷰 통과, 머지 대기** (review_sort 의심 버그 확인 후) |
| 계획 3: 랜딩과 배포 | 대기 |

브랜치: `feat/instrumentation` (HEAD `5041216` + 문서 커밋)
테스트: 301개 통과. `config.local.js` 없이도 301개 통과(테스트가 실제 키와 네트워크에서 격리됨)

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
| `extension/src/content/sort.js`, `selectors.js` | 정렬 감지. **내일 버그 조사 대상** |
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
