# 쿠팡 체험단 리뷰 필터

쿠팡 상품 페이지에서 체험단 제공 리뷰를 판별해 배지를 붙이고 숨기며, 협찬을 제외한 평점을 보여주는 크롬 확장입니다.

## 설정

빌드 전에 설정 파일을 만듭니다. PowerShell에서 아래 명령을 실행합니다.

```powershell
Copy-Item extension/src/shared/config.example.js extension/src/shared/config.local.js
```

1. `extension/src/shared/config.local.js` 를 연다
2. `amplitudeApiKey` 에 앰플리튜드 API 키를 넣는다

`config.local.js` 는 git에 올라가지 않습니다. 키를 넣지 않아도 확장은 동작하고, 계측만 꺼집니다.

## 개발

```bash
npm install
npm run build          # content.js, background.js, sidepanel.js 세 번들 생성 (디버그 로그 켜짐)
npm run build:release  # 같은 세 번들, 디버그 로그 제거
npm test               # Vitest
npm run watch          # 변경 감지 빌드 (디버그 로그 켜짐)
```

## 크롬에 로드하기

`extension/dist/` 는 git에 포함되지 않습니다. **먼저 `npm run build` 를 실행해야 합니다.**

1. `chrome://extensions` 를 연다
2. 우측 상단 개발자 모드를 켠다
3. "압축해제된 확장 프로그램을 로드합니다"를 누른다
4. `extension/` 폴더를 고른다 (`extension/dist/` 가 아니다)
5. 쿠팡 상품 페이지를 열고 리뷰 영역까지 스크롤한다

엣지와 웨일은 크로미움 기반이라 같은 확장을 로드할 수 있습니다. 다만 이 저장소에서 검증한 것은 크롬뿐입니다.

## 구조

| 경로 | 책임 |
|---|---|
| `extension/src/core/` | 순수 로직. DOM을 모른다 |
| `extension/src/content/` | 쿠팡 페이지 조작 |
| `extension/src/content/selectors.js` | 쿠팡 DOM 셀렉터의 유일한 거처 |
| `extension/src/background/` | 이벤트 전송, 기기 신원, 탭별 요약 저장 |
| `extension/src/sidepanel/` | 사이드 패널 화면 |
| `extension/src/shared/` | 이벤트 이름, 메시지 상수, 설정 |
| `tests/` | Vitest, jsdom |

쿠팡이 마크업을 바꾸면 `selectors.js` 만 고치면 됩니다.

## 문서

- 설계: `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md`
- 계획: `docs/superpowers/plans/`
