import { beforeEach } from 'vitest'

// 테스트가 실제 네트워크를 타지 않게 전역 fetch 를 막는다. fetch 를 쓰는 테스트는 각자 모의한다.
function forbiddenFetch(url) {
  throw new Error(`테스트에서 실제 네트워크 금지: ${url}`)
}

globalThis.fetch = forbiddenFetch

beforeEach(() => {
  globalThis.fetch = forbiddenFetch
})
