# 개발

체험단 리뷰 제거기를 직접 빌드하고 고치는 방법입니다. 프로젝트 소개는 [README](../README.md)에 있습니다.

## 설정

```powershell
Copy-Item extension/src/shared/config.example.js extension/src/shared/config.local.js
```

`config.local.js` 의 `amplitudeApiKey` 에 앰플리튜드 키를 넣습니다. 이 파일은 git에 올라가지 않고, 키가 없어도 확장은 동작하며 계측만 꺼집니다. 사이트 주소는 커밋되는 `extension/src/shared/site.js` 에 있고, 확장 패키지에 박혀 나가므로 확장이 스토어에 있는 동안 바꾸지 않습니다.

## 명령

```bash
npm install
npm run build          # 확장 네 번들 생성 (디버그 로그 켜짐)
npm run build:release  # 같은 네 번들, 디버그 로그 제거
npm test               # 테스트
npm run watch          # 변경 감지 빌드
npm run build:icons    # 아이콘 PNG 를 SVG 원본에서 다시 만듦
npm run build:site     # 소개 페이지 스크립트 개발 빌드
npm run package        # 스토어 제출용 zip (release/review-remover-<버전>.zip)
npm run verify:musinsa # 실제 무신사 페이지에서 동작 확인
```

## 크롬에 불러오기

1. `npm run build`
2. `chrome://extensions` 에서 개발자 모드를 켭니다
3. `압축해제된 확장 프로그램을 로드합니다` 를 눌러 `extension/` 폴더를 고릅니다(`extension/dist/` 가 아닙니다)
4. 스토어에서 설치한 확장이 켜져 있으면 배너가 두 개 뜨므로 확인하는 동안 꺼 둡니다

## 제출 패키지

`npm run package` 는 운영 빌드, 제출 전 점검, zip 생성을 차례로 합니다. zip 에는 허용 목록(`scripts/package.js` 의 `PACKAGE_FILES`)의 파일만 들어갑니다. 사이트 주소가 자리표시자이거나, 번들에 키가 없거나 디버그 로그가 남았거나, 콘텐츠 스크립트에 앰플리튜드 주소가 있으면 zip 을 만들지 않고 종료 코드 1 로 끝납니다. 끝나면 `extension/dist` 가 운영 빌드로 남으니 개발을 이어 가려면 `npm run build` 를 다시 실행합니다. 스토어 등록 자료는 `docs/store/listing.md` 에 있습니다.

## 실제 무신사에서 확인하기

`npm run verify:musinsa` 는 콘텐츠 스크립트를 묶어 크롬 헤드리스로 연 실제 무신사 페이지에 넣고 배너, 표시, 숨기기, 체험단 조건, 후기 전체보기 스크롤, 보낸 이벤트를 확인합니다. 일반 크롬은 명령줄로 확장을 싣는 것을 막아서 이 방식을 씁니다. 실제 사이트를 열기 때문에 `npm test` 에는 넣지 않았습니다. 기본 상품은 4633343 이고 `MUSINSA_PRODUCT` 환경 변수로 바꿉니다. 쿠팡은 헤드리스 접속을 막아서 실제 크롬에 불러와 확인합니다.

## 소개 페이지

main 에 푸시하면 Vercel 이 배포합니다. 운영 빌드는 키와 문의처 이메일을 환경 변수로 받습니다.

```powershell
$env:AMPLITUDE_API_KEY = "앰플리튜드 키"
$env:CONTACT_EMAIL = "문의 받을 이메일"
node site/build.js --release
```

두 변수 중 하나라도 없거나 처리방침의 시행일이 아직 `배포 시 기재` 면 실패합니다. 소개 페이지는 운영 주소에서만 방문을 기록하고, 주소 끝에 `#notrack` 을 붙여 한 번 열면 그 브라우저는 기록에서 빠집니다. 사진은 `node scripts/build-site-images.js` 로 다시 만듭니다.
