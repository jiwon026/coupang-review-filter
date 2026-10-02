import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { SITE, privacyUrl } from '../shared/site.js'
import { EXPERIMENTS } from '../core/experiment.js'
import { request, GET_CONSENT_TIMEOUT_MS, SET_CONSENT_TIMEOUT_MS } from '../shared/request.js'
import { CONSENT, DECIDED_STATUSES, consentStatusFrom } from '../shared/consent-status.js'
import { renderOnboarding } from './view.js'

const LOG_PREFIX = '[체험단 필터]'
// 백그라운드가 깨어나지 못해 응답이 오지 않아도 화면은 그려야 한다. 변형도 같은 시간만 기다린다.
const GET_VARIANT_TIMEOUT_MS = GET_CONSENT_TIMEOUT_MS

const root = document.getElementById('root')

// status 는 실제 동의 상태, choosing 은 완료 상태에서 설정 바꾸기를 눌러 선택 화면으로 돌아온 상태다.
// revision 은 더 새로운 정보(저장 성공, 다른 곳의 변경 알림, 다시 읽은 상태)가 도착할 때마다 올린다.
// 응답을 기다리던 쪽은 그 사이에 revision 이 바뀌었으면 자기 응답을 버린다. loaded 는 첫 화면을 그렸는지다.
let state = {
  status: CONSENT.UNDECIDED,
  revision: 0,
  loaded: false,
  showExample: true,
  choosing: false,
  saving: false,
  saveFailed: false,
  viewedSent: false,
}

function setState(patch) {
  state = { ...state, ...patch }
}

function warn(message, error) {
  console.warn(`${LOG_PREFIX} ${message}`, error?.message ?? error)
}

function track(eventType) {
  request({ type: MESSAGES.TRACK, eventType, properties: {} }).catch((error) =>
    warn('온보딩 이벤트를 기록하지 못했습니다:', error),
  )
}

// 동의한 뒤에만 부른다. 이 페이지 로드에서 한 번만 보낸다.
function trackViewedOnce() {
  if (state.viewedSent) return
  setState({ viewedSent: true })
  track(EVENTS.ONBOARDING_VIEWED)
}

function draw() {
  renderOnboarding(root, {
    status: state.choosing ? 'undecided' : state.status,
    showExample: state.showExample,
    exampleUrl: SITE.exampleProductUrl,
    privacyUrl: privacyUrl(),
    saveFailed: state.saveFailed,
    saving: state.saving,
    onChoose: choose,
    onExample,
    onChange: () => {
      setState({ choosing: true, saveFailed: false })
      draw()
    },
  })
}

// 화면이 granted 일 때만 보낸다. 백그라운드 게이트가 막기도 하지만 이 페이지에서도 보내지 않는다.
// 설정 바꾸기로 선택 화면에 돌아온 동안은 화면이 undecided 이므로 보내지 않는다.
function onExample() {
  if (state.choosing || state.status !== 'granted') return
  track(EVENTS.ONBOARDING_EXAMPLE_CLICKED)
}

// 다른 곳(패널의 변경, 늦게 온 응답, 다시 읽은 상태)에서 알게 된 상태를 반영한다. 예시 링크 표시는 바꾸지 않는다.
// 상태가 달라졌을 때만 선택 화면(설정 바꾸기)에서 나온다. 첫 화면을 그리기 전에는 상태만 기록한다.
function adoptStatus(status, { keepError = false } = {}) {
  const changed = status !== state.status
  setState({
    status,
    revision: state.revision + 1,
    choosing: changed ? false : state.choosing,
    saveFailed: keepError ? state.saveFailed : false,
  })
  if (!state.loaded) return
  draw()
  if (state.status === CONSENT.GRANTED) trackViewedOnce()
}

