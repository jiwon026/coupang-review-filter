import { describe, it, expect } from 'vitest'
import { CONFIG } from '../extension/src/shared/config.local.js'

// 실제 키 파일 대신 테스트 전용 설정이 쓰이는지 본다.
// 실패해도 실제 값이 출력되지 않도록 값 비교 결과(true/false)만 단언한다.
describe('테스트 격리', () => {
  it('config.local.js 는 테스트 전용 설정으로 해석된다', () => {
    expect(CONFIG.amplitudeApiKey === 'test-key').toBe(true)
    expect(CONFIG.amplitudeEndpoint === 'https://example.invalid/2/httpapi').toBe(true)
    expect(CONFIG.landingOrigin === 'https://example.com').toBe(true)
  })

  it('전역 fetch 는 기본으로 실제 네트워크 요청을 막는다', async () => {
    await expect(async () => fetch('https://example.invalid/')).rejects.toThrow(
      '테스트에서 실제 네트워크 금지',
    )
  })
})
