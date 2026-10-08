import { parseReviews, findReviewContainer } from './parser.js'
import { scrollRatio, createObservation, selectHealthSignals } from './health.js'
import { safeErrorName } from '../shared/error-name.js'
import { summarize } from '../core/rating.js'
import { createBanner } from './banner.js'
import { markSponsored, applyFilter } from './filter.js'
import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { debugLog } from '../shared/log.js'
import { detectSort } from './sort.js'
import { watchPurchaseIntent } from './purchase.js'
import { coupang } from './sites/coupang.js'
import { resolveSite } from './sites/index.js'

const LOG_PREFIX = '[체험단 필터]'
// 대상 주소는 매니페스트가 정하므로 실제 크롬에서는 항상 부품이 있는 호스트다.
// 테스트의 jsdom 은 호스트가 쿠팡이 아닐 수 있어 기본값을 쿠팡으로 둔다.
const site = resolveSite(window.location.hostname) ?? coupang
// 변형 응답이 오지 않을 때 기본값으로 확정하기까지 기다리는 시간.
const VARIANT_WAIT_MS = 3000
const DEFAULT_VARIANTS = { default_filter: 'off', banner_copy: 'rating' }
// 묶음 관측(무신사)에서 새로 본 후기 번호가 이만큼 쌓일 때마다 Banner Rendered 를 한 번 보낸다.
const BATCH_SIZE = 10
const BANNER_SELECTOR = '[data-crf-banner="1"]'
// 조건 보기(체험단 조건의 상태가 on 이나 unknown)에서 숨김 버튼 대신 보여 주는 안내 글.
const CONDITION_NOTES = Object.freeze({
  on: '체험단 후기만 모아 보는 중입니다',
  unknown: '무신사 화면이 바뀌어 지금은 숨기기를 쓸 수 없습니다',
})

const state = {
  hidden: false,
  // 변형이 확정되기 전에 사용자가 토글했으면 도착한 변형이 그 선택을 덮지 않는다.
  userToggled: false,
  variants: DEFAULT_VARIANTS,
  // 확정 전 관측 이벤트는 pendingEvents 에 쌓았다가 확정 뒤 확정된 상태로 보낸다.
  variantsResolved: false,
  pendingEvents: [],
  // 다시 그리기 키(글자 수 포함)와 관측 키(안정 id 면 id 만)를 따로 둔다.
  redrawKey: '',
  observationKey: '',
  productId: null,
  seen: new Map(),
  renderedAt: 0,
  pagesSeen: 0,
  // 같은 상품에서 마지막으로 관측한 정렬과 그 정렬에서 본 페이지 수.
  observedSort: null,
  sortPagesSeen: 0,
  // 묶음 관측에서 마지막으로 Banner Rendered 를 보낸 뒤 새로 누적된 후기 번호 수.
  unobservedCount: 0,
  lastSummary: null,
  // 지금 배너에 숨김 버튼이 있으면 그 화면의 리뷰, 없으면(체험단 0건, 조건 보기, 그리기 전) null 이다.
  // 사이드 패널의 숨김 요청은 이 값이 있을 때만 받는다.
  toggleReviews: null,
  reportedErrors: new Set(),
  observation: createObservation(),
}

/* @__PURE__ */ debugLog(`${LOG_PREFIX} 콘텐츠 스크립트 로드됨`)

let trackFailureReported = false
let variantTimer = null

function reportTrackFailure(error) {
  if (trackFailureReported) return
  trackFailureReported = true
  console.warn(`${LOG_PREFIX} 백그라운드에 메시지를 보내지 못했습니다:`, error?.message ?? error)
}

function sendToBackground(message) {
  // 계측 실패가 제품을 멈추면 안 되므로 예외는 삼키되, 원인은 한 번 알린다.
  // MV3의 sendMessage는 콜백이 없으면 Promise를 반환하므로 동기 예외와 거부를 모두 잡는다.
  try {
    const pending = chrome.runtime.sendMessage(message)
    if (pending && typeof pending.catch === 'function') pending.catch(reportTrackFailure)
  } catch (error) {
    reportTrackFailure(error)
  }
}

