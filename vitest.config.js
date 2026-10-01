import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 소스의 `../shared/config.local.js` 와 테스트의 `../extension/src/shared/config.local.js` 를 모두
// 테스트 전용 설정으로 바꾼다. 실제 키 파일은 읽지 않는다.
const CONFIG_LOCAL = /^(?:\.\.?\/)+(?:extension\/src\/)?shared\/config\.local\.js$/

export default defineConfig({
  resolve: {
    alias: [
      {
        find: CONFIG_LOCAL,
        replacement: fileURLToPath(new URL('./tests/fixtures/config.fixture.js', import.meta.url)),
      },
    ],
  },
  test: {
    setupFiles: ['./tests/setup.js'],
  },
})
