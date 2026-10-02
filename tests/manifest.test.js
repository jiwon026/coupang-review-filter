import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EXTENSION_DIR = new URL('../extension/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('manifest.json', EXTENSION_DIR), 'utf8'))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const readExtensionFile = (path) => readFileSync(new URL(path, EXTENSION_DIR))

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const STORE_NAME_LIMIT = 75
const STORE_DESCRIPTION_LIMIT = 132
const EM_DASH = '\u2014'
const MIDDLE_DOT = '\u00b7'

// 매니페스트가 가리킬 수 있는 파일 경로의 모양. dist 는 빌드 산출물이라 존재는 검사하지 않는다(패키징이 검사한다).
const DIST_SCRIPT = /^dist\/[a-z-]+\.js$/
const SOURCE_FILE = /^src\/[a-z-]+\/[a-z-]+\.(css|html)$/

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

describe('매니페스트: 권한과 대상', () => {
  it('permissions 는 정확히 storage 와 sidePanel 이다', () => {
    expect(manifest.permissions).toEqual(['storage', 'sidePanel'])
  })

  it('host_permissions, optional_permissions, web_accessible_resources 가 없다', () => {
    expect(manifest).not.toHaveProperty('host_permissions')
    expect(manifest).not.toHaveProperty('optional_permissions')
    expect(manifest).not.toHaveProperty('web_accessible_resources')
  })

  it('콘텐츠 스크립트는 하나이고 쿠팡 상품 페이지에만 붙는다', () => {
    expect(manifest.content_scripts).toHaveLength(1)
    expect(manifest.content_scripts[0].matches).toEqual(['https://www.coupang.com/vp/products/*'])
  })
})

describe('매니페스트: 스토어 메타데이터', () => {
  it('이름과 설명이 스토어 글자 수 한도 안이다', () => {
    expect(manifest.name.length).toBeLessThanOrEqual(STORE_NAME_LIMIT)
    expect(manifest.description.length).toBeLessThanOrEqual(STORE_DESCRIPTION_LIMIT)
  })

  it('이름, 짧은 이름, 툴바 제목이 정해진 값이다', () => {
    expect(manifest.name).toBe('체험단 리뷰 제거기 for 쿠팡')
    expect(manifest.short_name).toBe('체험단 제거기')
    expect(manifest.action.default_title).toBe('체험단 리뷰 제거기')
  })

  it('최소 크롬 버전이 120 이다', () => {
    expect(manifest.minimum_chrome_version).toBe('120')
  })

  it('이름과 설명에 엠대시와 가운데 점이 없다', () => {
    for (const text of [manifest.name, manifest.short_name, manifest.description, manifest.action.default_title]) {
      expect(text).not.toContain(EM_DASH)
      expect(text).not.toContain(MIDDLE_DOT)
    }
  })

  it('manifest.version 이 package.json 의 version 과 같다', () => {
    expect(manifest.version).toBe(pkg.version)
  })
})

describe('매니페스트: 아이콘', () => {
  const declared = [
    ...Object.entries(manifest.icons).map(([size, path]) => ['icons', size, path]),
    ...Object.entries(manifest.action.default_icon).map(([size, path]) => ['action.default_icon', size, path]),
  ]

  it('icons 는 16, 32, 48, 128 네 크기를 선언한다', () => {
    expect(Object.keys(manifest.icons)).toEqual(['16', '32', '48', '128'])
  })

  it.each(declared)('%s 의 %spx 항목(%s)이 실제 PNG 이고 크기가 선언과 같다', (_field, size, path) => {
    expect(existsSync(fileURLToPath(new URL(path, EXTENSION_DIR)))).toBe(true)
    const buffer = readExtensionFile(path)
    expect([...buffer.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
    expect(pngSize(buffer)).toEqual({ width: Number(size), height: Number(size) })
  })
})

describe('매니페스트: 파일 경로', () => {
  const scripts = [manifest.background.service_worker, ...manifest.content_scripts.flatMap((entry) => entry.js ?? [])]
  const sources = [
    ...manifest.content_scripts.flatMap((entry) => entry.css ?? []),
    manifest.side_panel.default_path,
  ]

  it.each(scripts)('스크립트 %s 는 dist 아래 js 경로다', (path) => {
    expect(path).toMatch(DIST_SCRIPT)
  })

  it.each(sources)('소스 %s 는 허용된 형식이고 저장소에 있다', (path) => {
    expect(path).toMatch(SOURCE_FILE)
    expect(existsSync(fileURLToPath(new URL(path, EXTENSION_DIR)))).toBe(true)
  })
})

describe('화면에 보이는 이름', () => {
  const titleOf = (path) => readExtensionFile(path).toString('utf8').match(/<title>(.*?)<\/title>/)?.[1]

  it('패널과 온보딩 페이지 제목이 새 이름을 쓴다', () => {
    expect(titleOf('src/sidepanel/index.html')).toBe('체험단 리뷰 제거기')
    expect(titleOf('src/onboarding/index.html')).toBe('체험단 리뷰 제거기 시작하기')
  })
})