function sendTrack(eventType, properties) {
  sendToBackground({ type: MESSAGES.TRACK, eventType, properties })
}

function filterState() {
  return state.hidden ? 'on' : 'off'
}

// 이벤트를 만들고 보내는 과정 전체를 보호한다. 정렬 판별, 상품 번호, 프로퍼티 계산이 던져도
// 렌더나 사용자 동작을 막지 않고 원인은 한 번 알린다. properties 는 객체이거나 같은 보호 안에서 계산할 함수다.
// afterVariants 를 주면 변형이 확정된 뒤의 값을 보낼 때 계산해 더한다. 확정 전이면 대기열에 둔다.
function track(eventType, properties = {}, afterVariants = null) {
  try {
    const captured = {
      review_sort: currentSort(),
      product_id: withKeyPrefix(currentProductId()),
      ...(typeof properties === 'function' ? properties() : properties),
      // 이벤트 프로퍼티가 덮어쓸 수 없게 마지막에 넣는다.
      site: site.id,
    }
    if (afterVariants && !state.variantsResolved) {
      state.pendingEvents.push({ eventType, captured, afterVariants })
      return
    }
    sendTrack(eventType, afterVariants ? { ...captured, ...afterVariants() } : captured)
  } catch (error) {
    reportTrackFailure(error)
  }
}

function flushPendingEvents() {
  const pending = state.pendingEvents
  state.pendingEvents = []
  for (const { eventType, captured, afterVariants } of pending) {
    try {
      sendTrack(eventType, { ...captured, ...afterVariants() })
    } catch (error) {
      reportTrackFailure(error)
    }
  }
}

// 같은 상품 페이지에서 같은 error_type 과 error_name 조합은 한 번만 보낸다.
// render 는 MutationObserver 가 수시로 부르므로 억제하지 않으면 같은 예외가 이벤트를 폭주시킨다.
function reportExtensionError(properties) {
  try {
    const key = `${properties.error_type}|${properties.error_name ?? ''}`
    if (state.reportedErrors.has(key)) return
    state.reportedErrors.add(key)
    track(EVENTS.EXTENSION_ERROR, properties)
  } catch (error) {
    // 보고 경로의 실패가 제품이나 이후 보고를 막으면 안 된다.
    reportTrackFailure(error)
  }
}

// 예외 메시지는 자유 텍스트라 싣지 않는다. 종류와 이름만 보내고, 이름도 고정된 모양(영문자 1~40자)일 때만 그대로 보낸다.
function reportRenderException(error) {
  reportExtensionError({
    error_type: 'RenderException',
    error_name: safeErrorName(error?.name),
  })
}

function currentScrollRatio() {
  return scrollRatio({
    scrollY: window.scrollY,
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
  })
}

function trackScroll() {
  state.observation.maxScrollRatio = Math.max(state.observation.maxScrollRatio, currentScrollRatio())
}

// 렌더는 관측만 쌓고, 셀렉터 깨짐 판정은 상품 페이지를 떠날 때 한 번 한다.
// leaving 을 넘기면 떠나는 상품의 번호와 마지막 관측 정렬로 보낸다(같은 탭 안 이동에서 현재 주소와 정렬은 이미 새 페이지 값이다).
// 마지막 스크롤은 pagehide 경로(leaving 없음)에서만 반영한다. 상품 전환 때의 scrollY 는 이미 새 페이지 값이다.
function flushHealthSignals(leaving) {
  try {
    // 대상 페이지가 아닌 주소에서 떠날 때는 판정할 상품이 없다.
    if (leaving === undefined && currentProductId() === null) return
    if (leaving === undefined) trackScroll()
    for (const signal of selectHealthSignals(state.observation)) {
      reportExtensionError(
        leaving === undefined
          ? signal
          : {
              ...signal,
              product_id: withKeyPrefix(leaving.productId),
              review_sort: leaving.reviewSort,
            },
      )
    }
  } catch (error) {
    reportTrackFailure(error)
  }
}

