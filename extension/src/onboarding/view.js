const HOW_TO = [
  '쿠팡에서 상품 페이지를 엽니다',
  '리뷰까지 내려가면 체험단 리뷰 비중과 체험단을 뺀 평점이 보입니다',
  '버튼을 누르면 체험단 리뷰를 숨기고, 다시 누르면 다시 볼 수 있습니다',
]

// 동의 전에 보여 주는 고지다. 실제로 보내는 항목과 글자 그대로 맞아야 한다. 이벤트에 항목을 더하면 여기와 처리방침도 함께 고친다.
const SENT = [
  '배너가 뜬 횟수, 체험단 리뷰 비중과 평점 같은 숫자',
  '숨기기 버튼, 패널, 장바구니와 바로구매 버튼을 눌렀는지',
  '리뷰 정렬 방식(베스트순, 최신순)',
  '확장의 화면(설치 안내, 패널)을 열었는지와 이용한 시각',
  '확장 버전, 화면 실험 그룹, 오류가 났는지와 종류',
  '무작위로 만든 익명 기기 번호',
]

const NOT_SENT = [
  '리뷰 내용, 상품 이름, 상품 주소',
  '쿠팡 계정, 이름, 이메일, 결제 정보',
  '쿠팡 상품 페이지가 아닌 다른 사이트에서 무엇을 보거나 했는지',
]

const NOTES = [
  '어떤 상품을 봤는지는 저희도 알 수 없습니다. 상품 번호와 리뷰 번호는 이 기기 밖에서는 원래 번호로 되돌릴 수 없는 값으로 바꿔 보냅니다.',
  '통계는 분석 도구 Amplitude(미국 서버)에 저장됩니다. 광고나 판매에 쓰지 않습니다. 개인을 알 수 없는 집계 결과는 공개할 수 있습니다.',
]

const DONE_COPY = {
  granted: '익명 통계를 보내도록 설정했습니다. 확장 패널에서 언제든 끌 수 있습니다.',
  denied: '통계를 보내지 않도록 설정했습니다. 확장 패널에서 언제든 켤 수 있습니다.',
}

const SAVE_ERROR = '설정을 저장하지 못했습니다. 다시 시도해 주세요.'

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function list(tag, items) {
  const node = el(tag)
  for (const item of items) node.appendChild(el('li', null, item))
  return node
}

function externalLink(className, href, text) {
  const link = el('a', className, text)
  link.href = href
  link.target = '_blank'
  link.rel = 'noopener'
  return link
}

function button(text, onClick, disabled = false) {
  // 선택 버튼은 모두 같은 클래스를 쓴다. 한쪽만 강조해 선택을 유도하지 않는다.
  const node = el('button', 'choice', text)
  node.type = 'button'
  node.disabled = disabled
  node.addEventListener('click', onClick)
  return node
}

function intro() {
  const section = el('section', 'intro')
  section.appendChild(el('h1', null, '설치가 끝났습니다'))
  section.appendChild(el('p', 'lead', '쿠팡 상품 페이지의 리뷰 영역에서 자동으로 동작합니다.'))
  return section
}

function howTo() {
  const section = el('section', 'howto')
  section.appendChild(el('h2', null, '사용 방법'))
  section.appendChild(list('ol', HOW_TO))
  return section
}

function exampleLink({ exampleUrl, onExample }) {
  const paragraph = el('p', 'example')
  const link = externalLink('link', exampleUrl, '예시 상품에서 바로 확인하기')
  link.addEventListener('click', () => onExample())
  paragraph.appendChild(link)
  return paragraph
}

function listBox(title, items) {
  const box = el('section', 'box')
  box.appendChild(el('h3', null, title))
  box.appendChild(list('ul', items))
  return box
}

function saveError() {
  const error = el('p', 'error', SAVE_ERROR)
  error.setAttribute('role', 'alert')
  return error
}

function choiceSection({ onChoose, saveFailed, saving }) {
  const section = el('section', 'consent')
  section.appendChild(el('h2', null, '익명 사용 통계를 보내 주시겠어요?'))
  section.appendChild(
    el(
      'p',
      null,
      '이 확장이 제대로 동작하는지, 어떤 화면이 더 도움이 되는지 확인하는 데만 씁니다. 동의하지 않아도 모든 기능을 쓸 수 있습니다.',
    ),
  )
  section.appendChild(listBox('보내는 것', SENT))
  section.appendChild(listBox('보내지 않는 것', NOT_SENT))
  for (const note of NOTES) section.appendChild(el('p', 'note', note))

  const choices = el('div', 'choices')
  choices.appendChild(button('동의하고 시작', () => onChoose('granted'), saving))
  choices.appendChild(button('통계 없이 사용', () => onChoose('denied'), saving))
  section.appendChild(choices)

  if (saveFailed) section.appendChild(saveError())
  return section
}

// 예시 링크는 선택을 마친 이 화면에서만 보여 준다(동의든 거절이든). 선택 전에 보여 주면 눌러서 떠난 사용자가
// 동의하지 않은 채 표본에서 빠져 실험이 치우친다.
function doneSection({ status, onChange, saving, saveFailed, showExample, exampleUrl, onExample }) {
  const section = el('section', 'consent')
  const message = el('p', 'done', DONE_COPY[status])
  message.setAttribute('role', 'status')
  section.appendChild(message)
  if (showExample) section.appendChild(exampleLink({ exampleUrl, onExample }))
  section.appendChild(button('설정 바꾸기', () => onChange(), saving))
  if (saveFailed) section.appendChild(saveError())
  return section
}

// status 가 granted 나 denied 면 완료 상태, 그 밖에는 선택 화면이다. showExample 은 완료 상태에서만 쓰인다.
export function renderOnboarding(root, { status, showExample, exampleUrl, privacyUrl, onChoose, onExample, onChange, saveFailed, saving = false }) {
  root.replaceChildren()

  root.appendChild(intro())
  root.appendChild(howTo())
  root.appendChild(el('hr'))

  root.appendChild(
    Object.hasOwn(DONE_COPY, status)
      ? doneSection({ status, onChange, saving, saveFailed, showExample, exampleUrl, onExample })
      : choiceSection({ onChoose, saveFailed, saving }),
  )

  if (privacyUrl) {
    const paragraph = el('p', 'privacy')
    paragraph.appendChild(externalLink('link', privacyUrl, '개인정보 처리방침'))
    root.appendChild(paragraph)
  }
}
