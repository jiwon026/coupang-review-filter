import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { unzipSync } from 'fflate'
import {
  PACKAGE_FILES,
  PLACEHOLDER_API_KEY,
  collectPackageFiles,
  checkReleaseReadiness,
  checkPackageFiles,
  findLocalReferences,
  createPackageZip,
} from '../scripts/package.js'

const EXTENSION_DIR = new URL('../extension/', import.meta.url)
const readReal = (path) => readFileSync(new URL(path, EXTENSION_DIR), 'utf8')

const CLEAN_BUNDLES = {
  background: 'var a=1;',
  content: 'var b=2;',
  sidepanel: 'var c=3;',
  onboarding: 'var d=4;',
}
const CONFIGURED_ORIGIN = 'https://review-remover.test'

function readiness(overrides = {}) {
  return checkReleaseReadiness({
    landingOrigin: CONFIGURED_ORIGIN,
    bundles: CLEAN_BUNDLES,
    ...overrides,
  })
}

let fakeDir

function writeFake(relativePath, content = relativePath) {
  const target = join(fakeDir, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function makeFakeExtension() {
  for (const file of PACKAGE_FILES) writeFake(file)
  writeFake('manifest.json', JSON.stringify({ icons: { 16: 'icons/icon-16.png' } }))
  writeFake('src/shared/config.local.js', 'export const SECRET_FIXTURE = 1')
  writeFake('src/background/index.js', 'export {}')
  writeFake('debug.log', 'log')
}

beforeEach(() => {
  fakeDir = mkdtempSync(join(tmpdir(), 'crf-package-'))
})

afterEach(() => {
  rmSync(fakeDir, { recursive: true, force: true })
})

describe('collectPackageFiles', () => {
  it('허용 목록과 정확히 같고 키 파일과 소스는 들어가지 않는다', () => {
    makeFakeExtension()

    const collected = collectPackageFiles(fakeDir)

    expect([...collected].sort()).toEqual([...PACKAGE_FILES].sort())
    expect(collected).not.toContain('src/shared/config.local.js')
    expect(collected).not.toContain('src/background/index.js')
    expect(collected).not.toContain('debug.log')
  })

  it('허용 목록의 파일이 없으면 결과에서 빠지고 점검이 문제로 알린다', () => {
    makeFakeExtension()
    rmSync(join(fakeDir, 'dist/onboarding.js'))

    expect(collectPackageFiles(fakeDir)).not.toContain('dist/onboarding.js')
    const problems = checkPackageFiles(fakeDir)
    expect(problems.some((p) => p.includes('dist/onboarding.js'))).toBe(true)
  })

  it('파일이 모두 있으면 점검 문제가 없다', () => {
    makeFakeExtension()

    expect(checkPackageFiles(fakeDir)).toEqual([])
  })
})

describe('checkReleaseReadiness', () => {
  it('전부 정상이면 빈 배열이다', () => {
    expect(readiness()).toEqual([])
  })

  it('자리표시자 사이트 주소는 문제 1건이다', () => {
    expect(readiness({ landingOrigin: 'https://example.com' })).toHaveLength(1)
  })

  it('빈 사이트 주소도 문제 1건이다', () => {
    expect(readiness({ landingOrigin: '' })).toHaveLength(1)
  })

  it('자리표시자 키가 배경 번들에 있으면 문제 1건이다', () => {
    const bundles = { ...CLEAN_BUNDLES, background: `var k="${PLACEHOLDER_API_KEY}";` }
    expect(readiness({ bundles })).toHaveLength(1)
  })

  it('번들에 console.log( 가 있으면 문제 1건이다', () => {
    const bundles = { ...CLEAN_BUNDLES, sidepanel: 'console.log("x")' }
    expect(readiness({ bundles })).toHaveLength(1)
  })

  it('네 번들 모두 console.log( 를 검사한다', () => {
    for (const name of Object.keys(CLEAN_BUNDLES)) {
      const bundles = { ...CLEAN_BUNDLES, [name]: 'console.log(1)' }
      expect(readiness({ bundles }), name).toHaveLength(1)
    }
  })

  it('콘텐츠 번들에 앰플리튜드 주소가 있으면 문제 1건이다', () => {
    const bundles = { ...CLEAN_BUNDLES, content: 'fetch("https://api2.amplitude.com/2/httpapi")' }
    expect(readiness({ bundles })).toHaveLength(1)
  })

  it('사이드 패널과 온보딩 번들에서도 앰플리튜드 주소를 막고 배경 번들은 허용한다', () => {
    const host = 'https://api2.amplitude.com/2/httpapi'
    expect(readiness({ bundles: { ...CLEAN_BUNDLES, sidepanel: host } })).toHaveLength(1)
    expect(readiness({ bundles: { ...CLEAN_BUNDLES, onboarding: host } })).toHaveLength(1)
    expect(readiness({ bundles: { ...CLEAN_BUNDLES, background: host } })).toEqual([])
  })

  it('문제 문구에 키 값이나 번들 내용을 싣지 않는다', () => {
    const secret = 'SECRET_BUNDLE_TEXT_9f3a'
    const bundles = {
      ...CLEAN_BUNDLES,
      background: `${PLACEHOLDER_API_KEY} ${secret}`,
      content: `console.log("${secret}") api2.amplitude.com`,
    }
    const problems = readiness({ landingOrigin: 'https://example.com', bundles })

    expect(problems.length).toBeGreaterThanOrEqual(4)
    for (const problem of problems) {
      expect(problem).not.toContain(secret)
      expect(problem).not.toContain(PLACEHOLDER_API_KEY)
    }
  })

  it('여러 문제는 모두 모아서 알린다', () => {
    const bundles = { ...CLEAN_BUNDLES, onboarding: 'console.log(1)' }
    expect(readiness({ landingOrigin: 'https://example.com', bundles })).toHaveLength(2)
  })
})

describe('참조 무결성', () => {
  const inAllowlist = (paths) => paths.filter((p) => !PACKAGE_FILES.includes(p))

  it('실제 매니페스트가 가리키는 로컬 파일이 모두 허용 목록에 있다', () => {
    const refs = findLocalReferences('manifest.json', readReal('manifest.json'))

    expect(refs.length).toBeGreaterThan(0)
    expect(inAllowlist(refs)).toEqual([])
  })

  it.each(['src/sidepanel/index.html', 'src/onboarding/index.html'])(
    '실제 %s 가 가리키는 로컬 파일이 모두 허용 목록에 있다',
    (htmlPath) => {
      const refs = findLocalReferences(htmlPath, readReal(htmlPath))

      expect(refs.length).toBeGreaterThan(0)
      expect(inAllowlist(refs)).toEqual([])
    },
  )

  it('HTML 참조는 HTML 위치 기준으로 풀어 확장 루트 경로로 만든다', () => {
    const refs = findLocalReferences(
      'src/onboarding/index.html',
      '<link rel="stylesheet" href="style.css"><script src="../../dist/onboarding.js"></script>',
    )

    expect(refs.sort()).toEqual(['dist/onboarding.js', 'src/onboarding/style.css'])
  })

  it('원격 주소는 로컬 참조로 세지 않는다', () => {
    const refs = findLocalReferences(
      'src/a/index.html',
      '<script src="https://cdn.example.org/x.js"></script><script src="//cdn.example.org/y.js"></script>',
    )

    expect(refs).toEqual([])
  })

  it('매니페스트가 JSON 이 아니면 문제로 알린다', () => {
    makeFakeExtension()
    writeFake('manifest.json', '{ broken')

    expect(checkPackageFiles(fakeDir).some((p) => p.includes('manifest.json'))).toBe(true)
  })

  it('허용 목록에 없는 참조는 점검이 문제로 알린다', () => {
    makeFakeExtension()
    writeFake('manifest.json', JSON.stringify({ background: { service_worker: 'dist/extra.js' } }))

    const problems = checkPackageFiles(fakeDir)

    expect(problems.some((p) => p.includes('dist/extra.js'))).toBe(true)
  })

  it('실제 확장 폴더의 매니페스트와 HTML 참조가 점검을 통과한다(파일 존재는 제외)', () => {
    const problems = checkPackageFiles(EXTENSION_DIR).filter((p) => !p.includes('dist/'))

    expect(problems).toEqual([])
  })
})

describe('createPackageZip', () => {
  it('풀면 파일 목록이 허용 목록과 같고 manifest.json 이 최상위에 있다', () => {
    makeFakeExtension()

    const zip = createPackageZip(fakeDir)
    const entries = unzipSync(zip)
    const names = Object.keys(entries)

    expect([...names].sort()).toEqual([...PACKAGE_FILES].sort())
    expect(names).toContain('manifest.json')
    expect(names.every((n) => !n.startsWith('extension/') && !n.includes('\\'))).toBe(true)
    expect(names.some((n) => n.includes('config.local'))).toBe(false)
  })

  it('파일 내용이 그대로 들어간다', () => {
    makeFakeExtension()
    writeFake('dist/background.js', 'var original = "bytes";')

    const entries = unzipSync(createPackageZip(fakeDir))

    expect(new TextDecoder().decode(entries['dist/background.js'])).toBe('var original = "bytes";')
  })

  it('허용 목록 파일이 없으면 던진다', () => {
    makeFakeExtension()
    rmSync(join(fakeDir, 'icons/icon-16.png'))

    expect(() => createPackageZip(fakeDir)).toThrow(/icons\/icon-16\.png/)
  })

  it('경로 구분자는 슬래시다', () => {
    expect(PACKAGE_FILES.every((p) => p === posix.normalize(p) && !p.includes('\\'))).toBe(true)
  })
})