function observeReviews(container, reviews) {
  const observation = state.observation
  observation.containerFound = true
  observation.maxItemCount = Math.max(
    observation.maxItemCount,
    site.findItems(container).length,
  )
  observation.maxParsedCount = Math.max(observation.maxParsedCount, reviews.length)
  if (reviews.length > 0) observation.parsedAnyReview = true
  if (reviews.some((review) => review.hasStableId)) observation.sawStableId = true
}

// 첫 배너 이후 경과 초. 배너가 없었으면 null 이다(0 이면 즉시 행동과 구분되지 않는다).
function secondsSinceRender() {
  return state.renderedAt === 0 ? null : Math.round((Date.now() - state.renderedAt) / 1000)
}

// 문서가 열린 뒤 경과한 진짜 페이지 체류 시간(초).
function secondsOnPage() {
  return Math.round(performance.now() / 1000)
}

function currentProductId() {
  return site.productIdOf(window.location.pathname)
}

// 보내는 번호에는 쇼핑몰 접두를 붙여 두 쇼핑몰의 같은 번호가 겹치지 않게 한다. 쿠팡은 접두가 없다.
// state.productId 와 누적 키에는 붙이지 않는다.
function withKeyPrefix(value) {
  return value === null ? null : `${site.keyPrefix}${value}`
}

// 쿠팡의 정렬은 sort.js 를 거쳐 읽는다(부품의 detectSort 와 같은 함수다).
// 기존 테스트가 sort.js 를 바꿔 끼워 정렬 판별이 던지는 경우를 만들기 때문이다.
function currentSort() {
  return site === coupang ? detectSort(document) : site.detectSort(document)
}

// 체험단 후기만 모아 보는 조건의 상태: 'off', 'on', 'unknown'(버튼은 있는데 읽지 못한다).
// 읽다가 던져도 배지와 배너는 동작해야 하므로 고르지 않은 것으로 본다.
function sponsoredFilterState() {
  try {
    const value = site.sponsoredFilterState(document)
    return Object.hasOwn(CONDITION_NOTES, value) ? value : 'off'
  } catch (error) {
    return 'off'
  }
}

// 더 보면 숫자가 늘어난다는 안내. 쇼핑몰과 지금 주소에 따라 다르다.
function currentScopeHint() {
  return site.scopeHint(window.location.pathname)
}

function removeBanner() {
  const existing = document.querySelector(BANNER_SELECTOR)
  if (existing) existing.remove()
}

function resetIfProductChanged() {
  const productId = currentProductId()
  if (productId === state.productId) return
  // 떠나는 상품의 신호를 먼저 판정하고 나서 비운다. pagehide 만 기다리면 같은 탭 안 이동에서 앞 상품 신호가 사라진다.
  if (state.productId !== null) {
    flushHealthSignals({ productId: state.productId, reviewSort: state.observedSort ?? 'unknown' })
  }
  state.productId = productId
  state.seen.clear()
  state.redrawKey = ''
  state.observationKey = ''
  state.renderedAt = 0
  state.pagesSeen = 0
  state.observedSort = null
  state.sortPagesSeen = 0
  state.unobservedCount = 0
  state.reportedErrors.clear()
  state.observation = createObservation()
}

// 이번 화면에서 처음 본 후기 번호 수. 누적에 넣기 전에 센다.
function countUnseen(reviews) {
  return reviews.filter((review) => review.hasStableId && !state.seen.has(review.id)).length
}

function accumulate(reviews) {
  const identified = reviews.filter((review) => review.hasStableId)

  if (identified.length === 0) {
    return reviews.map((review) => ({
      rating: review.rating,
      sponsored: review.sponsored,
    }))
  }

  for (const review of identified) {
    state.seen.set(review.id, {
      rating: review.rating,
      sponsored: review.sponsored,
    })
  }

  return [...state.seen.values()]
}

function render(options) {
  try {
    renderReviews(options)
  } catch (error) {
    // 콘텐츠 스크립트가 죽으면 이후 페이지 전환에서 아무것도 안 되므로 다시 던지지 않는다.
    reportRenderException(error)
  }
}

