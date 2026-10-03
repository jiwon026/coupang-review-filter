import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fillContact } from '../site/src/contact.js'
import { STORE_URL } from '../site/src/landing/config.js'
import { readCommand } from '../site/src/landing/visitor.js'

const PUBLIC_DIR = new URL('../site/public/', import.meta.url)
const SRC_DIR = new URL('../site/src/', import.meta.url)
const PAGES = ['index.html', 'privacy.html', 'uninstalled.html']

function load(name) {
  return new JSDOM(readFileSync(new URL(name, PUBLIC_DIR), 'utf8')).window.document
}

// 처리방침의 약속은 코드와 글자 그대로 맞아야 한다. 바뀐 문장과 목록은 전체 문자열로 고정한다.
const PRIVACY_SENT = [
  '배너가 표시된 횟수, 체험단 리뷰의 개수와 비중, 평점 같은 숫자, 필터가 켜져 있었는지',
  '숨기기 버튼, 패널, 장바구니와 바로구매 버튼, 설치 안내의 예시 링크를 눌렀는지',
  '리뷰 정렬 방식(베스트순, 최신순)',
  '확장의 화면(설치 안내, 패널)을 열었는지, 이용한 시각과 머문 시간',
  '무작위로 만든 익명 기기 번호, 확장 버전',
  '화면 문구와 기본 설정의 실험 그룹, 통계를 켠 화면',
  '확장에서 오류가 났는지와 오류의 종류',
  '확장을 제거할 때 제거 사실과 사용 기간, 직접 고른 이유(7절)',
]

const PRIVACY_SITE_STATS = [
  '무작위로 만든 방문자 번호(브라우저에 저장됩니다)와 방문한 시각',
  '어느 사이트에서 왔는지(도메인만)와 링크에 붙은 유입 표식',
  '화면 종류(PC, 모바일)와 설치 버튼 실험 그룹',
  '화면 사진 구역을 봤는지, 설치 버튼과 링크 복사, 공유하기 버튼을 눌렀는지',
]

const PRIVACY_NOT_SENT = [
  '리뷰 내용, 상품 이름, 상품 주소',
  '쿠팡 계정, 이름, 이메일, 주소, 결제 정보',
  '쿠팡 상품 페이지가 아닌 다른 사이트에서 무엇을 보거나 했는지',
]

