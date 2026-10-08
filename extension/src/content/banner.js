function formatCount(value) {
  return value.toLocaleString('ko-KR')
}

function formatPercent(ratio) {
  return `${Math.round(ratio * 100)}%`
}

function createDetailButton(onDetail) {
  const detail = document.createElement('button')
  detail.type = 'button'
  detail.className = 'crf-detail'
  detail.textContent = '자세히 보기'
  detail.addEventListener('click', () => onDetail())
  return detail
}

export function createBanner(summary, options) {
  const root = document.createElement('div')
  root.className = 'crf-banner'
  root.setAttribute('data-crf-banner', '1')

  if (summary.sponsoredCount === 0) {
    const clean = document.createElement('p')
    clean.className = 'crf-headline'
    clean.textContent = `지금까지 확인한 리뷰 ${formatCount(summary.total)}개 중 체험단 리뷰가 없습니다`
    root.appendChild(clean)
    if (typeof options.onDetail === 'function') root.appendChild(createDetailButton(options.onDetail))
    return root
  }

  // banner_copy 실험: 두 변형은 같은 정보를 담고 무엇을 헤드라인(강조)으로 두는지만 다르다.
  const ratingLine =
    `리뷰 평균 ${summary.ratingOfficial} → 체험단 제외 ` +
    `${summary.ratingFiltered === null ? '계산 불가' : summary.ratingFiltered}`
  const percent = formatPercent(summary.sponsoredRatio)
  const [headlineText, subText] =
    options.copyVariant === 'ratio'
      ? [`지금까지 본 리뷰의 ${percent}가 체험단입니다`, ratingLine]
      : [
          ratingLine,
          `리뷰 ${formatCount(summary.total)}개 중 체험단 ${formatCount(summary.sponsoredCount)}개 (${percent})`,
        ]

  const headline = document.createElement('p')
  headline.className = 'crf-headline'
  headline.textContent = headlineText
  root.appendChild(headline)

  const sub = document.createElement('p')
  sub.className = 'crf-sub'
  sub.textContent = subText
  root.appendChild(sub)

  if (options.sponsoredOnly) {
    // 체험단 후기만 모아 보는 조건에서는 숨기지 않으므로 버튼 대신 안내 글을 둔다.
    const note = document.createElement('p')
    note.className = 'crf-note'
    note.textContent = '체험단 후기만 모아 보는 중입니다'
    root.appendChild(note)
  } else {
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'crf-toggle'
    toggle.setAttribute('aria-pressed', String(options.hidden))
    toggle.textContent = options.hidden ? '체험단 리뷰 다시 보기' : '체험단 리뷰 숨기기'
    toggle.addEventListener('click', () => options.onToggle(!options.hidden))
    root.appendChild(toggle)
  }

  if (typeof options.onDetail === 'function') root.appendChild(createDetailButton(options.onDetail))

  const scope = document.createElement('p')
  scope.className = 'crf-scope'
  scope.textContent = `지금까지 확인한 리뷰 ${formatCount(summary.total)}개 기준입니다`
  root.appendChild(scope)

  return root
}
