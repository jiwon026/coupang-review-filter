import * as esbuild from 'esbuild'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

// 사이트 스크립트를 site/public/assets/ 에 묶는다. 키와 문의처는 커밋하지 않고 환경 변수로만 받는다.
//   node site/build.js            개발 빌드. 없는 값은 빈 문자열이고 계측은 꺼진다.
//   node site/build.js --release  운영 빌드. 두 환경 변수 중 하나라도 없으면 실패한다.
const SITE_DIR = fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_ENDPOINT = 'https://api2.amplitude.com/2/httpapi'

const args = process.argv.slice(2)
const release = args.includes('--release')
const outdirArg = args.find((arg) => arg.startsWith('--outdir='))
const outdir = outdirArg ? resolve(outdirArg.slice('--outdir='.length)) : join(SITE_DIR, 'public', 'assets')

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