// 다시 그리기 키: 늦게 채워진 본문(체험단 문구 등)도 다시 판정하도록 글자 수까지 본다.
function redrawKeyOf(reviews) {
  return reviews.map((review) => `${review.id}:${review.rating}:${review.text.length}`).join(',')
}

// 관측 키: 안정 id 가 있으면 id 만 본다. 도움이 돼요, 더보기로 글자 수만 바뀐 같은 페이지를 새 관측으로 세지 않는다.
// 폴백 id 는 위치 번호라 페이지가 바뀌어도 같으므로 내용까지 본다.
function observationKeyOf(reviews) {
  return reviews
    .map((review) =>
      review.hasStableId ? review.id : `${review.id}:${review.rating}:${review.text.length}`,
    )
    .join(',')
}

// 새 관측인지. 페이지 관측(쿠팡)은 리뷰 묶음이 바뀔 때마다 새 관측이다.
// 묶음 관측(무신사)은 카드가 한두 장씩 바뀌므로 상품에서 처음 한 번, 그 뒤로는 새 번호가 BATCH_SIZE 만큼 쌓일 때만이다.
function isNewObservation(observationKey) {
  if (site.observation === 'batch') {
    return state.pagesSeen === 0 || state.unobservedCount >= BATCH_SIZE
  }
  return observationKey !== state.observationKey
}

// Banner Rendered 프로퍼티. track 의 보호 안에서 계산한다.
function observationProperties(reviews, summary, pagesSeen) {
  const sort = currentSort()
  // 정렬을 바꾸면 쿠팡은 1페이지를 보여 주므로 sort_pages_seen = 1 이 그 정렬의 첫 페이지다.
  if (sort !== state.observedSort) {
    state.observedSort = sort
    state.sortPagesSeen = 0
  }
  state.sortPagesSeen += 1

  return {
    review_sort: sort,
    review_count: summary.total,
    sponsored_count: summary.sponsoredCount,
    sponsored_ratio: summary.sponsoredRatio,
    rating_official: summary.ratingOfficial,
    rating_filtered: summary.ratingFiltered,
    rating_delta: summary.ratingDelta,
    page_review_count: reviews.length,
    page_sponsored_count: reviews.filter((review) => review.sponsored).length,
    pages_seen: pagesSeen,
    sort_pages_seen: state.sortPagesSeen,
    // 같은 페이지 재방문을 분석에서 중복 제거하는 키. 공개 id 만 쓰고 본문은 싣지 않는다.
    page_first_review_id: reviews[0].hasStableId ? withKeyPrefix(reviews[0].id) : null,
  }
}

function openPanel() {
  sendToBackground({ type: MESSAGES.OPEN_PANEL })
}

// 숨김 설정을 바꾼다. 배너 버튼과 사이드 패널의 요청이 같이 쓴다. source 는 'banner' 나 'panel' 이다.
// 다시 그리면서 요약도 다시 보내므로 패널이 따라온다.
function toggleFilter(reviews, next, source) {
  state.hidden = next
  state.userToggled = true
  applyFilter(reviews, next, site.hiddenClass)
  track(
    EVENTS.FILTER_TOGGLED,
    {
      to_state: next ? 'on' : 'off',
      seconds_since_render: secondsSinceRender() ?? 0,
      pages_seen: state.pagesSeen,
      toggle_source: source,
    },
    () => ({ default_state: state.variants.default_filter }),
  )
  render({ force: true })
}

// 사이드 패널이 보낸 숨김 요청을 받는다. 응답은 보내지 않는다.
// 웹 페이지는 이 메시지를 보낼 수 없지만 다른 확장이 보낸 것은 받지 않도록 보낸 쪽을 확인한다.
function handleRuntimeMessage(message, sender) {
  if (sender?.id !== chrome.runtime.id) return false
  if (message?.type !== MESSAGES.SET_FILTER) return false
  if (typeof message.hidden !== 'boolean') return false
  // 배너에 숨김 버튼이 없는 동안에는 받지 않는다.
  if (state.toggleReviews === null) return false
  if (message.hidden === state.hidden) return false
  toggleFilter(state.toggleReviews, message.hidden, 'panel')
  return false
}

