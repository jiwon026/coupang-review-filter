import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// 아이콘 원본 SVG 에서 스토어와 매니페스트용 PNG 를 만든다. 결과는 커밋한다(패키지에 들어간다).
// 글자(AD)는 SVG 의 text 요소라서 실행한 기기의 글꼴에 따라 모양이 조금 달라질 수 있다.
const ICON_DIR = new URL('../extension/icons/', import.meta.url)
const SIZES = [16, 32, 48, 128]
const SOURCE = 'icon.svg'
// 72dpi 의 8배(1024px)로 그린 뒤 줄인다.
const RENDER_DENSITY = 576
// 16px 에서는 AD 글자가 뭉개져 글자를 뺀 단순 원본을 쓴다. 32px 이상은 승인된 그림 그대로다.
const SOURCE_BY_SIZE = { 16: 'icon-16.svg' }

async function buildIcon(size) {
  const svg = await readFile(new URL(SOURCE_BY_SIZE[size] ?? SOURCE, ICON_DIR))
  const png = await sharp(svg, { density: RENDER_DENSITY })
    .resize(size, size)
    .png()
    .toBuffer()
  const target = new URL(`icon-${size}.png`, ICON_DIR)
  await writeFile(target, png)
  console.log(`${fileURLToPath(target)} (${png.length} bytes)`)
}

for (const size of SIZES) await buildIcon(size)
