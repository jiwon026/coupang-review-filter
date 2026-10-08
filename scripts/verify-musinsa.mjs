// 무신사 실브라우저 확인(명세 13.10). 콘텐츠 스크립트를 묶어 크롬 헤드리스의 실제 무신사 페이지에 넣고 동작을 본다.
// 실행: npm run verify:musinsa. 하나라도 실패하면 종료 코드 1.
// 실제 사이트를 여는 스크립트라 테스트(npm test)에 넣지 않는다. 무신사가 화면을 바꿨는지 볼 때도 쓴다.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import * as esbuild from 'esbuild'
import { launch, sleep } from './lib/cdp.mjs'

const PRODUCT_NO = process.env.MUSINSA_PRODUCT ?? '4633343'
const PRODUCT_URL = `https://www.musinsa.com/products/${PRODUCT_NO}`
const REVIEW_URL = `https://www.musinsa.com/review/goods/${PRODUCT_NO}`
const SHOT_DIR = 'release/screenshots/raw'
const MARKER = '이후기는제품을무상으로제공받아'

const bundle = (
  await esbuild.build({
    entryPoints: ['extension/src/content/index.js'],
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    define: { __CRF_DEBUG__: 'false' },
    minifySyntax: true,
    write: false,
    logLevel: 'silent',
  })
).outputFiles[0].text
const css = readFileSync('extension/src/content/content.css', 'utf8')

// 확장의 chrome.runtime 을 흉내 낸다. 보낸 메시지는 window.__crfSent 에 쌓는다.
const INJECT = `
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
  window.__crfSent = [];
  window.chrome = window.chrome || {};
  window.chrome.runtime = {
    lastError: undefined,
    sendMessage(message, callback) {
      window.__crfSent.push(JSON.parse(JSON.stringify(message)));
      const reply = message.type === 'crf:get-variant'
        ? { variants: { default_filter: 'off', banner_copy: 'rating' } }
        : { ok: true };
      if (typeof callback === 'function') { setTimeout(() => callback(reply), 0); return undefined; }
      return Promise.resolve(reply);
    },
  };
  ${bundle}
  return true;
`

const CARDS = `[...document.querySelectorAll('[data-section-name="review"][data-content-id]')].filter(e => /^\\d+$/.test(e.dataset.contentId))`
const IS_SPONSORED = `(e) => { const own = e.querySelector('.crf-badge'); const text = e.textContent.replace(own ? own.textContent : '', '').replace(/\\s+/g, ''); return text.includes('${MARKER}') }`
const STATE = `
  const cards = ${CARDS};
  const isSponsored = ${IS_SPONSORED};
  const banner = document.querySelectorAll('[data-crf-banner="1"]');
  return {
    banners: banner.length,
    bannerText: banner[0] ? banner[0].innerText : null,
    hasToggle: !!document.querySelector('.crf-toggle'),
    hasNote: !!document.querySelector('.crf-note'),
    cards: cards.map(e => ({ id: e.dataset.contentId, sponsored: isSponsored(e), badges: e.querySelectorAll('.crf-badge').length, height: Math.round(e.getBoundingClientRect().height), collapsed: e.classList.contains('crf-collapsed') })),
  };
`
const SCROLL_TO_REVIEWS = `
  for (let i = 1; i <= 12; i++) { window.scrollTo(0, document.documentElement.scrollHeight * i / 12); await new Promise(r => setTimeout(r, 700)); }
  const section = document.querySelector('[class*="GoodsReviewListSection__Container"]');
  if (section) section.scrollIntoView({ block: 'start' });
  await new Promise(r => setTimeout(r, 1500));
  return !!section;
`

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const tracks = (sent) => sent.filter((m) => m.type === 'crf:track')
const bannerEvents = (sent) => tracks(sent).filter((m) => m.eventType === 'Banner Rendered')

async function clickToggle(page) {
  await page.evaluate(`document.querySelector('.crf-toggle').click(); await new Promise(r => setTimeout(r, 800)); return true`)
}

async function saveShot(page, name) {
  mkdirSync(SHOT_DIR, { recursive: true })
  const clip = await page.evaluate(`
    const b = document.querySelector('[data-crf-banner="1"]'); if (!b) return null;
    b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); await new Promise(r => setTimeout(r, 600));
    return { x: 0, y: window.scrollY, width: 1280, height: 900 };`)
  if (!clip) return
  writeFileSync(`${SHOT_DIR}/${name}.png`, await page.screenshot(clip))
}

