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

  root.appendChild(el('h1', null, '체험단 리뷰 필터'))

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

// 요약과는 별도 컨테이너에 그린다. 요약이 실시간으로 갱신돼도 이 구역은 지워지지 않는다.
// status 가 granted 나 denied 가 아니면 undecided 로 본다.
export function renderConsent(container, { status, privacyUrl, onChange, onLearnMore, saveFailed = false, saving = false }) {
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

  if (privacyUrl) {
    const link = el('a', 'consent-link', '개인정보 처리방침')
    link.href = privacyUrl
    link.target = '_blank'
    link.rel = 'noopener'
    section.appendChild(link)
  }

  container.appendChild(section)
}
