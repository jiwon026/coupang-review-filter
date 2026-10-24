# 체험단 리뷰 제거기

쿠팡과 무신사 상품 페이지에서 체험단 리뷰에 표시를 붙이고, 버튼 하나로 숨기고, 체험단 리뷰를 뺀 평점을 보여 주는 크롬 확장입니다.

- 크롬 웹스토어: https://chromewebstore.google.com/detail/diefbidjmimlnigjmkdbghjdhokhhpdk
- 소개 페이지: https://crf-review-remover.vercel.app
- 개인정보 처리방침: https://crf-review-remover.vercel.app/privacy

커머스 데이터 분석 포트폴리오로 만들었습니다. 공개 데이터셋 대신 사람들이 실제로 쓰는 제품을 내놓고, 동의한 사용자의 사용 기록을 모아 분석하는 것이 목표입니다.

## 하는 일

| 기능 | 설명 |
|---|---|
| 체험단 표시 | 체험단 리뷰마다 `체험단 제공 리뷰` 표시를 붙입니다 |
| 숨기기 | 리뷰 위 배너나 사이드 패널의 버튼으로 체험단 리뷰를 숨기고 다시 봅니다 |
| 뺀 평점 | 원래 평균과 체험단 리뷰를 뺀 평점, 체험단 비중을 나란히 보여 줍니다 |
| 사이드 패널 | 같은 숫자를 자세히 보고 통계 전송을 켜고 끕니다 |

**판별 기준.** 쇼핑몰이 리뷰에 직접 붙이는 안내 문구가 있는 리뷰만 체험단으로 봅니다. 말투나 내용으로 추측하지 않습니다.

- 쿠팡: `쿠팡체험단 이벤트로 상품을 무료로 제공받아 작성한 구매 후기`
- 무신사: `이 후기는 제품을 무상으로 제공받아 직접 사용해 본 후 작성되었습니다`

**계산 범위.** 숫자는 상품 전체가 아니라 화면에서 본 리뷰를 누적한 값입니다. 쿠팡은 리뷰 페이지를 넘기면, 무신사는 후기 전체보기에서 스크롤하면 늘어납니다. 확장은 쇼핑몰의 후기 목록 주소를 따로 부르지 않습니다.

**동작하는 곳.** 쿠팡 상품 페이지(`/vp/products/*`), 무신사 상품 페이지(`/products/*`)와 후기 전체보기(`/review/goods/*`). PC 크롬 전용입니다. 무신사에서 사용자가 `체험단` 조건을 직접 골라 체험단 후기만 모아 볼 때는 숨기지 않습니다.

## 버전

| 버전 | 게시 | 내용 |
|---|---|---|
| 1.0.0 | 2026-10-05 | 쿠팡 지원. 이름은 `체험단 리뷰 제거기 for 쿠팡` |
| 1.1.0 | 2026-10-12 | 무신사 지원(사용자 피드백), 이름 변경, 사이드 패널의 숨기기 버튼, "본 리뷰 기준" 안내 |

올리브영도 요청을 받았지만 체험단 리뷰에 구분할 표시가 없어 넣지 않았습니다. 확인 과정은 `docs/research/2026-10-07-other-stores.md` 에 있습니다.

## 데이터와 개인정보

- 설치 직후 화면에서 **동의한 경우에만** 익명 사용 통계를 Amplitude 로 보냅니다. 동의하지 않아도 모든 기능을 씁니다
- 보내는 것: 배너가 뜬 횟수, 체험단 비중과 평점 같은 숫자, 버튼을 눌렀는지, 리뷰 정렬, 어느 쇼핑몰인지(`site`), 실험 그룹, 오류 종류, 무작위 익명 기기 번호
- 보내지 않는 것: 리뷰 내용, 상품 이름과 주소, 쇼핑몰 계정 정보. 상품 번호와 리뷰 번호는 기기마다 다른 값과 섞어 되돌릴 수 없게 바꾼 뒤에만 보냅니다
- 알리는 범위가 넓어지면 동의를 다시 받습니다. 1.0.x 에서 한 동의(쿠팡만 알림)는 1.1.0 에서 "아직 고르지 않음" 으로 읽힙니다
- 실험: 체험단 리뷰를 처음부터 숨길지(`default_filter`), 배너에서 평점과 비중 중 무엇을 강조할지(`banner_copy`), 설치 안내 화면에 예시 링크를 보일지(`onboarding_example`). 소개 페이지에서는 설치 버튼 배치(`install_cta`)

자세한 이벤트 설계와 분석 계획은 명세(`docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md`)의 6절, 11절, 12절, 13절에 있습니다.

## 설정

빌드 전에 설정 파일을 만듭니다. PowerShell에서 아래 명령을 실행합니다.

```powershell
Copy-Item extension/src/shared/config.example.js extension/src/shared/config.local.js
```

1. `extension/src/shared/config.local.js` 를 연다
2. `amplitudeApiKey` 에 앰플리튜드 API 키를 넣는다

`config.local.js` 는 git에 올라가지 않습니다. 키를 넣지 않아도 확장은 동작하고 계측만 꺼집니다.

