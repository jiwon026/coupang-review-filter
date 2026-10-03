# 쿠팡 체험단 리뷰 필터: 태스크

Last Updated: 2026-10-03 (계획 3b 계획 작성)

## 계획 1: 확장 코어 (완료)

- [x] Task 1~7 (체험단 판별, 평점 집계, DOM 파서, 배너, 필터, 통합)
- [x] 최종 브랜치 리뷰, fix wave
- [x] 실브라우저 검증
- [x] main 머지

## 누적 집계 (계획 외 추가, 완료)

- [x] 본 리뷰를 id로 누적
- [x] 식별 가능한 리뷰만 누적, 폴백 id 충돌 차단
- [x] 변경 감지 서명 경량화, 배지 오염 차단
- [x] 실브라우저 검증 (10→20→30→40→50건 누적 확인)
- [x] main 머지

## 계획 2: 계측 (완료)

- [x] Task 1: 설정과 백그라운드 뼈대
- [x] Task 2: 신원 관리
- [x] Task 3: 앰플리튜드 전송 (키 누락 가드 포함)
- [x] Task 4: 이벤트와 메시지 상수
- [x] Task 5: 실험 배정 (fmix32로 실험 간 상관 제거)
- [x] Task 6: 콘텐츠 배선 (렌더/메시징 분리, 관측/재그리기 분리)
- [x] 실브라우저 + 앰플리튜드 실전송 검증
- [x] Task 6b: 정렬 상태 수집
- [x] Task 7: 구매 의도 감지
- [x] Task 8: 사이드 패널 구현 (0b1b6bf, 125개, 변이 4종 통과)
- [x] Task 8 태스크 리뷰 (fix round 1: 요약 storage.session 이전, 체험단 0건 배너 자세히 보기. 134개)
- [x] Task 8 실브라우저 검증 (패널 열림, 실시간 갱신, 1분 뒤 툴바 경로, Panel Opened 도착)
- [x] Task 8b: 실험 배정(exp_*)과 product_id 를 이벤트에 싣기 (계획 외 추가. b243a9e, 147개)
- [x] Task 9: 설치, 제거 주소, 오류 추적 (브리프 재작성, fix round 1: 셀렉터 신호를 pagehide 누적 판정으로. a643371, 216개)
- [x] 품질 보강 패스 (12개, c5fc2a0, 241개)
- [x] 최종 브랜치 리뷰 (opus, With fixes → fix wave 13항목 5041216, 재리뷰 통과, 301개)
- [x] 머지 전 실브라우저 확인: 배너 문구, Panel Opened trigger(banner, toolbar), session_id, platform
- [x] review_sort 버그: 두 정렬 버튼 모두 twc-font-bold 를 가져 항상 best 였음. 비활성 전용 twc-font-normal 기준으로 수정, 버전 0.2.0, 실브라우저 확인 (1890222, 304개)
- [ ] 남은 실브라우저 확인(계획 3 제출 전): 도움이 돼요 클릭(선택), 리뷰 0건 상품, release 빌드 스모크
- [x] main 머지, 푸시 (2026-10-02)

### 품질 보강 패스 항목

- [x] `config.example.js` 자리표시자를 `PASTE_YOUR_AMPLITUDE_API_KEY_HERE` 로 통일
- [x] README에 `config.local.js` 복사 안내 추가
- [x] `crf_user_id` 키 이름 검증 테스트
- [x] `EVENTS` 전체 값 스냅샷 테스트
- [x] `MESSAGES` 검증 테스트
- [x] `reportTrackFailure` Promise 거부 경로 테스트
- [x] `buildPayload` 가 최상위 `platform` 필드 채우기
- [x] 콘솔 로그 `CONFIG.debug` 게이팅 검토 (사용자 규칙 "No console.log in production" 과 충돌 중)

## 계획 3a: 웹스토어 제출 준비 (제출 완료, 심사 대기)

계획: `docs/superpowers/plans/2026-10-02-store-submission.md`. 근거: 명세 11절. 브랜치 `feat/store-submission`. 테스트 843개.