function placeBanner(container, banner) {
  removeBanner()
  const anchor = site.bannerAnchor(container)
  anchor.parentNode.insertBefore(banner, anchor)
}

// 조건 보기: 화면의 후기는 사용자가 고른 조건의 결과라 누적하지 않고 Banner Rendered 도 보내지 않는다.
// 배너와 요약은 조건에 들어가기 전의 누적 그대로다. 누적이 비어 있으면 안내 글만 보여 주고 요약은 보내지 않는다.
function renderConditionView(container, conditionState) {
  if (conditionState === 'unknown') reportExtensionError({ error_type: 'SponsoredFilterUnknown' })

  state.toggleReviews = null
  const summary = state.seen.size > 0 ? summarize([...state.seen.values()]) : null
  if (summary !== null) {
    sendToBackground({
      type: MESSAGES.SUMMARY_UPDATED,
      summary: { ...summary, site: site.id, hidden: state.hidden, canToggle: false },
    })
  }
  placeBanner(
    container,
    createBanner(summary, {
      copyVariant: state.variants.banner_copy,
      // 조건 보기에서는 더 봐도 누적하지 않으므로 범위 안내를 주지 않는다. 요약에도 싣지 않는다.
      note: CONDITION_NOTES[conditionState],
      onDetail: openPanel,
    }),
  )
}

function renderReviews({ force = false } = {}) {
  resetIfProductChanged()
  // 주소와 화면만 바뀌어 대상 페이지를 벗어났으면 그리지 않고 남은 배너를 지운다.
  if (state.productId === null) {
    removeBanner()
    state.toggleReviews = null
    return
  }

  const container = findReviewContainer(document, site)
  if (!container) return

  const reviews = parseReviews(document, site)
  observeReviews(container, reviews)
  if (reviews.length === 0) return

  // 같은 카드라도 조건 보기에 들어가거나 나오면 다시 그린다.
  const conditionState = sponsoredFilterState()
  const conditionView = conditionState !== 'off'
  const redrawKey = `${redrawKeyOf(reviews)}|${conditionState}`
  const observationKey = observationKeyOf(reviews)
  const bannerPresent = document.querySelector(BANNER_SELECTOR) !== null
  if (redrawKey === state.redrawKey && bannerPresent && !force) return

  markSponsored(reviews)
  // 조건 보기에서는 숨기지 않는다. 나오면 다음 렌더가 지금 화면의 카드를 누적하고 원래 설정대로 다시 숨긴다.
  applyFilter(reviews, state.hidden && !conditionView, site.hiddenClass)
  if (conditionView) {
    renderConditionView(container, conditionState)
    state.redrawKey = redrawKey
    return
  }

  state.unobservedCount += countUnseen(reviews)
  const summary = summarize(accumulate(reviews))
  state.lastSummary = summary
  const scopeHint = currentScopeHint()
  // 배너가 숨김 버튼을 두는 조건과 같다(banner.js). 패널은 이 값이 true 일 때만 숨김 버튼을 둔다.
  const canToggle = summary.sponsoredCount > 0
  sendToBackground({
    type: MESSAGES.SUMMARY_UPDATED,
    summary: { ...summary, site: site.id, scopeHint, hidden: state.hidden, canToggle },
  })
  /* @__PURE__ */ debugLog(
    `${LOG_PREFIX} 리뷰 ${summary.total}건, 체험단 ${summary.sponsoredCount}건, ` +
      `평균 ${summary.ratingOfficial} → 체험단 제외 ${summary.ratingFiltered} ` +
      `[${reviews[0].id}..${reviews[reviews.length - 1].id}]`,
  )

  // 관측은 리뷰 묶음이 실제로 바뀔 때만 기록한다.
  // 토글, 변형 도착, 배너 복구, 같은 리뷰의 글자 수 변화는 다시 그리기일 뿐 새 관측이 아니다.
  // filter_state 는 변형이 확정된 뒤 사용자가 실제로 보게 된 상태로 보낸다.
  // 묶음 관측(무신사)은 화면은 매번 갱신하고 이벤트만 드물게 보낸다(isNewObservation).
  if (isNewObservation(observationKey)) {
    state.pagesSeen += 1
    state.unobservedCount = 0
    if (state.renderedAt === 0) state.renderedAt = Date.now()
    const pagesSeen = state.pagesSeen
    track(
      EVENTS.BANNER_RENDERED,
      () => observationProperties(reviews, summary, pagesSeen),
      () => ({ filter_state: filterState() }),
    )
  }
  // 이 앞에서 예외가 나면 같은 묶음을 다음 렌더가 다시 시도하도록 키는 관측 직후에 갱신한다.
  state.observationKey = observationKey
  state.redrawKey = redrawKey

  const banner = createBanner(summary, {
    hidden: state.hidden,
    copyVariant: state.variants.banner_copy,
    scopeHint,
    onToggle: (next) => toggleFilter(reviews, next, 'banner'),
    onDetail: openPanel,
  })

  placeBanner(container, banner)
  state.toggleReviews = canToggle ? reviews : null
}

