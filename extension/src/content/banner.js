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

function createNote(text) {
  const note = document.createElement('p')
  note.className = 'crf-note'
  note.textContent = text
  return note
}

function createScope(text) {
  const scope = document.createElement('p')
  scope.className = 'crf-scope'
  scope.textContent = text
  return scope
}

// options.scopeHint 는 더 보면 숫자가 늘어난다는 안내다. 없으면 범위 줄에 본 리뷰 수만 쓴다.
// options.note 는 조건 보기(무신사의 체험단 조건)에서 숨김 버튼 자리에 두는 안내 글이다.
// summary 가 null 이면 누적이 아직 없는 조건 보기다. 안내 글 한 줄만 둔다.
export function createBanner(summary, options) {
  const root = document.createElement('div')
  root.className = 'crf-banner'
  root.setAttribute('data-crf-banner', '1')

  if (summary === null) {
    root.appendChild(createNote(options.note))
    return root
  }

  const scopeHint =
    typeof options.scopeHint === 'string' && options.scopeHint !== '' ? options.scopeHint : null

  if (summary.sponsoredCount === 0) {
    const clean = document.createElement('p')
    clean.className = 'crf-headline'
    clean.textContent = `지금까지 본 리뷰 ${formatCount(summary.total)}개 중 체험단 리뷰가 없습니다`
    root.appendChild(clean)
    // 본 리뷰 수는 헤드라인에 이미 있으므로 안내만 쓴다.
    if (scopeHint !== null) root.appendChild(createScope(scopeHint))
    // 누적에는 체험단이 없는데 화면에는 체험단 후기만 보이는 조건 보기다. 안내 글로 알린다.
    if (options.note) root.appendChild(createNote(options.note))
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

  if (options.note) {
    // 조건 보기에서는 숨기지 않으므로 버튼 대신 안내 글을 둔다.
    root.appendChild(createNote(options.note))
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

  const scopeBase = `지금까지 본 리뷰 ${formatCount(summary.total)}개 기준입니다`
  root.appendChild(createScope(scopeHint === null ? scopeBase : `${scopeBase}. ${scopeHint}`))

  return root
}
