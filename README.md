# 체험단 리뷰 제거기 for 쿠팡

쿠팡 상품 페이지에서 체험단 제공 리뷰를 판별해 배지를 붙이고 숨기며, 협찬을 제외한 평점을 보여주는 크롬 확장입니다.

## 설정

빌드 전에 설정 파일을 만듭니다. PowerShell에서 아래 명령을 실행합니다.

```powershell
Copy-Item extension/src/shared/config.example.js extension/src/shared/config.local.js
```

1. `extension/src/shared/config.local.js` 를 연다
2. `amplitudeApiKey` 에 앰플리튜드 API 키를 넣는다

`config.local.js` 는 git에 올라가지 않습니다. 키를 넣지 않아도 확장은 동작하고, 계측만 꺼집니다.

사이트 주소(`landingOrigin`)는 비밀이 아니라서 `config.local.js` 가 아니라 커밋되는 `extension/src/shared/site.js` 의 `SITE` 에 있습니다. 초기값 `https://example.com` 은 미설정 자리표시자이고, 이 상태에서는 제거 주소를 설정하지 않습니다. 예전에 만든 `config.local.js` 에 `landingOrigin` 이 남아 있어도 쓰이지 않으니 지워도 됩니다.

## 개발

```bash
npm install
npm run build          # content, background, sidepanel, onboarding 네 번들 생성 (디버그 로그 켜짐)
npm run build:release  # 같은 네 번들, 디버그 로그 제거
npm test               # Vitest
npm run watch          # 변경 감지 빌드 (디버그 로그 켜짐)
npm run build:icons    # 아이콘 PNG 네 개를 SVG 원본에서 다시 만듦
npm run package        # 스토어 제출용 zip 생성 (아래 제출 패키지 참고)
```

## 제출 패키지

```powershell
npm run package
```

운영 빌드, 제출 전 점검, zip 생성을 이 순서로 합니다. 결과는 `release/review-remover-<버전>.zip` 이고, `release/` 는 git에 올라가지 않습니다. zip 에는 허용 목록(`scripts/package.js` 의 `PACKAGE_FILES`)의 파일만 들어가며 `manifest.json` 이 최상위에 옵니다. 소스, `config.local.js`, `site/` 는 들어가지 않습니다.

점검에서 하나라도 걸리면 zip 을 만들지 않고 이유를 출력한 뒤 종료 코드 1 로 끝납니다. 걸리는 경우는 다음과 같습니다.

- 사이트 주소(`SITE.landingOrigin`)가 아직 자리표시자 `https://example.com` 입니다. `extension/src/shared/site.js` 에 실제 주소를 넣습니다.
- 번들에 자리표시자 키가 들어 있습니다. `config.local.js` 에 실제 앰플리튜드 키를 넣고 다시 실행합니다.
- 번들에 디버그 로그가 남았거나, 콘텐츠 스크립트 쪽 번들에 앰플리튜드 주소가 있습니다.

그 밖에 허용 목록의 파일이 없거나, 매니페스트와 두 HTML 이 가리키는 파일이 허용 목록에 없을 때도 막힙니다.

## 아이콘

원본은 `extension/icons/icon.svg` 하나이고, `npm run build:icons` 가 `sharp` 로 16, 32, 48, 128 크기의 PNG 를 만듭니다. PNG 는 확장 패키지에 들어가므로 커밋합니다. 16px 만 글자가 뭉개져서 글자를 뺀 `icon-16.svg` 로 만듭니다.

아이콘을 다시 만들면 기기의 글꼴에 따라 글자 모양이 달라질 수 있습니다. 모양이 달라지면 바뀐 PNG 를 눈으로 확인한 뒤 커밋합니다.

## 사이트

`site/` 는 처리방침(`/privacy`), 제거 안내(`/uninstalled`), 임시 첫 화면(`/`)을 담은 정적 사이트입니다. 스크립트는 `site/build.js` 가 `site/public/assets/` 에 묶고, 이 폴더는 git에 올라가지 않습니다. Vercel 설정은 저장소 최상위 `vercel.json` 에 있습니다.

키와 문의처 이메일은 커밋하지 않고 환경 변수로 넣습니다. PowerShell에서는 한 줄씩 실행합니다.

```powershell
$env:AMPLITUDE_API_KEY = "앰플리튜드 키"
$env:CONTACT_EMAIL = "문의 받을 이메일"
node site/build.js --release
```

- `node site/build.js` (또는 `npm run build:site`): 개발 빌드. 환경 변수가 없으면 빈 값으로 빌드되고 계측은 꺼지며, 처리방침의 문의처는 `준비 중` 으로 보입니다.
- `node site/build.js --release`: 운영 빌드. 두 환경 변수 중 하나라도 없으면 실패합니다. 처리방침(`site/public/privacy.html`)의 시행일이 아직 `배포 시 기재` 여도 실패하므로, 배포 전에 시행일을 실제 날짜(`YYYY-MM-DD`)로 바꿉니다. Vercel에는 같은 두 변수를 프로젝트 환경 변수로 등록합니다.
- 제거 주소는 `<사이트 주소>/uninstalled?v=<버전>#d=<기기 번호>&i=<설치 시각>` 꼴입니다. 기기 번호와 설치 시각은 동의한 사용자의 주소에만, 서버로 전송되지 않는 조각(`#` 뒤)에 실립니다. 쿼리에는 버전만 있습니다.
- 제거 안내 페이지는 조각에 `d` 가 있을 때만 `Extension Removed` 를 보내고, 읽은 직후 주소창에서 조각을 지웁니다. 쿼리의 `d` 는 읽지 않습니다. `d` 가 없으면 통계를 보내지 않습니다.

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
| `extension/icons/`, `scripts/build-icons.js` | 아이콘 SVG 원본, PNG 생성 스크립트 |
| `scripts/package.js` | 제출용 zip 생성과 제출 전 점검 |
| `site/` | 처리방침, 제거 안내 페이지와 그 스크립트 |
| `tests/` | Vitest, jsdom |

쿠팡이 마크업을 바꾸면 `selectors.js` 만 고치면 됩니다.

## 문서

- 설계: `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md`
- 계획: `docs/superpowers/plans/`
