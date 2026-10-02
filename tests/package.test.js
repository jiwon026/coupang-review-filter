import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import {
  PACKAGE_FILES,
  PLACEHOLDER_API_KEY,
  DIST_NOTICE,
  collectPackageFiles,
  checkReleaseReadiness,
  checkPackageFiles,
  findLocalReferences,
  createPackageZip,
  isDirectRun,
  runPackage,
} from '../scripts/package.js'

const EXTENSION_DIR = new URL('../extension/', import.meta.url)
const readReal = (path) => readFileSync(new URL(path, EXTENSION_DIR), 'utf8')

// 테스트용 가짜 키. 앰플리튜드 키와 같은 모양(32자리 hex)이다.
const FAKE_KEY = '0123456789abcdef0123456789abcdef'

const CLEAN_BUNDLES = {
  background: `var a="${FAKE_KEY}";`,
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

  // 키가 비어 있으면 확장은 동작하지만 계측이 통째로 꺼진다. 그런 패키지가 조용히 제출되지 않게 막는다.
  it.each([
    ['빈 키', 'var k="";'],
    ['키 없는 번들', 'var a=1;'],
    ['31자리 hex', `var k="${FAKE_KEY.slice(1)}";`],
    ['33자리 hex', `var k="${FAKE_KEY}0";`],
  ])('배경 번들에 32자리 hex 키가 없으면(%s) 문제 1건이다', (_label, background) => {
    const problems = readiness({ bundles: { ...CLEAN_BUNDLES, background } })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('앰플리튜드 키가 없습니다')
  })

  it('32자리 hex 키가 있으면 대소문자와 무관하게 통과한다', () => {
    const background = `var k="${FAKE_KEY.toUpperCase()}";`
    expect(readiness({ bundles: { ...CLEAN_BUNDLES, background } })).toEqual([])
  })

  it('자리표시자 키는 자리표시자 문제 하나로만 알린다(키 없음과 겹쳐 알리지 않는다)', () => {
    const bundles = { ...CLEAN_BUNDLES, background: `var k="${PLACEHOLDER_API_KEY}";` }
    const problems = readiness({ bundles })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('자리표시자 키')
  })

  it('키 없음 문제 문구에 번들 내용을 싣지 않는다', () => {
    const secret = 'SECRET_BUNDLE_TEXT_9f3a'
    const [problem] = readiness({ bundles: { ...CLEAN_BUNDLES, background: `var s="${secret}";` } })
    expect(problem).not.toContain(secret)
  })

  it('배경 번들 파일이 아예 없으면 키 검사는 건너뛴다(파일 없음은 파일 점검이 알린다)', () => {
    expect(readiness({ bundles: { ...CLEAN_BUNDLES, background: undefined } })).toEqual([])
  })

  it('번들에 console.log( 가 있으면 문제 1건이다', () => {
    const bundles = { ...CLEAN_BUNDLES, sidepanel: 'console.log("x")' }
    expect(readiness({ bundles })).toHaveLength(1)
  })

  it('네 번들 모두 console.log( 를 검사한다', () => {
    for (const name of Object.keys(CLEAN_BUNDLES)) {
      const bundles = { ...CLEAN_BUNDLES, [name]: `${CLEAN_BUNDLES[name]}console.log(1)` }
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
    expect(readiness({ bundles: { ...CLEAN_BUNDLES, background: `fetch("${host}");var k="${FAKE_KEY}";` } })).toEqual([])
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

describe('isDirectRun', () => {
  const SCRIPT = fileURLToPath(new URL('../scripts/package.js', import.meta.url))
  const SCRIPT_URL = pathToFileURL(SCRIPT).href

  it('스크립트 자신의 경로로 실행하면 true', () => {
    expect(isDirectRun(SCRIPT_URL, SCRIPT)).toBe(true)
  })

  // node 는 진입 모듈의 링크를 풀어 import.meta.url 에 실제 경로를 넣지만 process.argv[1] 에는 링크 경로가 남는다.
  // 주소 문자열만 비교하면 어긋나서 main 이 실행되지 않고 종료 코드 0 으로 끝난다.
  it('링크된 폴더를 거친 경로로 실행해도 true', () => {
    const link = join(fakeDir, 'linked-scripts')
    symlinkSync(dirname(SCRIPT), link, 'junction')
    const viaLink = join(link, 'package.js')

    expect(pathToFileURL(viaLink).href).not.toBe(SCRIPT_URL)
    expect(isDirectRun(SCRIPT_URL, viaLink)).toBe(true)
  })

  it('다른 파일이 진입점이면(테스트가 import 한 경우) false', () => {
    expect(isDirectRun(SCRIPT_URL, fileURLToPath(import.meta.url))).toBe(false)
    expect(isDirectRun(SCRIPT_URL, process.argv[1])).toBe(false)
  })

  it('진입 경로가 없거나 존재하지 않는 파일이면 false', () => {
    expect(isDirectRun(SCRIPT_URL, undefined)).toBe(false)
    expect(isDirectRun(SCRIPT_URL, '')).toBe(false)
    expect(isDirectRun(SCRIPT_URL, join(fakeDir, 'missing.js'))).toBe(false)
  })
})

describe('runPackage', () => {
  function run(overrides = {}) {
    const logs = []
    const errors = []
    const releaseDir = join(fakeDir, 'release-out')
    const code = runPackage({
      runBuild: () => true,
      extensionDir: fakeDir,
      releaseDir,
      landingOrigin: CONFIGURED_ORIGIN,
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
      ...overrides,
    })
    return { code, logs, errors, releaseDir }
  }

  function makeReadyExtension() {
    makeFakeExtension()
    writeFake('manifest.json', JSON.stringify({ version: '9.9.9', icons: { 16: 'icons/icon-16.png' } }))
    writeFake('dist/background.js', `var k="${FAKE_KEY}";`)
  }

  it('성공하면 zip 을 만들고 마지막 줄에 dist 가 운영 빌드 상태로 남았음을 알린다', () => {
    makeReadyExtension()
    const { code, logs, errors, releaseDir } = run()

    expect(errors).toEqual([])
    expect(code).toBe(0)
    expect(readdirSync(releaseDir)).toEqual(['review-remover-9.9.9.zip'])
    expect(logs.at(-1)).toBe(DIST_NOTICE)
    expect(DIST_NOTICE).toBe(
      'extension/dist 는 운영 빌드 상태로 남아 있습니다. 개발을 계속하려면 npm run build 를 다시 실행하세요.',
    )
  })

  it('점검에서 막혀도 운영 빌드는 이미 돌았으므로 같은 안내를 마지막 줄에 알리고 zip 은 만들지 않는다', () => {
    makeReadyExtension()
    const { code, logs, errors, releaseDir } = run({ landingOrigin: 'https://example.com' })

    expect(code).toBe(1)
    expect(existsSync(releaseDir)).toBe(false)
    expect(errors[0]).toBe('제출 전 점검에서 막혔습니다. 패키지를 만들지 않습니다.')
    expect(logs.at(-1)).toBe(DIST_NOTICE)
  })

  it('키가 비어 있는 번들이면 막고 문제를 알린다', () => {
    makeReadyExtension()
    writeFake('dist/background.js', 'var k="";')
    const { code, errors, releaseDir } = run()

    expect(code).toBe(1)
    expect(existsSync(releaseDir)).toBe(false)
    expect(errors.some((line) => line.includes('앰플리튜드 키가 없습니다'))).toBe(true)
  })

  it('운영 빌드가 실패하면 점검도 zip 도 하지 않고 종료 코드 1 이다', () => {
    makeReadyExtension()
    const { code, logs, errors, releaseDir } = run({ runBuild: () => false })

    expect(code).toBe(1)
    expect(existsSync(releaseDir)).toBe(false)
    expect(errors).toEqual(['운영 빌드가 실패했습니다. 패키지를 만들지 않습니다.'])
    expect(logs).toEqual([])
  })
})
