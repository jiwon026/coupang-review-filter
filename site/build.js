import * as esbuild from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

// 사이트 스크립트를 site/public/assets/ 에 묶는다. 키와 문의처는 커밋하지 않고 환경 변수로만 받는다.
//   node site/build.js            개발 빌드. 없는 값은 빈 문자열이고 계측은 꺼진다.
//   node site/build.js --release  운영 빌드. 두 환경 변수 중 하나라도 없거나 처리방침의 시행일이 비어 있으면 실패한다.
//   --privacy=<파일>              시행일을 검사할 처리방침 파일. 테스트가 임시 복사본을 넘길 때 쓴다.
const SITE_DIR = fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_ENDPOINT = 'https://api2.amplitude.com/2/httpapi'
// 처리방침의 시행일 자리표시자. 이 문구가 남은 채로는 배포하지 않는다.
const EFFECTIVE_PLACEHOLDER = '배포 시 기재'

const args = process.argv.slice(2)
const release = args.includes('--release')
const outdirArg = args.find((arg) => arg.startsWith('--outdir='))
const outdir = outdirArg ? resolve(outdirArg.slice('--outdir='.length)) : join(SITE_DIR, 'public', 'assets')
const privacyArg = args.find((arg) => arg.startsWith('--privacy='))
const privacyFile = privacyArg ? resolve(privacyArg.slice('--privacy='.length)) : join(SITE_DIR, 'public', 'privacy.html')

const apiKey = (process.env.AMPLITUDE_API_KEY ?? '').trim()
const contactEmail = (process.env.CONTACT_EMAIL ?? '').trim()
const endpoint = (process.env.AMPLITUDE_ENDPOINT ?? '').trim() || DEFAULT_ENDPOINT

if (release) {
  const missing = [
    ['AMPLITUDE_API_KEY', apiKey],
    ['CONTACT_EMAIL', contactEmail],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    console.error(`운영 빌드에 필요한 환경 변수가 없습니다: ${missing.join(', ')}`)
    process.exit(1)
  }

  let privacy
  try {
    privacy = readFileSync(privacyFile, 'utf8')
  } catch (error) {
    console.error(`처리방침 파일을 읽을 수 없습니다: ${privacyFile} (${error?.code ?? error?.message})`)
    process.exit(1)
  }
  if (privacy.includes(EFFECTIVE_PLACEHOLDER)) {
    console.error(`처리방침의 시행일이 아직 "${EFFECTIVE_PLACEHOLDER}" 입니다. ${privacyFile} 의 시행일을 실제 날짜(YYYY-MM-DD)로 바꾼 뒤 다시 빌드하세요.`)
    process.exit(1)
  }
}

await esbuild.build({
  entryPoints: {
    uninstalled: join(SITE_DIR, 'src', 'entry-uninstalled.js'),
    contact: join(SITE_DIR, 'src', 'entry-contact.js'),
  },
  bundle: true,
  format: 'iife',
  outdir,
  target: 'es2020',
  minify: release,
  define: {
    __AMPLITUDE_KEY__: JSON.stringify(apiKey),
    __AMPLITUDE_ENDPOINT__: JSON.stringify(endpoint),
    __CONTACT_EMAIL__: JSON.stringify(contactEmail),
  },
  logLevel: 'info',
})