async function choose(status) {
  if (state.saving) return
  setState({ saving: true })
  draw()

  let response = null
  try {
    response = await request(
      { type: MESSAGES.SET_CONSENT, status, source: 'onboarding' },
      { timeoutMs: SET_CONSENT_TIMEOUT_MS },
    )
  } catch (error) {
    warn('동의를 저장하지 못했습니다:', error)
  }

  const saved = !response?.error && DECIDED_STATUSES.includes(response?.consent?.status)
  if (!saved) {
    setState({ saving: false, saveFailed: true })
    draw()
    // 시간이 지나 실패로 다뤘어도 저장은 됐을 수 있다. 실제 상태를 다시 읽는다(오류 문구는 남긴다).
    refreshStatus({ keepError: true })
    return
  }

  setState({ saving: false, choosing: false })
  adoptStatus(response.consent.status)
}

// 다시 보일 때와 저장 실패 뒤에 실제 상태를 다시 읽는다. 읽지 못하면 화면을 그대로 둔다.
async function refreshStatus({ keepError = false } = {}) {
  const startedAt = state.revision
  try {
    const response = await request({ type: MESSAGES.GET_CONSENT }, { timeoutMs: GET_CONSENT_TIMEOUT_MS })
    const status = consentStatusFrom(response)
    if (status !== null && state.revision === startedAt) adoptStatus(status, { keepError })
  } catch (error) {
    warn('동의 상태를 다시 읽지 못했습니다:', error)
  }
}

// 늦게 도착한 응답은 그 사이에 더 새로운 정보가 없었을 때만 반영한다.
async function askStatus(startedAt) {
  const adoptLate = (response) => {
    const status = consentStatusFrom(response)
    if (status !== null && state.revision === startedAt) adoptStatus(status)
  }
  try {
    const response = await request(
      { type: MESSAGES.GET_CONSENT },
      { timeoutMs: GET_CONSENT_TIMEOUT_MS, onLate: adoptLate },
    )
    return consentStatusFrom(response) ?? CONSENT.UNDECIDED
  } catch (error) {
    warn('동의 상태를 읽지 못했습니다:', error)
    return CONSENT.UNDECIDED
  }
}

// 변형을 모르면(응답 없음, 실패, 배정 없음) 실험 노출을 만들지 않으려고 예시 링크를 숨긴다.
async function askShowExample() {
  try {
    const response = await request({ type: MESSAGES.GET_VARIANT }, { timeoutMs: GET_VARIANT_TIMEOUT_MS })
    return response?.variants?.[EXPERIMENTS.ONBOARDING_EXAMPLE.id] === 'show'
  } catch (error) {
    warn('실험 배정을 읽지 못했습니다:', error)
    return false
  }
}

// 두 요청에 각자 타임아웃과 폴백이 있고(동의는 undecided, 변형은 링크 숨김), 둘 다 끝난 뒤 한 번만 그린다.
// 먼저 기본 화면을 그리면 이미 고른 사용자에게 선택 화면이 깜빡이고 hide 변형에게 예시 링크가 잠깐 보인다.
// 늦게 도착한 동의 상태는 askStatus 가 다시 그리지만, 늦은 변형은 반영하지 않는다(실험 노출을 뒤늦게 바꾸지 않는다).
async function load() {
  const startedAt = state.revision
  const [status, showExample] = await Promise.all([askStatus(startedAt), askShowExample()])
  // 읽는 동안 더 새로운 정보가 왔다면 그 상태가 이긴다.
  setState({ showExample, loaded: true, ...(state.revision === startedAt ? { status } : {}) })
  draw()
  if (state.status === CONSENT.GRANTED) trackViewedOnce()
}

// 백그라운드가 보낸 동의 변경 알림. 탭에서 온 메시지는 받지 않는다.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== MESSAGES.CONSENT_CHANGED) return false
  const status = message.consent?.status
  if (!sender?.tab && DECIDED_STATUSES.includes(status)) adoptStatus(status)
  return false
})

// 알림을 놓쳤을 수 있으니(워커 재시작 직후 등) 다시 보일 때 실제 상태를 읽는다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStatus()
})

load()
