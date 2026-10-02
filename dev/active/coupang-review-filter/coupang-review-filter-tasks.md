# 쿠팡 체험단 리뷰 필터: 태스크

Last Updated: 2026-10-02

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

## 계획 3: 랜딩과 배포 (대기)

- [ ] 계획 문서 재검토. 계획 2보다 더 낡았을 것
- [ ] 랜딩 페이지, 온보딩, 신원 연결, 모바일 핸드오프
- [ ] 웹스토어 제출 (심사 1~2주, 일정 앞쪽에 둘 것)
- [ ] 앰플리튜드 대시보드 (exp_* 공통 프로퍼티는 Task 8b 에서 처리됨. 퍼널 4개, 북극성, 가드레일, `Diagnostic Ping` 제외)

## 제품 수준 후속 과제 (결정 대기)

- [ ] 명세 4.4절의 "최신순으로 보세요" 제품 반영 여부. 상품 하나의 관측이라 계측 데이터가 쌓인 뒤 판단
- [ ] 체험단 제외 평점이 같을 때(5→5) 배너 문구. "빼도 그대로입니다. 믿을 만합니다" 류