async function verifyProductPage(page) {
  console.log(`\n상품 페이지 ${PRODUCT_URL}`)
  await page.goto(PRODUCT_URL)
  await page.evaluate(INJECT)
  const found = await page.evaluate(SCROLL_TO_REVIEWS)
  check('후기 구역을 찾는다', found === true)

  let state = await page.evaluate(STATE)
  const sponsored = state.cards.filter((c) => c.sponsored)
  check('배너가 하나 있다', state.banners === 1, `배너 ${state.banners}개, 카드 ${state.cards.length}장`)
  check('체험단 카드가 화면에 있다(이 상품을 고른 이유)', sponsored.length > 0, `체험단 ${sponsored.length}장`)
  check(
    '배지는 체험단 카드에만 하나씩 붙는다',
    state.cards.every((c) => c.badges === (c.sponsored ? 1 : 0)),
    state.cards.map((c) => `${c.sponsored ? 'S' : 'n'}${c.badges}`).join(' '),
  )
  await saveShot(page, 'musinsa-banner')

  await clickToggle(page)
  state = await page.evaluate(STATE)
  check(
    '숨기면 체험단 카드가 2px 이하로 접힌다',
    state.cards.filter((c) => c.sponsored).every((c) => c.height <= 2) && state.cards.filter((c) => !c.sponsored).every((c) => c.height >= 100),
    state.cards.map((c) => `${c.sponsored ? 'S' : 'n'}${c.height}`).join(' '),
  )
  await saveShot(page, 'musinsa-hidden')

  const lastTotal = async () => (await page.evaluate('return window.__crfSent')).filter((m) => m.type === 'crf:summary-updated').at(-1)?.summary.total
  const renderedCount = async () => bannerEvents(await page.evaluate('return window.__crfSent')).length
  const totalBefore = await lastTotal()
  const renderedBefore = await renderedCount()

  // 숨김을 켠 채 무신사의 체험단 조건을 고른다. 숨기지 않아야 하고, 조건이 고른 후기는 누적에 넣지 않아야 한다.
  await page.evaluate(`document.querySelector('[data-filter-value="체험단"]').click(); await new Promise(r => setTimeout(r, 3000)); return true`)
  state = await page.evaluate(STATE)
  check(
    '체험단 조건에서는 접힌 카드가 없다',
    state.cards.length > 0 && state.cards.every((c) => c.sponsored && !c.collapsed && c.height >= 100),
    state.cards.map((c) => `${c.sponsored ? 'S' : 'n'}${c.height}`).join(' '),
  )
  check('체험단 조건에서 배너에 안내 글이 있고 숨김 버튼이 없다', state.hasNote && !state.hasToggle, (state.bannerText ?? '').replace(/\n/g, ' / '))

  check('체험단 조건에서 본 후기는 누적에 넣지 않는다', (await lastTotal()) === totalBefore, `들어가기 전 ${totalBefore}건, 조건 안 ${await lastTotal()}건`)
  check('체험단 조건 동안 Banner Rendered 가 늘지 않는다', (await renderedCount()) === renderedBefore)
  check('조건 안에서도 배너의 숫자는 들어가기 전의 누적이다', (state.bannerText ?? '').includes(`리뷰 ${totalBefore}개`), (state.bannerText ?? '').split('\n').filter(Boolean)[1])

  // 조건을 풀면 원래 설정(숨김)으로 돌아간다.
  await page.evaluate(`document.querySelector('[data-filter-value="체험단"]').click(); await new Promise(r => setTimeout(r, 3000)); return true`)
  state = await page.evaluate(STATE)
  check(
    '조건을 풀면 체험단 카드가 다시 접힌다',
    state.cards.filter((c) => c.sponsored).every((c) => c.collapsed) && state.hasToggle,
    state.cards.map((c) => `${c.sponsored ? 'S' : 'n'}${c.height}`).join(' '),
  )

  check('조건에서 나온 뒤에도 누적이 그대로다', (await lastTotal()) === totalBefore, `${await lastTotal()}건`)

  await clickToggle(page)
  state = await page.evaluate(STATE)
  check('다시 보기를 누르면 100px 이상으로 돌아온다', state.cards.every((c) => c.height >= 100))

  const sent = await page.evaluate('return window.__crfSent')
  const events = tracks(sent)
  check('모든 이벤트의 site 가 musinsa 다', events.length > 0 && events.every((m) => m.properties.site === 'musinsa'), `이벤트 ${events.length}건`)
  check('모든 이벤트의 product_id 가 접두 붙은 번호다', events.every((m) => m.properties.product_id === `musinsa:${PRODUCT_NO}`))
  check('이벤트에 본문이나 주소 같은 긴 글자가 없다', events.every((m) => Object.values(m.properties).every((v) => typeof v !== 'string' || v.length <= 40)))
  const rendered = bannerEvents(sent)
  const summaries = sent.filter((m) => m.type === 'crf:summary-updated')
  const total = summaries.at(-1)?.summary.total ?? 0
  check('Banner Rendered 가 묶음 단위로만 나간다', rendered.length >= 1 && rendered.length <= 1 + Math.floor(total / 10), `누적 ${total}건에 ${rendered.length}번`)
  check('어떤 이벤트에도 sponsored_only_view 가 없다', events.every((m) => !('sponsored_only_view' in m.properties)))
  const errors = events.filter((m) => m.eventType === 'Extension Error')
  check('Extension Error 가 없다(조건 버튼의 모양을 알아본다)', errors.length === 0, errors.map((m) => m.properties.error_type).join(', '))
  check('요약에 site 가 실린다', summaries.length > 0 && summaries.every((m) => m.summary.site === 'musinsa'))
  console.log('  정렬 값:', [...new Set(events.map((m) => m.properties.review_sort))].join(', '))
}