describe('처리방침', () => {
  const doc = load('privacy.html')
  const text = doc.body.textContent.replace(/\s+/g, ' ')

  // n 번째 절(h2)과 다음 절 사이에 있는 문단들의 글. 마지막 절 뒤의 시행일 줄은 절의 문단이 아니라서 뺀다.
  function sectionParagraphs(number) {
    const heading = [...doc.querySelectorAll('h2')].find((h) => h.textContent.startsWith(`${number}. `))
    const paragraphs = []
    for (let node = heading.nextElementSibling; node && node.tagName !== 'H2'; node = node.nextElementSibling) {
      if (node.tagName === 'P' && !node.classList.contains('effective')) paragraphs.push(node.textContent.replace(/\s+/g, ' ').trim())
    }
    return paragraphs
  }
  const listItems = (index) => [...doc.querySelectorAll('ul')[index].querySelectorAll('li')].map((li) => li.textContent)

  it('이름과 제목을 쓴다', () => {
    expect(doc.querySelector('h1').textContent).toBe('개인정보 처리방침')
    expect(text).toContain('체험단 리뷰 제거기 for 쿠팡(이하 "확장")이 어떤 정보를 다루는지 설명합니다.')
  })

  it('열 개 절의 제목이 순서대로 있다', () => {
    const headings = [...doc.querySelectorAll('h2')].map((h) => h.textContent)
    expect(headings).toEqual([
      '1. 확장이 하는 일',
      '2. 동의한 경우에만 보내는 익명 통계',
      '3. 보내지 않는 것',
      '4. 쓰는 목적',
      '5. 보관 위치와 처리 위탁',
      '6. 동의를 바꾸는 방법',
      '7. 확장을 제거할 때',
      '8. 삭제 요청과 문의',
      '9. 쿠팡과의 관계',
      '10. 이 사이트의 방문 통계',
    ])
  })

  it('핵심 문장을 그대로 담는다', () => {
    for (const sentence of [
      '리뷰 내용은 어디로도 전송되지 않습니다.',
      '동의하지 않으면 아무것도 보내지 않으며, 모든 기능은 그대로 쓸 수 있습니다.',
      '상품 번호와 리뷰 번호는 기기마다 다른 무작위 값과 섞어 되돌릴 수 없는 값으로 바꾼 뒤에만 보냅니다.',
      '광고에 쓰지 않고, 판매하거나 다른 곳에 넘기지 않습니다.',
      '통계는 분석 서비스 Amplitude(Amplitude, Inc., 미국)에 저장됩니다.',
      '확장 아이콘을 눌러 패널을 열면 맨 아래에서 언제든 켜고 끌 수 있습니다.',
      '이 확장은 쿠팡과 관계가 없는 개인이 만든 도구입니다.',
    ]) {
      expect(text).toContain(sentence)
    }
  })

  it('2절: 켜는 곳(설치 직후 화면이나 확장 패널)을 사실대로 적는다', () => {
    expect(sectionParagraphs(2)).toEqual([
      '설치 직후 화면이나 확장 패널에서 통계 전송을 켠 경우에만 아래 정보를 보냅니다. 동의하지 않으면 아무것도 보내지 않으며, 모든 기능은 그대로 쓸 수 있습니다.',
    ])
  })

  it('2절: 보내는 정보 목록은 8줄이고 문자열이 같다', () => {
    expect(listItems(0)).toHaveLength(8)
    expect(listItems(0)).toEqual(PRIVACY_SENT)
  })

  it('3절: 보내지 않는 정보 목록은 3줄이고 문자열이 같다', () => {
    expect(listItems(1)).toHaveLength(3)
    expect(listItems(1)).toEqual(PRIVACY_NOT_SENT)
  })

  it('3절: 지킬 수 없는 절대 표현(어떤 ... 도)을 쓰지 않는다', () => {
    for (const item of listItems(1)) expect(item).not.toMatch(/어떤 .*도$/)
  })

  it('4절: 쓰는 목적 문단이 문자열까지 같고 사이트 방문 통계의 목적(10절)을 밝힌다', () => {
    expect(sectionParagraphs(4)).toEqual([
      '확장이 제대로 동작하는지 확인하고, 어떤 화면이 사용자에게 더 도움이 되는지 판단하는 데만 씁니다. 광고에 쓰지 않고, 판매하거나 다른 곳에 넘기지 않습니다. 개인을 알 수 없는 집계 결과(예: 리뷰 정렬 방식에 따른 체험단 리뷰 비중)는 공개할 수 있습니다. 이 사이트의 방문 통계(10절)는 어느 경로로 방문했는지와 소개 화면의 구성이 도움이 되는지 판단하는 데 씁니다.',
    ])
  })

  it('5절: 통계 보관 위치와 사이트 전체의 호스팅 사업자 접속 기록을 알린다', () => {
    expect(sectionParagraphs(5)).toEqual([
      '통계는 분석 서비스 Amplitude(Amplitude, Inc., 미국)에 저장됩니다.',
      '이 사이트(소개 페이지, 처리방침, 제거 안내 페이지)는 Vercel(Vercel Inc., 미국)에서 호스팅하며, 페이지에 접속할 때 IP 주소 같은 접속 기록이 호스팅 사업자에게 남을 수 있습니다. 익명 기기 번호와 방문자 번호는 이 접속 기록에 포함되지 않습니다.',
    ])
  })

  it('7절: 제거할 때 기록되는 것(제거 사실, 사용 기간, 고른 이유)을 모두 적는다', () => {
    expect(sectionParagraphs(7)).toEqual([
      '동의한 경우에 한해 제거 사실, 사용 기간(일 수), 제거 안내 페이지에서 고른 이유가 익명 기기 번호와 함께 기록됩니다. 동의하지 않은 경우에는 제거 안내 페이지가 열릴 뿐 통계가 기록되지 않습니다.',
    ])
  })

  it('8절: 삭제 요청에 필요한 익명 기기 번호를 어디서 보는지 알린다', () => {
    expect(sectionParagraphs(8)).toEqual([
      '이미 보낸 통계의 삭제를 원하면 확장 패널 맨 아래에 표시되는 익명 기기 번호를 아래 주소로 알려 주세요. 궁금한 점도 같은 주소로 보내 주시면 됩니다.',
      '',
    ])
  })

  it('10절: 사이트 방문 통계의 문단 셋이 문자열까지 같다', () => {
    expect(sectionParagraphs(10)).toEqual([
      '확장과 별개로 이 사이트의 소개 페이지는 방문 통계를 기록합니다. 확장을 설치하지 않아도 기록되며, 확장의 통계와 사람 단위로 연결하지 않습니다.',
      '이름, 이메일, 보던 페이지의 전체 주소는 기록하지 않습니다. 통계는 5절과 같이 Amplitude 에 저장하고 4절의 목적에만 씁니다.',
      '통계에서 빠지려면 이 사이트 주소 끝에 #notrack 을 붙여 한 번 열어 주세요. 그 브라우저에서는 더 기록하지 않고, 화면에 방문자 번호가 표시됩니다. 브라우저가 설정을 저장하지 못하는 경우에는 그 방문만 제외되며 화면에 따로 안내됩니다. 이미 기록된 방문 통계의 삭제를 원하면 그 번호를 8절의 주소로 알려 주세요. 방문자 번호, 실험 그룹, 제외 설정은 브라우저에 저장되며, 브라우저에서 이 사이트의 데이터를 지우면 함께 지워집니다.',
    ])
  })

  it('10절: 기록하는 정보 목록은 4줄이고 문자열이 같다(세 번째 목록)', () => {
    expect(doc.querySelectorAll('ul')).toHaveLength(3)
    expect(listItems(2)).toHaveLength(4)
    expect(listItems(2)).toEqual(PRIVACY_SITE_STATS)
  })

  it('10절: 안내한 #notrack 은 코드가 알아보는 명령과 같은 문자열이다', () => {
    const [, hash] = sectionParagraphs(10)[2].match(/(#[^\s]+) 을 붙여/)
    expect(hash).toBe('#notrack')
    expect(readCommand(hash)).toBe('optout')
    expect(readCommand('#notrack')).toBe('optout')
  })

  it('제거 안내 페이지에서 아무것도 기록되지 않는다는 절대 표현을 쓰지 않는다', () => {
    expect(text).not.toContain('아무것도 기록되지 않습니다')
  })

  it('시행일은 2026-10-03 이다', () => {
    expect(doc.querySelector('.effective').textContent).toBe('시행일: 2026-10-03')
  })

  // 배포 때 실제 날짜로 바뀐다. 자리표시자와 날짜 형식 둘 다 받는다.
  it('시행일은 배포 시 기재이거나 YYYY-MM-DD 형식의 날짜다', () => {
    expect(doc.querySelector('.effective').textContent).toMatch(/^시행일: (?:배포 시 기재|\d{4}-\d{2}-\d{2})$/)
  })

  it('연락처 자리는 비어 있는 요소이고 contact.js 를 불러온다', () => {
    expect(doc.getElementById('contact').textContent).toBe('')
    expect(doc.querySelector('script[src="/assets/contact.js"]')).not.toBeNull()
  })
})

describe('fillContact', () => {
  it('값이 있으면 textContent 로 채운다', () => {
    const doc = load('privacy.html')
    fillContact(doc, 'a <b>b</b>')
    expect(doc.getElementById('contact').textContent).toBe('a <b>b</b>')
    expect(doc.getElementById('contact').children).toHaveLength(0)
  })

  it('값이 비어 있으면 준비 중을 보여 준다', () => {
    const doc = load('privacy.html')
    fillContact(doc, '')
    expect(doc.getElementById('contact').textContent).toBe('준비 중')
  })
})

describe('제거 안내 페이지 문구', () => {
  it('미동의 사용자에게는 통계가 기록되지 않는다고 적는다(접속 기록은 호스팅 사업자에게 남을 수 있다)', () => {
    const doc = load('uninstalled.html')
    const leads = [...doc.querySelectorAll('p.lead')].map((p) => p.textContent)
    expect(leads).toContain('통계 전송에 동의하지 않으셨다면 이 페이지에서도 통계가 기록되지 않습니다.')
    expect(doc.body.textContent).not.toContain('아무것도 기록되지 않습니다')
  })
})

describe('랜딩', () => {
  const doc = load('index.html')
  const norm = (el) => el.textContent.replace(/\s+/g, ' ').trim()
  const bodyText = norm(doc.body)

  it('제목과 설명(meta description)이 그대로다', () => {
    expect(doc.title).toBe('체험단 리뷰 제거기 for 쿠팡')
    expect(doc.querySelector('meta[name="description"]').content).toBe(
      '쿠팡 상품 페이지에서 체험단 제공 리뷰를 표시하고 숨기고, 체험단 리뷰를 뺀 평점을 보여 주는 크롬 확장입니다.',
    )
  })

  it('body 에 landing 클래스가 있다', () => {
    expect(doc.body.classList.contains('landing')).toBe(true)
  })

  it('첫 화면 문구가 요소별로 글자 그대로 있다', () => {
    expect(norm(doc.querySelector('h1'))).toBe('별점에 섞인 체험단 리뷰, 빼고 보세요')
    expect(norm(doc.querySelector('p.lead'))).toBe(
      '쿠팡 상품 페이지에서 체험단 리뷰를 표시하고, 숨기고, 체험단 리뷰를 뺀 평점을 보여 줍니다.',
    )
    expect(norm(doc.getElementById('cta-hero'))).toBe('크롬에 추가')
    expect(norm(doc.getElementById('store-pending'))).toBe('크롬 웹스토어 심사 중입니다. 곧 설치할 수 있어요')
    expect(norm(doc.querySelector('p.cta-note'))).toBe('무료입니다. 쿠팡 상품 페이지에서만 동작합니다.')
  })

  it('예시 카드가 세 줄(라벨과 예시 표시, 숫자, 설명)을 그대로 담는다', () => {
    const card = doc.querySelector('.rating-card')
    expect(norm(card.querySelector('.rating-label'))).toBe('쿠팡 평점 예시')
    expect(norm(card.querySelector('.rating-tag'))).toBe('예시')
    expect(norm(card.querySelector('.rating-values'))).toBe('4.7 → 4.1')
    expect(norm(card.querySelector('.rating-values s'))).toBe('4.7')
    expect(norm(card.querySelector('.rating-values strong'))).toBe('4.1')
    expect(norm(card.querySelector('.rating-caption'))).toBe('리뷰 1,204개 중 체험단 341개를 뺀 평점')
  })

  it('예시 카드의 숫자 줄은 화면 낭독에서 빠지고, 같은 뜻의 숨은 문장이 대신 읽힌다', () => {
    const card = doc.querySelector('.rating-card')
    expect(card.querySelector('.rating-values').getAttribute('aria-hidden')).toBe('true')
    expect(norm(card.querySelector('.visually-hidden'))).toBe('쿠팡 평점 4.7, 체험단 리뷰를 빼면 4.1 (예시)')
    expect(card.querySelector('.visually-hidden').closest('[aria-hidden]')).toBeNull()
  })

  it('히어로는 문장과 예시 카드 두 칸이고, 좁은 화면에서 카드를 위로 올리는 order 규칙이 있다', () => {
    const hero = doc.querySelector('.hero')
    expect([...hero.children].map((el) => el.className)).toEqual(['hero-text', 'rating-card'])
    expect(hero.querySelector('.hero-text h1')).not.toBeNull()
    const css = readFileSync(new URL('style.css', PUBLIC_DIR), 'utf8')
    expect(css).toMatch(/\.rating-card\s*\{[^}]*order:\s*-1/)
  })

  it('720px 이상 블록이 예시 카드의 order 를 0 으로 되돌린다', () => {
    const css = readFileSync(new URL('style.css', PUBLIC_DIR), 'utf8')
    const wide = css.slice(css.indexOf('@media (min-width: 720px)'))
    expect(wide).toMatch(/\.rating-card\s*\{[^}]*order:\s*0/)
  })

  it('h2 넷이 순서대로 있고 문구가 같다', () => {
    expect([...doc.querySelectorAll('h2')].map(norm)).toEqual([
      'PC 크롬에서 설치할 수 있어요',
      '이렇게 보입니다',
      '하는 일',
      '통계는 동의한 경우에만',
    ])
    expect(norm(doc.querySelector('#demo h2'))).toBe('이렇게 보입니다')
  })

  it('PC 안내 문구와 두 버튼이 그대로다', () => {
    const handoff = doc.getElementById('handoff')
    expect(norm(handoff.querySelector('p'))).toBe('휴대폰에서는 확장을 쓸 수 없습니다. 링크를 보내 두었다가 PC 에서 열어 주세요.')
    expect(norm(doc.getElementById('handoff-copy'))).toBe('링크 복사')
    expect(norm(doc.getElementById('handoff-share'))).toBe('공유하기')
  })

  it('하는 일 세 줄과 판정 기준 문장이 그대로다', () => {
    const section = doc.getElementById('features')
    expect([...section.querySelectorAll('li')].map(norm)).toEqual([
      '체험단 제공 리뷰에 표시를 붙입니다',
      '버튼 하나로 숨기고, 다시 누르면 다시 보여 줍니다',
      '체험단 리뷰를 뺀 평점을 원래 평균과 나란히 보여 줍니다',
    ])
    expect(norm(section.querySelector('p'))).toBe(
      '쿠팡이 리뷰에 직접 붙이는 체험단 안내 문구가 있는 리뷰만 체험단 리뷰로 봅니다. 추측으로 판정하지 않습니다.',
    )
  })

  it('통계 절의 세 문단이 그대로다', () => {
    const section = doc.getElementById('stats')
    expect([...section.querySelectorAll('p:not([id])')].map(norm)).toEqual([
      '설치하면 익명 사용 통계를 보낼지 먼저 묻습니다. 동의하지 않아도 모든 기능을 쓸 수 있습니다.',
      '리뷰 내용, 상품 이름, 상품 주소는 보내지 않습니다.',
      '이 페이지는 방문 통계를 기록합니다. 기록하는 내용과 빠지는 방법은 개인정보 처리방침에 있습니다.',
    ])
  })

  it('푸터에 쿠팡과 관계없다는 문장과 처리방침 링크가 있다', () => {
    const footer = doc.querySelector('footer')
    expect(norm(footer)).toContain('이 확장은 쿠팡과 관계가 없는 개인이 만든 도구입니다.')
    const link = footer.querySelector('a')
    expect(link.getAttribute('href')).toBe('/privacy')
    expect(norm(link)).toBe('개인정보 처리방침')
  })

  it('따라오는 설치 바 문구가 그대로다', () => {
    expect(norm(doc.getElementById('sticky'))).toBe('체험단 리뷰 제거기 for 쿠팡 크롬에 추가')
    expect(norm(doc.getElementById('cta-sticky'))).toBe('크롬에 추가')
  })

  it('스크립트가 쓰는 DOM 계약: id 와 요소 종류가 맞다', () => {
    const kinds = {
      'cta-hero': 'A',
      'store-pending': 'P',
      handoff: 'DIV',
      'handoff-copy': 'BUTTON',
      'handoff-share': 'BUTTON',
      'handoff-status': 'P',
      demo: 'SECTION',
      sticky: 'DIV',
      'cta-sticky': 'A',
      'optout-notice': 'P',
    }
    for (const [id, tag] of Object.entries(kinds)) {
      const el = doc.getElementById(id)
      expect(el, id).not.toBeNull()
      expect(el.tagName, id).toBe(tag)
    }
    expect(doc.getElementById('handoff-status').getAttribute('role')).toBe('status')
    expect(doc.getElementById('sticky').classList.contains('sticky')).toBe(true)
    expect(doc.getElementById('handoff-copy').getAttribute('type')).toBe('button')
    expect(doc.getElementById('handoff-share').getAttribute('type')).toBe('button')
  })

  it('스크립트가 없을 때의 기본 상태: 심사 중만 보이고 나머지는 hidden 이다', () => {
    for (const id of ['cta-hero', 'handoff', 'handoff-share', 'sticky', 'optout-notice']) {
      expect(doc.getElementById(id).hasAttribute('hidden'), id).toBe(true)
    }
    expect(doc.getElementById('store-pending').hasAttribute('hidden')).toBe(false)
    expect(doc.getElementById('store-pending').closest('[hidden]')).toBeNull()
  })

  it('예시 숫자에 예시 표시가 있고, 정렬 방식과 표본 수 같은 관측값은 쓰지 않는다', () => {
    expect(norm(doc.querySelector('.rating-card'))).toContain('예시')
    for (const banned of ['베스트순', '최신순', '50개 중']) expect(bodyText).not.toContain(banned)
  })

  it('설치 버튼 두 개가 스토어 주소를 가리키고 rel 에 noopener 가 있다', () => {
    for (const id of ['cta-hero', 'cta-sticky']) {
      const a = doc.getElementById(id)
      expect(a.getAttribute('href'), id).toBe(STORE_URL)
      expect(a.getAttribute('rel').split(/\s+/), id).toContain('noopener')
    }
  })

  it('사진 셋이 배너, 배지, 패널 순서로 있고 alt 가 그대로다', () => {
    const imgs = [...doc.querySelectorAll('#demo img')]
    expect(imgs.map((img) => img.getAttribute('src'))).toEqual(['/img/banner.png', '/img/badge.jpg', '/img/panel.png'])
    expect(imgs.map((img) => img.getAttribute('alt'))).toEqual([
      '리뷰 평균 5, 체험단 제외 4.8 이라고 알려 주는 배너',
      '체험단 제공 리뷰에 표시가 붙은 쿠팡 리뷰 화면',
      '체험단을 뺀 평점과 체험단 비중을 보여 주는 확장 패널',
    ])
  })

  it('모든 img 에 alt, width, height, lazy 가 있고 src 의 파일이 실제로 있다', () => {
    const imgs = [...doc.querySelectorAll('img')]
    expect(imgs.length).toBeGreaterThan(0)
    for (const img of imgs) {
      expect(img.getAttribute('alt') ?? '', img.outerHTML).not.toBe('')
      expect(Number(img.getAttribute('width')), img.outerHTML).toBeGreaterThan(0)
      expect(Number(img.getAttribute('height')), img.outerHTML).toBeGreaterThan(0)
      expect(img.getAttribute('loading')).toBe('lazy')
      expect(existsSync(new URL(img.getAttribute('src').slice(1), PUBLIC_DIR)), img.getAttribute('src')).toBe(true)
    }
  })

  it('/assets/landing.js 를 defer 로 불러온다', () => {
    const script = doc.querySelector('script[src="/assets/landing.js"]')
    expect(script).not.toBeNull()
    expect(script.hasAttribute('defer')).toBe(true)
  })
})

describe('랜딩 스타일시트', () => {
  const css = readFileSync(new URL('style.css', PUBLIC_DIR), 'utf8')

  it('[hidden] 이 display 설정에 지지 않는다', () => {
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/)
  })

  it('720px 이상에서 두 열로 바뀌고 랜딩에서만 main 을 넓힌다', () => {
    expect(css).toContain('@media (min-width: 720px)')
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0,\s*1\.1fr\)\s*minmax\(0,\s*1fr\)/)
    expect(css).toMatch(/body\.landing main\s*\{[^}]*max-width:\s*60rem/)
  })

  it('랜딩에서만 한글을 단어 단위로 줄바꿈한다(다른 페이지 규칙은 그대로)', () => {
    expect(css).toMatch(/body\.landing\s*\{[^}]*word-break:\s*keep-all/)
    expect(css).toMatch(/body\.landing\s*\{[^}]*overflow-wrap:\s*break-word/)
    expect(css).toMatch(/\nbody\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('.visually-hidden 은 display: none 이 아니라 clip 방식이다', () => {
    const rule = css.match(/\.visually-hidden\s*\{([^}]*)\}/)[1]
    expect(rule).toContain('position: absolute')
    expect(rule).toMatch(/clip[^;]*:/)
    expect(rule).not.toMatch(/display:\s*none/)
  })

  it('빈 상태 알림 영역을 display: none 으로 숨기지 않는다', () => {
    expect(css).not.toMatch(/\.handoff-status:empty\s*\{[^}]*display:\s*none/)
  })

  it('position: fixed 는 .sticky 규칙에만 있다', () => {
    const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*position:\s*fixed/g)].map((m) => m[1].trim())
    expect(selectors).toEqual(['.sticky'])
  })

  it('설치 버튼은 48px 이상이고 사진은 화면보다 넓게 그리지 않는다', () => {
    expect(css).toMatch(/\.cta\s*\{[^}]*min-height:\s*48px/)
    expect(css).toMatch(/\.demo img\s*\{[^}]*max-width:\s*100%/)
    expect(css).toMatch(/\.demo img\s*\{[^}]*height:\s*auto/)
  })
})

