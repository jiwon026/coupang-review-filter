import sharp from 'sharp'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 랜딩 화면의 사진 셋을 만든다. 원본은 release/ 에만 있고(gitignore) 결과는 site/public/img 에 커밋한다.
// 배너와 패널은 키우면 흐려지므로 크기를 바꾸지 않고 복사한다.
// 배지는 스토어 제출용 이미지에서 제목 띠를 잘라 내고, 리뷰어 이름 줄과 상품 이름 줄을 흐리게 한다.
const RAW_DIR = new URL('../release/screenshots/raw/', import.meta.url)
const STORE_DIR = new URL('../release/screenshots/store/', import.meta.url)
const OUT_DIR = new URL('../site/public/img/', import.meta.url)

// 2-badge.jpg(1280x800)에서 흰 리뷰 카드의 테두리 안쪽 영역
const BADGE_SOURCE_SIZE = { width: 1280, height: 800 }
const CARD = { left: 272, top: 150, width: 738, height: 591 }
// 흐리게 할 줄(원본 좌표). 이름 줄은 가려진 이름("신*은"), 상품 줄은 판매자 줄 아래의 회색 글씨
const BLUR_LINES = [
  { name: '리뷰어 이름 줄', left: 346, top: 208, width: 62, height: 28 },
  { name: '상품 이름 줄', left: 284, top: 289, width: 366, height: 28 },
]
const BLUR_SIGMA = 9
const JPEG_QUALITY = 90

function fail(message) {
  console.error(`사진을 만들지 못했습니다: ${message}`)
  process.exit(1)
}

function requireFile(url) {
  const path = fileURLToPath(url)
  if (!existsSync(path)) fail(`원본 파일이 없습니다. ${path}\nrelease/ 폴더는 이 기기에만 있습니다. 원본을 먼저 찍어 두세요.`)
  return path
}

async function copyUnchanged(sourceName, outName) {
  const source = requireFile(new URL(sourceName, RAW_DIR))
  const { width, height } = await sharp(source).metadata()
  const target = new URL(outName, OUT_DIR)
  await copyFile(source, target)
  console.log(`${fileURLToPath(target)} (${width}x${height}, 원본 그대로)`)
}

async function buildBadge() {
  const source = requireFile(new URL('2-badge.jpg', STORE_DIR))
  const { width, height } = await sharp(source).metadata()
  if (width !== BADGE_SOURCE_SIZE.width || height !== BADGE_SOURCE_SIZE.height) {
    fail(`2-badge.jpg 의 크기가 ${width}x${height} 입니다. 자르는 위치를 ${BADGE_SOURCE_SIZE.width}x${BADGE_SOURCE_SIZE.height} 기준으로 잡았으므로 CARD 와 BLUR_LINES 를 다시 맞추세요.`)
  }

  // 카드만 잘라 낸 뒤 흐릴 줄을 같은 자리에 덮어 쓴다(자른 좌표계로 옮긴다).
  const card = await sharp(source).extract(CARD).toBuffer()
  const overlays = []
  for (const line of BLUR_LINES) {
    const region = { left: line.left - CARD.left, top: line.top - CARD.top, width: line.width, height: line.height }
    const blurred = await sharp(card).extract(region).blur(BLUR_SIGMA).toBuffer()
    overlays.push({ input: blurred, left: region.left, top: region.top })
  }
  const output = await sharp(card).composite(overlays).jpeg({ quality: JPEG_QUALITY }).toBuffer()
  const target = new URL('badge.jpg', OUT_DIR)
  await writeFile(target, output)
  console.log(`${fileURLToPath(target)} (${CARD.width}x${CARD.height}, 흐린 줄 ${BLUR_LINES.map((l) => l.name).join(', ')})`)
}

await mkdir(OUT_DIR, { recursive: true })
await copyUnchanged('banner-4.8.png', 'banner.png')
await buildBadge()
await copyUnchanged('panel-4.8.png', 'panel.png')