async function verifyReviewPage(page) {
  console.log(`\n후기 전체보기 ${REVIEW_URL}`)
  await page.goto(REVIEW_URL, 6000)
  await page.evaluate(INJECT)
  // 직접 세는 쪽도 처음부터 지켜본다. 스크롤 사이에 잠깐 나왔다 사라지는 카드도 세야 하고,
  // 무신사는 카드 요소를 다시 쓰며 번호 속성만 바꾸기도 한다.
  await page.evaluate(`
    const isSponsored = ${IS_SPONSORED};
    window.__crfSeen = new Map();
    const note = () => { for (const e of ${CARDS}) window.__crfSeen.set(e.dataset.contentId, isSponsored(e)); };
    new MutationObserver(note).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-content-id'] });
    note(); return true`)
  // 카드는 스크롤해야 그려진다. 배너가 뜰 때까지 조금씩 내린다.
  await page.evaluate(`
    for (let i = 0; i < 20 && !document.querySelector('.crf-toggle'); i++) { window.scrollBy(0, 300); await new Promise(r => setTimeout(r, 700)); }
    return true`)
  let state = await page.evaluate(STATE)
  check('배너가 하나 있다', state.banners === 1, `카드 ${state.cards.length}장`)
  await clickToggle(page)

  // 숨김을 켠 채 끝까지 스크롤한다. 목록이 이어지는지(새 번호가 계속 나오는지)와 숨긴 카드가 접혀 있는지 본다.
  const walk = await page.evaluate(`
    const seen = window.__crfSeen; const isSponsored = ${IS_SPONSORED}; let stalled = 0; let bad = 0; let badBadge = 0; let steps = 0;
    for (let i = 0; i < 120 && stalled < 6; i++) {
      const before = seen.size;
      window.scrollBy(0, 1400); await new Promise(r => setTimeout(r, 700)); steps++;
      for (const e of ${CARDS}) {
        const s = isSponsored(e);
        if (s && e.getBoundingClientRect().height > 2) bad++;
        if (!s && e.getBoundingClientRect().height < 100) bad++;
        if (e.querySelectorAll('.crf-badge').length !== (s ? 1 : 0)) badBadge++;
        if (e.classList.contains('crf-collapsed') !== s) badBadge++;
      }
      stalled = seen.size === before ? stalled + 1 : 0;
    }

    const banner = document.querySelector('[data-crf-banner="1"]');
    return { seen: seen.size, sponsored: [...seen.values()].filter(Boolean).length, bad, badBadge, steps, bannerText: banner ? banner.innerText : null, y: Math.round(scrollY), h: document.documentElement.scrollHeight };`)
  check('숨긴 채 스크롤해도 목록이 이어진다', walk.seen >= 30, `${walk.steps}번 스크롤에 카드 ${walk.seen}장, 체험단 ${walk.sponsored}장`)
  check('스크롤하는 동안 체험단 카드는 접혀 있고 일반 카드는 보인다', walk.bad === 0, `어긋난 카드 ${walk.bad}번`)
  check('다시 쓰이는 카드에 표시나 접힘이 남지 않는다', walk.badBadge === 0, `어긋난 카드 ${walk.badBadge}번`)

  const sent = await page.evaluate('return window.__crfSent')
  const summary = sent.filter((m) => m.type === 'crf:summary-updated').at(-1)?.summary
  check(
    '누적 수가 페이지에서 직접 센 값과 같다',
    summary && summary.total === walk.seen && summary.sponsoredCount === walk.sponsored,
    `요약 ${summary?.total}건 중 체험단 ${summary?.sponsoredCount}건, 직접 센 값 ${walk.seen}건 중 ${walk.sponsored}건`,
  )
  const rendered = bannerEvents(sent)
  check('Banner Rendered 가 묶음 단위로만 나간다', rendered.length >= 2 && rendered.length <= 1 + Math.floor(walk.seen / 10), `누적 ${walk.seen}건에 ${rendered.length}번`)
  check('모든 이벤트의 site 가 musinsa 다', tracks(sent).every((m) => m.properties.site === 'musinsa' && m.properties.product_id === `musinsa:${PRODUCT_NO}`))
  check('배너가 남아 있다', walk.bannerText !== null, (walk.bannerText ?? '').split('\n')[0])
  const errors = tracks(sent).filter((m) => m.eventType === 'Extension Error')
  check('Extension Error 가 없다', errors.length === 0, errors.map((m) => m.properties.error_type).join(', '))
}

const page = await launch()
try {
  await verifyProductPage(page)
  await verifyReviewPage(page)
  const zeroSized = page.consoleErrors.filter((line) => /zero-sized/i.test(line))
  check('콘솔에 Zero-sized 오류가 없다', zeroSized.length === 0, `콘솔 오류 ${page.consoleErrors.length}건`)
  for (const line of page.consoleErrors.slice(0, 5)) console.log('  콘솔 오류:', String(line).slice(0, 160))
} finally {
  await page.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} 통과`)
process.exitCode = failed.length === 0 ? 0 : 1
