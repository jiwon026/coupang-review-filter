function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function formatCount(value) {
  return value.toLocaleString('ko-KR')
}

export function renderPanel(root, summary) {
  root.replaceChildren()

  if (!summary) {
    root.appendChild(el('p', 'empty', '쿠팡 상품 페이지에서 리뷰 영역까지 스크롤해 주세요.'))
    return
  }

  root.appendChild(el('h1', null, '체험단 리뷰 제거기'))

  const rating = el('section', 'stat')
  rating.appendChild(el('p', 'stat-label', '체험단 제외 평점'))
  rating.appendChild(
    el('p', 'stat-value', summary.ratingFiltered === null ? '계산 불가' : String(summary.ratingFiltered)),
  )
  rating.appendChild(el('p', 'stat-label', `리뷰 평균 ${summary.ratingOfficial ?? '없음'}`))
  root.appendChild(rating)

  const percent = Math.round(summary.sponsoredRatio * 100)
  const ratio = el('section', 'stat')
  ratio.appendChild(el('p', 'stat-label', `체험단 비중 ${percent}%`))
  const bar = el('div', 'bar')
  const fill = el('div', 'bar-fill')
  fill.style.width = `${percent}%`
  bar.appendChild(fill)
  ratio.appendChild(bar)
  ratio.appendChild(
    el('p', 'stat-label', `리뷰 ${formatCount(summary.total)}개 중 ${formatCount(summary.sponsoredCount)}개`),
  )
  root.appendChild(ratio)

  root.appendChild(el('p', 'scope', `지금까지 확인한 리뷰 ${formatCount(summary.total)}개 기준입니다`))
}

const CONSENT_COPY = {
  granted: { text: '익명 사용 통계를 보내고 있습니다', action: '보내지 않기' },
  denied: { text: '익명 사용 통계를 보내지 않습니다', action: '보내기' },
  undecided: { text: '익명 사용 통계를 보낼지 아직 고르지 않았습니다', action: '자세히 보고 고르기' },
}

const SAVE_ERROR = '설정을 저장하지 못했습니다. 다시 시도해 주세요.'
const DETAILS_LABEL = '보내는 내용 보기'
const DEVICE_LABEL = '익명 기기 번호: '
const DEVICE_NOTE = '통계 삭제를 요청할 때 이 번호를 알려 주세요.'

// 보내기는 다시 알리지 않고 바로 켠다. 무엇을 보내는지 다시 볼 수 있게 온보딩 페이지를 여는 링크를 둔다.
// 동작(탭 열기)이라 button 으로 만들고 모양만 링크다. undecided 에서는 주 버튼이 같은 일을 하므로 두지 않는다.
function detailsLink(onLearnMore) {
  const details = el('button', 'consent-link consent-details', DETAILS_LABEL)
  details.type = 'button'
  details.addEventListener('click', () => onLearnMore())
  return details
}

function privacyLink(privacyUrl) {
  const link = el('a', 'consent-link', '개인정보 처리방침')
  link.href = privacyUrl
  link.target = '_blank'
  link.rel = 'noopener'
  return link
}

// 요약과는 별도 컨테이너에 그린다. 요약이 실시간으로 갱신돼도 이 구역은 지워지지 않는다.
// status 가 granted 나 denied 가 아니면 undecided 로 본다.
// deviceId 는 통계 삭제를 요청할 때 알려 줄 익명 기기 번호다. 있을 때만 구역 맨 아래에 보여 준다.
export function renderConsent(container, { status, deviceId = null, privacyUrl, onChange, onLearnMore, saveFailed = false, saving = false }) {
  container.replaceChildren()

  const copy = Object.hasOwn(CONSENT_COPY, status) ? CONSENT_COPY[status] : CONSENT_COPY.undecided
  const section = el('section', 'consent')
  const message = el('p', 'consent-status', copy.text)
  message.setAttribute('role', 'status')
  section.appendChild(message)

  const action = el('button', 'consent-action', copy.action)
  action.type = 'button'
  action.disabled = saving
  action.addEventListener('click', () => {
    if (status === 'granted') onChange('denied')
    else if (status === 'denied') onChange('granted')
    else onLearnMore()
  })
  section.appendChild(action)

  if (saveFailed) {
    const error = el('p', 'consent-error', SAVE_ERROR)
    error.setAttribute('role', 'alert')
    section.appendChild(error)
  }

  const decided = status === 'granted' || status === 'denied'
  if (decided || privacyUrl) {
    const links = el('p', 'consent-links')
    if (decided) links.appendChild(detailsLink(onLearnMore))
    if (privacyUrl) links.appendChild(privacyLink(privacyUrl))
    section.appendChild(links)
  }

  if (typeof deviceId === 'string' && deviceId !== '') {
    const device = el('p', 'consent-device', DEVICE_LABEL)
    // 번호만 따로 선택해 복사할 수 있게 별도 요소에 둔다(스타일의 user-select: all).
    device.appendChild(el('span', 'consent-device-id', deviceId))
    section.appendChild(device)
    section.appendChild(el('p', 'consent-device-note', DEVICE_NOTE))
  }

  container.appendChild(section)
}
