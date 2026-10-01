// __CRF_DEBUG__ 는 esbuild define 이 빌드 시점에 채운다(build.js). 테스트처럼 정의되지 않은 환경에서도 터지지 않는다.
// 호출부는 반드시 `/* @__PURE__ */ debugLog(...)` 로 쓴다. 운영 빌드(minifySyntax)에서 호출째 사라져 로그 문구가 번들에 남지 않는다.
export function debugLog(...args) {
  if (typeof __CRF_DEBUG__ !== 'undefined' && __CRF_DEBUG__) {
    console.log(...args)
  }
}
