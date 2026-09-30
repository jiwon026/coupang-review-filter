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
