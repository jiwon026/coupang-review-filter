// 공개 사이트 설정. 비밀이 아니므로 커밋한다. 키와 엔드포인트는 gitignore 된 config.local.js 에 따로 둔다.
// landingOrigin 의 example.com 은 미설정 자리표시자다. 실제 주소가 정해지면 여기서 바꾼다.
export const SITE = {
  landingOrigin: 'https://example.com',
  privacyPath: '/privacy',
  uninstallPath: '/uninstalled',
  exampleProductUrl: 'https://www.coupang.com/vp/products/7590830589',
}

const PLACEHOLDER_HOST = 'example.com'

// 자리표시자나 빈 값이 그대로 남아 있으면 랜딩이 없는 것으로 본다.
// 그대로 쓰면 사용자가 확장을 지울 때나 처리방침을 열 때 엉뚱한 페이지가 열린다.
export function isLandingConfigured(origin) {
  if (!origin) return false

  let host
  try {
    host = new URL(origin).hostname
  } catch {
    return false
  }

  return host !== PLACEHOLDER_HOST && !host.endsWith(`.${PLACEHOLDER_HOST}`)
}

// 사이트가 설정돼 있으면 처리방침 주소, 아니면 null. origin 인자는 기본값이 SITE.landingOrigin 이다.
export function privacyUrl(origin = SITE.landingOrigin) {
  if (!isLandingConfigured(origin)) return null
  return new URL(SITE.privacyPath, origin).toString()
}