- [x] Task 1: 동의 상태와 전송 게이트
- [x] Task 2: 식별자 최소화 (product_key, page_key)
- [x] Task 3: 공개 설정 분리, 제거 주소의 동의 연동, 저장소 접근 수준
- [x] Task 4: 온보딩 페이지 (시안 A)
- [x] Task 5: 사이드 패널의 동의 토글 (fix round 1: 다른 곳의 동의 변경 반영)
- [x] Task 6: 최소 사이트 (처리방침, 제거 페이지)
- [x] Task 7: 이름 `체험단 리뷰 제거기 for 쿠팡`, 아이콘(AD 말풍선에 사선), 매니페스트 1.0.0
- [x] Task 8: 패키징 (허용 목록, 제출 전 검사)
- [x] Task 9: 스토어 등록 자료 (`docs/store/listing.md`)
- [x] 최종 브랜치 리뷰(opus) → fix wave 11항목 → 재리뷰 → 잔여 4항목 → 재리뷰 통과
- [x] Task 10: 배포와 제출 (2026-10-02 제출, 심사 대기)
  - [x] 개발자 등록, 비판매자, 게시자 이름, 연락처 이메일 인증
  - [x] 처리방침 시행일, main 머지와 푸시
  - [x] Vercel 배포. 주소 https://crf-review-remover.vercel.app (프로젝트와 도메인을 확장이 게시된 동안 유지할 것)
  - [x] landingOrigin 설정, npm run package, zip 검사
  - [x] 실브라우저 스모크 전부 통과(동의 전 0건, 발신자 검사, 화면 동기화, product_key, 철회 후 0건, 제거 시 조각 보존과 Extension Removed)
  - [x] 스크린샷 4장(1280x800), 업로드, 등록 자료 입력, 제출
  - [x] 확장 ID `diefbidjmimlnigjmkdbghjdhokhhpdk` 와 스토어 주소를 docs/store/listing.md 에 기록
  - [ ] 심사 결과 확인(보통 며칠, 길면 1~2주). 반려되면 사유를 보고 대응

## 계획 3b: 랜딩 (심사 대기 중에) ← 다음은 여기

계획: `docs/superpowers/plans/2026-10-03-landing.md`. 근거: 명세 12절. 브랜치 `feat/landing`. 확장 패키지는 건드리지 않는다.

- [x] 설계 합의(2026-10-03): 집계 수준 신원 연결, 이메일 없는 넘기기, 지속 방문자 번호, 실험 2종, B 절충형 배치
- [x] 명세 12절, 계획 문서 작성
- [x] 실행 방식: 태스크마다 에이전트, 컨트롤러 검토(subagent-driven)
- [ ] Task 0: 실측(스토어 대시보드의 UTM, 앰플리튜드의 IP)
- [ ] Task 1: 방문자 번호와 계측 제외
- [ ] Task 2: 유입원과 화면 종류
- [ ] Task 3: 실험 배정
- [ ] Task 4: 주소 조립과 전송
- [ ] Task 5: 화면(마크업, 스타일, 사진)
- [ ] Task 6: 페이지 배선
- [ ] Task 7: 처리방침 개정
- [ ] Task 8: 배포와 실브라우저 확인
- [ ] Task 9: 유입 준비(채널 링크, 글 초안)
- [ ] 심사 통과 뒤: `STORE_LIVE = true`

## 계획 3c: 대시보드와 분석 (출시 후, 시작할 때 계획 작성)

- [ ] 북극성(filter_state=on 인 Banner Rendered 세션), 퍼널, 가드레일
- [ ] 4.4절 검증, 실험 판독, 포트폴리오 문서

## 제품 수준 후속 과제 (결정 대기)

- [ ] 명세 4.4절의 "최신순으로 보세요" 제품 반영 여부. 상품 하나의 관측이라 계측 데이터가 쌓인 뒤 판단
- [ ] 체험단 제외 평점이 같을 때(5→5) 배너 문구. "빼도 그대로입니다. 믿을 만합니다" 류
