import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { debugLog } from '../extension/src/shared/log.js'

describe('debugLog', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('__CRF_DEBUG__ 가 정의되지 않아도 던지지 않고 아무것도 출력하지 않는다', () => {
    expect(typeof __CRF_DEBUG__).toBe('undefined')
    expect(() => debugLog('x')).not.toThrow()
    expect(console.log).not.toHaveBeenCalled()
  })

  it('__CRF_DEBUG__ 가 false 면 출력하지 않는다', () => {
    vi.stubGlobal('__CRF_DEBUG__', false)
    debugLog('x')
    expect(console.log).not.toHaveBeenCalled()
  })

  it('__CRF_DEBUG__ 가 true 면 인자를 그대로 console.log 한다', () => {
    vi.stubGlobal('__CRF_DEBUG__', true)
    debugLog('a', 1)
    expect(console.log).toHaveBeenCalledWith('a', 1)
  })
})

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.js') && !path.endsWith('log.js') ? [path] : []
  })
}

describe('debugLog 호출부', () => {
  it('모든 호출이 PURE 주석을 달아 운영 빌드에서 호출째 사라진다', () => {
    const dir = fileURLToPath(new URL('../extension/src', import.meta.url))
    let calls = 0
    for (const file of sourceFiles(dir)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\bdebugLog\(/.test(line)) {
            calls += 1
            expect(line, `${file}:${i + 1}`).toContain('/* @__PURE__ */ debugLog(')
          }
        })
    }
    expect(calls).toBeGreaterThanOrEqual(3)
  })
})