사이트 주소(`landingOrigin`)는 비밀이 아니라서 커밋되는 `extension/src/shared/site.js` 의 `SITE` 에 있습니다. 확장 패키지에 박혀 나가므로 확장이 스토어에 있는 동안 이 주소(Vercel 프로젝트 `review-remover`)를 지우거나 바꾸지 않습니다.

## 개발

```bash
npm install
npm run build          # content, background, sidepanel, onboarding 네 번들 생성 (디버그 로그 켜짐)
npm run build:release  # 같은 네 번들, 디버그 로그 제거
npm test               # Vitest
npm run watch          # 변경 감지 빌드 (디버그 로그 켜짐)
npm run build:icons    # 아이콘 PNG 네 개를 SVG 원본에서 다시 만듦
npm run build:site     # 사이트 스크립트 개발 빌드
npm run package        # 스토어 제출용 zip 생성 (아래 제출 패키지 참고)
npm run verify:musinsa # 실제 무신사 페이지에서 콘텐츠 스크립트 확인 (아래 참고)
```

## 실제 무신사에서 확인하기

```bash
npm run verify:musinsa
```

콘텐츠 스크립트를 묶어 크롬 헤드리스로 연 실제 무신사 페이지에 넣고 배너, 표시, 숨기기, 체험단 조건, 후기 전체보기 스크롤, 보낸 이벤트를 확인합니다. 하나라도 실패하면 종료 코드 1 입니다. 일반 크롬은 명령줄로 확장을 싣는 것을 막아서 이 방식을 씁니다. 실제 사이트를 열기 때문에 `npm test` 에는 넣지 않았습니다. 무신사가 화면을 바꿨는지 볼 때 돌립니다. 기본 상품은 4633343 이고 `MUSINSA_PRODUCT` 환경 변수로 바꿉니다.

쿠팡은 헤드리스 접속을 막아서 이 방식으로 확인하지 못합니다. 쿠팡은 압축 해제한 확장을 실제 크롬에 불러와 확인합니다.

## 제출 패키지

```powershell
npm run package
```

운영 빌드, 제출 전 점검, zip 생성을 이 순서로 합니다. 결과는 `release/review-remover-<버전>.zip` 이고, `release/` 는 git에 올라가지 않습니다. zip 에는 허용 목록(`scripts/package.js` 의 `PACKAGE_FILES`)의 파일만 들어가며 `manifest.json` 이 최상위에 옵니다. 소스, `config.local.js`, `site/` 는 들어가지 않습니다.

점검에서 하나라도 걸리면 zip 을 만들지 않고 이유를 출력한 뒤 종료 코드 1 로 끝납니다. 걸리는 경우는 다음과 같습니다.

- 사이트 주소(`SITE.landingOrigin`)가 자리표시자 `https://example.com` 입니다
- 번들에 자리표시자 키가 들어 있거나 키가 아예 없습니다(비어 있으면 계측이 통째로 꺼진 패키지가 됩니다). `config.local.js` 에 실제 앰플리튜드 키를 넣고 다시 실행합니다
- 번들에 디버그 로그가 남았거나, 콘텐츠 스크립트 쪽 번들에 앰플리튜드 주소가 있습니다

그 밖에 허용 목록의 파일이 없거나, 매니페스트와 두 HTML 이 가리키는 파일이 허용 목록에 없을 때도 막힙니다.

`npm run package` 가 끝나면(성공이든 점검에서 막혔든) `extension/dist` 는 운영 빌드 상태로 남습니다. 개발을 계속하려면 `npm run build` 를 다시 실행하세요.

스토어 등록 자료(설명, 권한 사유, 심사자 안내, 스크린샷 목록)는 `docs/store/listing.md` 에 있습니다.

## 아이콘

원본은 `extension/icons/icon.svg` 하나이고, `npm run build:icons` 가 `sharp` 로 16, 32, 48, 128 크기의 PNG 를 만듭니다. PNG 는 확장 패키지에 들어가므로 커밋합니다. 16px 만 글자가 뭉개져서 글자를 뺀 `icon-16.svg` 로 만듭니다.

아이콘을 다시 만들면 기기의 글꼴에 따라 글자 모양이 달라질 수 있습니다. 모양이 달라지면 바뀐 PNG 를 눈으로 확인한 뒤 커밋합니다.

## 사이트

`site/` 는 소개 페이지(`/`), 처리방침(`/privacy`), 제거 안내(`/uninstalled`)를 담은 정적 사이트입니다. main 에 푸시하면 Vercel 이 배포합니다. 스크립트는 `site/build.js` 가 `site/public/assets/` 에 묶고, 이 폴더는 git에 올라가지 않습니다. Vercel 설정은 저장소 최상위 `vercel.json` 에 있습니다.

- 소개 페이지는 방문, 설치 버튼 누름, 휴대폰에서 PC 로 넘기기를 기록합니다(명세 12절). 운영 주소에서만 보내고 로컬과 미리보기 배포에서는 보내지 않습니다. 주소 끝에 `#notrack` 을 붙여 한 번 열면 그 브라우저는 기록에서 빠집니다
- 홍보 글에 쓰는 채널별 링크와 글 초안은 `docs/launch/channels.md` 에 있습니다
- 사진은 `site/public/img/` 에 있고 `node scripts/build-site-images.js` 로 다시 만듭니다. 원본은 `release/screenshots/raw/`(git 밖)에 있습니다

