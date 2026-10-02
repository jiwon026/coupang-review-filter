import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
// background/analytics.js 는 키 파일(config.local.js)을 끌어오므로 import 하지 않는다. site.js 는 import 가 없는 순수 모듈이다.
import { SITE, isLandingConfigured } from '../extension/src/shared/site.js'

// 스토어에 올리는 zip 에 들어가는 파일의 전부다. 폴더째 넣지 않는다(extension/src 에는 소스와 config.local.js 가 있다).
export const PACKAGE_FILES = [
  'manifest.json',
  'dist/background.js',
  'dist/content.js',
  'dist/sidepanel.js',
  'dist/onboarding.js',
  'src/content/content.css',
  'src/sidepanel/index.html',
  'src/sidepanel/style.css',
  'src/onboarding/index.html',
  'src/onboarding/style.css',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
]

export const PLACEHOLDER_API_KEY = 'PASTE_YOUR_AMPLITUDE_API_KEY_HERE'
// 앰플리튜드 키의 모양(32자리 hex). 배경 번들에 하나도 없으면 키가 비어 계측이 통째로 꺼진 패키지다.
const API_KEY_SHAPE = /(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/
// npm run package 는 extension/dist 를 운영 빌드로 덮어쓴다. 끝날 때 마지막 줄로 알린다.
export const DIST_NOTICE =
  'extension/dist 는 운영 빌드 상태로 남아 있습니다. 개발을 계속하려면 npm run build 를 다시 실행하세요.'
const AMPLITUDE_HOST = 'api2.amplitude.com'
const DEBUG_LOG_CALL = 'console.log('
const BUNDLE_NAMES = ['background', 'content', 'sidepanel', 'onboarding']
// 전송은 백그라운드만 한다. 나머지 번들에 앰플리튜드 주소가 있으면 안 된다.
const NO_NETWORK_BUNDLES = ['content', 'sidepanel', 'onboarding']
const HTML_PAGES = ['src/sidepanel/index.html', 'src/onboarding/index.html']
const REMOTE_REFERENCE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
const HTML_REFERENCE = /<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const EXTENSION_DIR = join(REPO_ROOT, 'extension')
const RELEASE_DIR = join(REPO_ROOT, 'release')

function toDirPath(dir) {
  return dir instanceof URL ? fileURLToPath(dir) : dir
}

// 허용 목록 중 실제로 있는 파일만 허용 목록 순서대로 돌려준다. 없는 파일은 checkPackageFiles 가 알린다.
export function collectPackageFiles(extensionDir) {
  const root = toDirPath(extensionDir)
  return PACKAGE_FILES.filter((file) => existsSync(join(root, file)))
}

function manifestReferences(manifest) {
  const refs = []
  const collect = (value) => {
    if (typeof value === 'string') refs.push(value)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  collect(manifest.icons)
  collect(manifest.action?.default_icon)
  collect(manifest.background?.service_worker)
  collect(manifest.side_panel?.default_path)
  for (const script of manifest.content_scripts ?? []) {
    collect(script.js)
    collect(script.css)
  }
  return refs
}

function htmlReferences(html) {
  return [...html.matchAll(HTML_REFERENCE)].map((match) => match[1])
}

// 매니페스트나 HTML 이 가리키는 로컬 파일을 확장 폴더 기준 경로로 돌려준다. 원격 주소는 뺀다.
export function findLocalReferences(sourcePath, content) {
  const raw = sourcePath === 'manifest.json'
    ? manifestReferences(JSON.parse(content))
    : htmlReferences(content)

  return raw
    .filter((ref) => !REMOTE_REFERENCE.test(ref))
    .map((ref) => ref.split(/[?#]/)[0])
    .map((ref) => (sourcePath === 'manifest.json' ? posix.normalize(ref) : posix.join(posix.dirname(sourcePath), ref)))
}

// 허용 목록의 파일이 모두 있는지, 매니페스트와 두 HTML 이 가리키는 파일이 모두 허용 목록 안에 있는지 본다.
export function checkPackageFiles(extensionDir) {
  const root = toDirPath(extensionDir)
  const problems = []

  for (const file of PACKAGE_FILES) {
    if (!existsSync(join(root, file))) problems.push(`패키지에 넣을 파일이 없습니다: ${file}`)
  }

  for (const source of ['manifest.json', ...HTML_PAGES]) {
    const sourceFile = join(root, source)
    if (!existsSync(sourceFile)) continue

    let refs
    try {
      refs = findLocalReferences(source, readFileSync(sourceFile, 'utf8'))
    } catch {
      problems.push(`${source} 를 읽을 수 없습니다. 형식을 확인하세요.`)
      continue
    }
    for (const ref of new Set(refs)) {
      if (!PACKAGE_FILES.includes(ref)) {
        problems.push(`${source} 가 가리키는 ${ref} 이(가) 패키지 허용 목록에 없습니다.`)
      }
    }
  }

  return problems
}

// 제출 전 점검. 문제 문구에는 키 값이나 번들 내용을 싣지 않는다.
export function checkReleaseReadiness({ landingOrigin, bundles }) {
  const problems = []

  if (!isLandingConfigured(landingOrigin)) {
    problems.push('사이트 주소(SITE.landingOrigin)가 자리표시자입니다. 이대로 제출하면 제거 페이지와 처리방침 링크가 꺼집니다.')
  }

  if (bundles.background?.includes(PLACEHOLDER_API_KEY)) {
    problems.push('dist/background.js 에 자리표시자 키가 들어 있습니다. config.local.js 에 실제 키를 넣고 다시 빌드하세요.')
  } else if (typeof bundles.background === 'string' && !API_KEY_SHAPE.test(bundles.background)) {
    // 파일이 아예 없는 경우는 checkPackageFiles 가 알린다.
    problems.push('dist/background.js 에 앰플리튜드 키가 없습니다. 이대로 제출하면 계측이 통째로 꺼집니다. config.local.js 에 실제 키를 넣고 다시 빌드하세요.')
  }

  for (const name of BUNDLE_NAMES) {
    if (bundles[name]?.includes(DEBUG_LOG_CALL)) {
      problems.push(`dist/${name}.js 에 디버그 로그(console.log)가 남아 있습니다. 운영 빌드(--release)로 다시 빌드하세요.`)
    }
  }

  for (const name of NO_NETWORK_BUNDLES) {
    if (bundles[name]?.includes(AMPLITUDE_HOST)) {
      problems.push(`dist/${name}.js 에 앰플리튜드 주소가 있습니다. 전송은 백그라운드에서만 해야 합니다.`)
    }
  }

  return problems
}

// 허용 목록의 파일만 담은 zip 을 만든다. manifest.json 이 최상위에 온다.
export function createPackageZip(extensionDir) {
  const root = toDirPath(extensionDir)
  const missing = PACKAGE_FILES.filter((file) => !existsSync(join(root, file)))
  if (missing.length > 0) throw new Error(`패키지에 넣을 파일이 없습니다: ${missing.join(', ')}`)

  const entries = Object.fromEntries(
    PACKAGE_FILES.map((file) => [file, new Uint8Array(readFileSync(join(root, file)))]),
  )
  return zipSync(entries, { level: 9 })
}

function readBundles(extensionDir) {
  return Object.fromEntries(
    BUNDLE_NAMES.map((name) => {
      const file = join(extensionDir, 'dist', `${name}.js`)
      return [name, existsSync(file) ? readFileSync(file, 'utf8') : undefined]
    }),
  )
}

function runReleaseBuild() {
  const result = spawnSync(process.execPath, ['build.js', '--release'], { cwd: REPO_ROOT, stdio: 'inherit' })
  return result.status === 0
}

// 운영 빌드, 제출 전 점검, zip 생성을 차례로 하고 종료 코드를 돌려준다. 인자는 테스트가 바꿔 끼운다.
// 운영 빌드가 돌았다면 성공이든 점검에서 막혔든 마지막 줄에 dist 의 상태를 알린다.
export function runPackage({
  runBuild = runReleaseBuild,
  extensionDir = EXTENSION_DIR,
  releaseDir = RELEASE_DIR,
  landingOrigin = SITE.landingOrigin,
  log = console.log,
  error = console.error,
} = {}) {
  if (!runBuild()) {
    error('운영 빌드가 실패했습니다. 패키지를 만들지 않습니다.')
    return 1
  }

  const problems = [
    ...checkReleaseReadiness({ landingOrigin, bundles: readBundles(extensionDir) }),
    ...checkPackageFiles(extensionDir),
  ]
  if (problems.length > 0) {
    error('제출 전 점검에서 막혔습니다. 패키지를 만들지 않습니다.')
    for (const problem of problems) error(`- ${problem}`)
    log(DIST_NOTICE)
    return 1
  }

  const { version } = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'))
  const target = join(releaseDir, `review-remover-${version}.zip`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, createPackageZip(extensionDir))
  log(`패키지를 만들었습니다: ${target}`)
  log(DIST_NOTICE)
  return 0
}

function realPathOrNull(path) {
  try {
    return realpathSync.native(path)
  } catch {
    return null
  }
}

// 이 파일이 node 의 진입점으로 실행됐는지. 테스트에서 import 할 때는 false 다.
// node 는 진입 모듈의 심볼릭 링크를 풀어 import.meta.url 에 실제 경로를 넣지만 process.argv[1] 에는 링크 경로가 남는다.
// 주소 문자열로 비교하면 어긋나서 아무것도 하지 않고 종료 코드 0 으로 끝나므로 실제 경로끼리 비교한다.
export function isDirectRun(moduleUrl, entryPath) {
  if (!entryPath) return false
  const modulePath = realPathOrNull(fileURLToPath(moduleUrl))
  return modulePath !== null && modulePath === realPathOrNull(entryPath)
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  process.exitCode = runPackage()
}
