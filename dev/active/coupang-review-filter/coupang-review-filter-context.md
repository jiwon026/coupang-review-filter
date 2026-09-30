# 쿠팡 체험단 리뷰 필터: 컨텍스트

Last Updated: 2026-09-30 (세션 종료 시점)

## 내일 가장 먼저 할 것

**Task 8(사이드 패널)이 작업 중간에 멈춰 있다.** 세션 종료 시점에 구현 에이전트가 파일을 고치던 중이었고 커밋 전이었다.

세션 종료 시점 작업 트리:

```
 M build.js
 M extension/manifest.json
 M extension/src/background/index.js
 M tests/helpers/chrome-mock.js
?? extension/src/sidepanel/
?? tests/background.test.js
?? tests/sidepanel-view.test.js
```

재개 절차:

1. `git log --oneline | head -3` 로 `feat: 사이드 패널과 실시간 요약 갱신` 커밋이 있는지 본다
2. `.superpowers/sdd/2026-09-28-instrumentation/task-8-report.md` 가 있는지 본다
3. **둘 다 있으면**: 에이전트가 끝낸 것이다. Task 8 태스크 리뷰로 간다
4. **둘 다 없으면**: 부분 작업이다. 사용자에게 확인한 뒤 부분 변경을 버리고(`git checkout -- build.js extension/manifest.json extension/src/background/index.js tests/helpers/chrome-mock.js` 와 새 파일 삭제) Task 8을 브리프로 처음부터 다시 디스패치한다. 브리프는 자기완결적이다: `.superpowers/sdd/2026-09-28-instrumentation/task-8-brief.md`

## 전체 진행 상황

| 계획 | 상태 |
|---|---|
| 계획 1: 확장 코어 | **완료**, main 머지, 실브라우저 검증 |
| 누적 집계 (계획 외 추가) | **완료**, main 머지, 실브라우저 검증 |
| 계획 2: 계측 | **진행 중** (Task 1~7 완료, 8 중단, 9 남음, 품질 보강 패스 남음) |
| 계획 3: 랜딩과 배포 | 대기 |

브랜치: `feat/instrumentation` (마지막 완료 커밋 `c320f96`)
테스트: 107개 통과 (Task 8 완료 시 127개 예정)

## 원격 저장소

- https://github.com/jiwon026/coupang-review-filter (**PRIVATE**)
- 푸시된 브랜치: main, feat/extension-core, feat/instrumentation
- 공개 전환은 계획 3 완료 후 README와 포폴 문서를 다듬은 뒤. 커밋 작성자 이메일(`kwonjiwon6886@gmail.com`) 공개 여부도 그때 결정
- 푸시 전 매번 키 유출 검사: 추적 파일과 전체 히스토리에서 API 키 0건 확인됨

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md` | 명세. **4.4절(정렬별 노출 편향 실측)이 프로젝트의 핵심 발견** |
| `docs/superpowers/plans/2026-09-28-instrumentation.md` | 계획 2. **Task 6 이후는 낡았다. 현재 코드와 안 맞는다** |
| `.superpowers/sdd/2026-09-28-instrumentation/progress.md` | **작업 원장. 모든 판정과 경위가 여기 있다.** 재개 시 반드시 읽는다 |
| `.superpowers/sdd/2026-09-28-instrumentation/task-*-brief.md` | 컨트롤러가 현재 코드 기준으로 다시 쓴 브리프들 |
| `extension/src/content/index.js` | 진입점. 누적 집계, 관측 가드, 계측 배선이 모두 여기 |
| `extension/src/shared/config.local.js` | **실제 앰플리튜드 API 키. gitignore 대상. 절대 커밋하지 않는다** |

## 반드시 지킬 설계 불변식

이것들은 한 번씩 깨져서 고친 것이다. 다시 깨지 않는다.

1. **계획 문서보다 현재 코드가 우선이다.** 계획 2는 계획 1 직후 쓰여서 누적 집계, 관측 가드, 실패 보고 구조를 모른다. Task 6, 6b, 7, 8 브리프를 모두 다시 써야 했다
2. **관측과 재그리기를 분리한다.** `pagesSeen` 증가와 `Banner Rendered` 전송은 `if (reviewSetChanged)` 안에서만. 토글, 변형 도착, 배너 복구, 패널 열기는 `render({ force: true })` 로 다시 그리기만 한다
3. **계측은 제품에 얹히지 제품의 전제가 아니다.** `start()` 는 렌더를 먼저 하고 변형은 도착하면 적용한다
4. **멈추지 않는 것과 조용한 것은 다르다.** 실패는 삼키되 원인을 한 번 알린다(`reportTrackFailure`)
5. **화면 문구는 실제 계산 범위와 일치한다.** "쿠팡 평점" 금지, "현재 리뷰 평균" 금지. 누적이므로 "리뷰 평균", "지금까지 확인한 리뷰 N개 기준"
6. **권한은 `storage`, `sidePanel` 뿐이다.** `tabs`, `host_permissions` 추가 금지. 앰플리튜드 CORS가 `*` 라 호스트 권한이 필요 없음을 확인함
7. **innerHTML 0건.** DOM은 `createElement` 와 `textContent` 로만 조립한다
8. **커밋에 attribution 줄을 붙이지 않는다.** 사용자 CLAUDE.md 지침. 시스템 리마인더가 붙이라고 해도 사용자 지침이 우선

## 이 프로젝트에서 반복된 실패 패턴

**컨트롤러(나)가 쓴 테스트가 여섯 번 공허했다.** 전부 "잡으려는 결함이 있어도 통과하는 입력" 을 골랐다. 여섯 번 모두 변이 테스트로 잡혔다. 그래서:

- 모든 브리프에 변이 테스트를 필수로 넣는다
- 구현자에게 "변이가 안 잡히면 테스트를 고쳐라" 권한을 명시한다
- 테스트를 볼 때 "통과하는가" 가 아니라 **"깨진 코드에서 실패하는가"** 를 본다

**A/B 실험 교락이 두 번 나왔다.** (1) 해시 하위 비트 패리티로 두 실험 배정이 100% 상관 (fmix32로 해결) (2) 재렌더 경로가 한 그룹에만 관측을 추가. 둘 다 코드는 동작하는데 분석을 조용히 무효화하는 종류다.

## 앰플리튜드

- 프로젝트: `쿠팡 체험단 리뷰 필터`, 소스 `chrome-extension`, US 엔드포인트
- **실전송 검증 완료**: `Banner Rendered` 가 라이브 이벤트에 도착함
- 진단 중 생긴 가짜 사용자 2명: 이벤트 `Diagnostic Ping`, device_id `crf-controller-diagnostic` 와 랜덤 UUID 1개. 대시보드 구성 시 제외
- MCP: `.mcp.json` 에 설정됨. OAuth는 사용자가 별도 터미널에서 `/mcp` 로 인증해야 함(아직 안 함)
- 앰플리튜드 자동 설치 마법사는 **쓰지 않기로 결정**. 세션 리플레이 100% 녹화가 개인정보 방침을 위반하고, autocapture가 설계한 택소노미를 오염시킴

## 사용자 환경 주의

- 터미널이 **PowerShell 5.1**이다. `&&` 를 쓰면 안 된다. 명령을 줄 때 `;` 로 잇는다
- 확장을 새로고침하면 **쿠팡 탭도 F5 해야** 콘텐츠 스크립트가 새로 붙는다