키와 문의처 이메일은 커밋하지 않고 환경 변수로 넣습니다. PowerShell에서는 한 줄씩 실행합니다.

```powershell
$env:AMPLITUDE_API_KEY = "앰플리튜드 키"
$env:CONTACT_EMAIL = "문의 받을 이메일"
node site/build.js --release
```

- `node site/build.js` (또는 `npm run build:site`): 개발 빌드. 환경 변수가 없으면 빈 값으로 빌드되고 계측은 꺼지며, 처리방침의 문의처는 `준비 중` 으로 보입니다
- `node site/build.js --release`: 운영 빌드. 두 환경 변수 중 하나라도 없으면 실패합니다. 처리방침(`site/public/privacy.html`)의 시행일이 아직 `배포 시 기재` 여도 실패하므로 배포 전에 시행일을 실제 날짜(`YYYY-MM-DD`)로 바꿉니다. Vercel에는 같은 두 변수를 프로젝트 환경 변수로 등록합니다
- 제거 주소는 `<사이트 주소>/uninstalled?v=<버전>#d=<기기 번호>&i=<설치 시각>` 꼴입니다. 기기 번호와 설치 시각은 동의한 사용자의 주소에만, 서버로 전송되지 않는 조각(`#` 뒤)에 실립니다. 쿼리에는 버전만 있습니다
- 제거 안내 페이지는 조각에 `d` 가 있을 때만 `Extension Removed` 를 보내고, 읽은 직후 주소창에서 조각을 지웁니다. 쿼리의 `d` 는 읽지 않습니다. `d` 가 없으면 통계를 보내지 않습니다

## 크롬에 로드하기

`extension/dist/` 는 git에 포함되지 않습니다. **먼저 `npm run build` 를 실행해야 합니다.**

1. `chrome://extensions` 를 연다
2. 우측 상단 개발자 모드를 켠다
3. "압축해제된 확장 프로그램을 로드합니다"를 누른다
4. `extension/` 폴더를 고른다 (`extension/dist/` 가 아니다)
5. 쿠팡이나 무신사 상품 페이지를 열고 리뷰 영역까지 스크롤한다

스토어에서 설치한 확장이 켜져 있으면 배너가 두 개 뜹니다. 확인하는 동안은 스토어 설치본을 꺼 둡니다.

엣지와 웨일은 크로미움 기반이라 같은 확장을 로드할 수 있습니다. 다만 이 저장소에서 검증한 것은 크롬뿐입니다.

## 구조

| 경로 | 책임 |
|---|---|
| `extension/src/core/` | 순수 로직(체험단 판별, 평점 계산, 실험 배정). DOM을 모른다 |
| `extension/src/content/` | 쇼핑몰 페이지 조작(누적, 표시, 숨기기, 배너, 건강 신호) |
| `extension/src/content/sites/` | 쇼핑몰별 부품. 주소, 선택자, 체험단 문구, 정렬, 구매 버튼, 숨기는 방식을 한 파일에 모은다(`coupang.js`, `musinsa.js`) |
| `extension/src/background/` | 이벤트 전송, 동의, 기기 신원, 탭별 요약 저장 |
| `extension/src/sidepanel/` | 사이드 패널 화면 |
| `extension/src/onboarding/` | 설치 직후의 통계 안내와 동의 화면 |
| `extension/src/shared/` | 이벤트 이름, 메시지 상수, 설정 |
| `extension/icons/`, `scripts/build-icons.js` | 아이콘 SVG 원본, PNG 생성 스크립트 |
| `scripts/package.js` | 제출용 zip 생성과 제출 전 점검 |
| `scripts/verify-musinsa.mjs`, `scripts/lib/cdp.mjs` | 실제 무신사 확인 |
| `site/` | 소개 페이지, 처리방침, 제거 안내와 그 스크립트 |
| `tests/` | Vitest, jsdom |

쇼핑몰이 마크업을 바꾸면 `content/sites/` 의 그 쇼핑몰 파일을 고칩니다. 새 쇼핑몰을 더할 때도 이 폴더에 파일 하나를 더하고 `sites/index.js` 와 매니페스트의 대상 주소에 넣습니다.

## 문서

| 문서 | 내용 |
|---|---|
| `docs/superpowers/specs/2026-09-28-coupang-review-filter-design.md` | 설계. 11절 동의와 최소 수집, 12절 소개 페이지, 13절 무신사 |
| `docs/superpowers/plans/` | 단계별 구현 계획(확장 코어, 계측, 스토어 제출, 소개 페이지, 무신사) |
| `docs/research/2026-10-07-other-stores.md` | 무신사, 올리브영 지원 가능성 확인 |
| `docs/store/listing.md` | 스토어 등록 자료 |
| `docs/launch/` | 홍보 채널 조사, 채널별 링크와 글 초안 |
| `dev/active/coupang-review-filter/` | 진행 상태와 다음 할 일 |