// 변형 확정. 응답(변형 없음과 lastError 포함), 응답 대기 시간 초과, 요청 실패 중 먼저 오는 하나만 반영한다.
function resolveVariants(variants) {
  if (state.variantsResolved) return
  state.variantsResolved = true
  clearTimeout(variantTimer)

  const previousHidden = state.hidden
  const previousCopy = state.variants.banner_copy
  if (variants) {
    state.variants = variants
    if (!state.userToggled) state.hidden = variants.default_filter === 'on'
  }

  // 변형을 적용한 뒤 대기열을 순서대로 보낸다. 다시 그리기에서 생길 새 관측은 그 뒤에 나간다.
  flushPendingEvents()

  if (state.hidden !== previousHidden || state.variants.banner_copy !== previousCopy) {
    render({ force: true })
  }
}

function applyVariants() {
  variantTimer = setTimeout(() => resolveVariants(null), VARIANT_WAIT_MS)
  try {
    chrome.runtime.sendMessage({ type: MESSAGES.GET_VARIANT }, (response) => {
      // 수신 측이 없으면 lastError 가 설정된 채 응답 없이 불린다. 읽어 두어야 확인되지 않은 오류가 남지 않는다.
      const failed = Boolean(chrome.runtime.lastError)
      resolveVariants(failed ? null : (response?.variants ?? null))
    })
  } catch (error) {
    console.warn(`${LOG_PREFIX} 실험 배정을 받지 못했습니다. 기본값으로 동작합니다.`)
    resolveVariants(null)
  }
}

// 부품이 정한 속성(watchAttributes)이 있으면 그 속성만 바뀐 카드도 다시 읽는다.
// 볼 속성이 없는 쇼핑몰의 옵션에는 속성 항목을 넣지 않는다.
function observerOptions() {
  const options = { childList: true, subtree: true }
  if (site.watchAttributes.length === 0) return options
  return { ...options, attributes: true, attributeFilter: site.watchAttributes }
}

function start() {
  render()
  const observer = new MutationObserver(() => render())
  observer.observe(document.body, observerOptions())

  window.addEventListener('scroll', trackScroll, { passive: true })
  // 리뷰는 스크롤해야 지연 로딩되므로, 떠나는 시점에 컨테이너를 못 찾았는지 판정한다.
  window.addEventListener('pagehide', () => flushHealthSignals())

  watchPurchaseIntent(document, (kind) => {
    const summary = state.lastSummary
    track(EVENTS.PURCHASE_INTENT_CLICKED, {
      intent_kind: kind,
      filter_state: filterState(),
      seconds_on_page: secondsOnPage(),
      seconds_since_render: secondsSinceRender(),
      pages_seen: state.pagesSeen,
      review_count: summary?.total ?? 0,
      sponsored_ratio: summary?.sponsoredRatio ?? null,
      rating_official: summary?.ratingOfficial ?? null,
      rating_filtered: summary?.ratingFiltered ?? null,
      rating_delta: summary?.ratingDelta ?? null,
    })
  }, site.purchase)

  applyVariants()
  // 메시지를 받지 못하는 문맥이어도 배지와 배너는 동작해야 한다.
  chrome.runtime.onMessage?.addListener(handleRuntimeMessage)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
