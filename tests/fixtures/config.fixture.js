// 테스트 전용 설정. vitest.config.js 의 별칭이 config.local.js 를 이 파일로 바꾼다.
// 실제 키 파일이 없는 새 클론에서도 테스트가 돌고, 실제 키로 운영 앰플리튜드에 이벤트가 쌓이지 않게 한다.
export const CONFIG = {
  amplitudeApiKey: 'test-key',
  amplitudeEndpoint: 'https://example.invalid/2/httpapi',
  landingOrigin: 'https://example.com',
}
