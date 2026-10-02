import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUILD = join(ROOT, 'site', 'build.js')
const FAKE_KEY = 'fake-key-for-build-test'
const FAKE_CONTACT = 'fake-contact-for-build-test'

function runBuild(args, env) {
  return spawnSync(process.execPath, [BUILD, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, AMPLITUDE_API_KEY: '', CONTACT_EMAIL: '', ...env },
  })
}

describe('site/build.js --release', () => {
  it('환경 변수가 없으면 실패한다(종료 코드 1)', () => {
    const result = runBuild(['--release'], {})
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('AMPLITUDE_API_KEY')
    expect(result.stderr).toContain('CONTACT_EMAIL')
  })

  it('키만 있고 문의처가 없으면 실패한다', () => {
    expect(runBuild(['--release'], { AMPLITUDE_API_KEY: FAKE_KEY }).status).toBe(1)
  })

  it('문의처만 있고 키가 없으면 실패한다', () => {
    expect(runBuild(['--release'], { CONTACT_EMAIL: FAKE_CONTACT }).status).toBe(1)
  })
})

describe('site/build.js 산출물', () => {
  function buildInto(args, env) {
    const outdir = mkdtempSync(join(tmpdir(), 'site-build-'))
    const result = runBuild([...args, `--outdir=${outdir}`], env)
    return { outdir, result }
  }

  it('두 값이 모두 있으면 release 빌드가 성공하고 값을 번들에 넣는다', () => {
    const { outdir, result } = buildInto(['--release'], {
      AMPLITUDE_API_KEY: FAKE_KEY,
      CONTACT_EMAIL: FAKE_CONTACT,
    })
    try {
      expect(result.status).toBe(0)
      const uninstalled = readFileSync(join(outdir, 'uninstalled.js'), 'utf8')
      const contact = readFileSync(join(outdir, 'contact.js'), 'utf8')
      expect(uninstalled).toContain(FAKE_KEY)
      expect(uninstalled).toContain('https://api2.amplitude.com/2/httpapi')
      expect(uninstalled).not.toContain(FAKE_CONTACT)
      expect(contact).toContain(FAKE_CONTACT)
      expect(contact).not.toContain(FAKE_KEY)
    } finally {
      rmSync(outdir, { recursive: true, force: true })
    }
  })

  it('인자 없이 실행하면 비어 있는 값으로 빌드된다', () => {
    const { outdir, result } = buildInto([], {})
    try {
      expect(result.status).toBe(0)
      expect(existsSync(join(outdir, 'uninstalled.js'))).toBe(true)
      expect(existsSync(join(outdir, 'contact.js'))).toBe(true)
    } finally {
      rmSync(outdir, { recursive: true, force: true })
    }
  })
})

function listFiles(dir, skip) {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (skip(full)) continue
    if (statSync(full).isDirectory()) files.push(...listFiles(full, skip))
    else files.push(full)
  }
  return files
}

const ASSETS_DIR = join(ROOT, 'site', 'public', 'assets')
const siteFiles = [
  ...listFiles(join(ROOT, 'site'), (p) => p === ASSETS_DIR),
  join(ROOT, 'vercel.json'),
  join(ROOT, 'README.md'),
]

describe('커밋되는 사이트 파일의 위생', () => {
  it('검사할 파일이 있다', () => {
    const names = siteFiles.map((f) => relative(ROOT, f).split(sep).join('/'))
    expect(names).toContain('site/public/privacy.html')
    expect(names).toContain('site/public/uninstalled.html')
    expect(names).toContain('site/build.js')
  })

  it('이메일 주소 패턴이 없다', () => {
    const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/
    for (const file of siteFiles) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(EMAIL)
    }
  })

  it('32자리 hex 키가 없다', () => {
    const HEX_KEY = /(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/
    for (const file of siteFiles) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(HEX_KEY)
    }
  })

  it('엠대시와 가운데 점이 없다', () => {
    for (const file of siteFiles) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toContain(String.fromCharCode(0x2014))
      expect(text, file).not.toContain(String.fromCharCode(0xb7))
    }
  })

  it('gitignore 가 빌드 산출물 폴더를 제외한다', () => {
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf8')).toContain('site/public/assets/')
  })

  it('vercel.json 이 정해진 설정이다', () => {
    expect(JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))).toEqual({
      cleanUrls: true,
      buildCommand: 'node site/build.js --release',
      outputDirectory: 'site/public',
    })
  })
})