describe('세 페이지: 엠대시와 가운데 점이 없다', () => {
  for (const name of PAGES) {
    it(name, () => {
      const text = readFileSync(new URL(name, PUBLIC_DIR), 'utf8')
      expect(text).not.toMatch(new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0xb7)}]`))
    })
  }
})

describe('세 페이지 공통', () => {
  for (const name of PAGES) {
    const html = readFileSync(new URL(name, PUBLIC_DIR), 'utf8')
    const doc = new JSDOM(html).window.document

    it(`${name}: 모바일 뷰포트와 한국어 문서다`, () => {
      expect(doc.documentElement.lang).toBe('ko')
      expect(doc.querySelector('meta[name="viewport"]').content).toContain('width=device-width')
    })

    it(`${name}: 인라인 이벤트 핸들러(on 으로 시작하는 속성)가 없다`, () => {
      for (const el of doc.querySelectorAll('*')) {
        const handlers = [...el.attributes].map((attr) => attr.name).filter((attrName) => attrName.toLowerCase().startsWith('on'))
        expect(handlers, el.outerHTML.slice(0, 80)).toEqual([])
      }
    })

    it(`${name}: 원격 자원과 인라인 스크립트가 없다`, () => {
      const sources = [...doc.querySelectorAll('[src], link[href]')].map(
        (el) => el.getAttribute('src') ?? el.getAttribute('href'),
      )
      for (const source of sources) expect(source.startsWith('/') && !source.startsWith('//')).toBe(true)
      for (const script of doc.querySelectorAll('script')) expect(script.textContent.trim()).toBe('')
    })
  }

  it('스타일시트가 16px 좌우 여백, 다크 모드, 시스템 글꼴, 확정 색을 쓴다', () => {
    const css = readFileSync(new URL('style.css', PUBLIC_DIR), 'utf8')
    expect(css).toContain('padding: 32px 16px 64px')
    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).toContain('system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif')
    for (const color of ['#3c3489', '#afa9ec', '#e24b4a']) expect(css.toLowerCase()).toContain(color)
    expect(css).not.toMatch(/@import|url\(/)
  })
})

describe('사이트 스크립트 경계', () => {
  // site/src/ 의 파일과 site/src/landing/ 의 파일을 모두 읽는다.
  const files = [
    ...readdirSync(SRC_DIR).filter((name) => name.endsWith('.js')),
    ...readdirSync(new URL('landing/', SRC_DIR))
      .filter((name) => name.endsWith('.js'))
      .map((name) => `landing/${name}`),
  ]

  it('landing 폴더의 파일도 검사 대상이다', () => {
    expect(files).toContain('landing/landing.js')
    expect(files).toContain('landing/tracker.js')
    expect(files).toContain('uninstalled.js')
  })

  it('innerHTML 을 쓰지 않는다', () => {
    for (const name of files) {
      expect(readFileSync(new URL(name, SRC_DIR), 'utf8'), name).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/)
    }
  })

  it('확장 소스를 가져오지 않는다', () => {
    for (const name of files) {
      expect(readFileSync(new URL(name, SRC_DIR), 'utf8'), name).not.toMatch(/extension\/|config\.local/)
    }
  })
})
