import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { SITE, privacyUrl } from '../shared/site.js'
import { EXPERIMENTS } from '../core/experiment.js'
import { request, GET_CONSENT_TIMEOUT_MS, SET_CONSENT_TIMEOUT_MS } from '../shared/request.js'
import { renderOnboarding } from './view.js'

const LOG_PREFIX = '[체험단 필터]'
const DECIDED = ['granted', 'denied']
// 백그라운드가 깨어나지 못해 응답이 오지 않아도 화면은 그려야 한다. 변형도 같은 시간만 기다린다.
const GET_VARIANT_TIMEOUT_MS = GET_CONSENT_TIMEOUT_MS

const root = document.getElementById('root')

// status 는 실제 동의 상태, choosing 은 완료 상태에서 설정 바꾸기를 눌러 선택 화면으로 돌아온 상태다.
let state = {
  status: 'undecided',
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

async function choose(status) {
  if (state.saving) return
  setState({ saving: true })

  let response = null
  try {
    response = await request(
      { type: MESSAGES.SET_CONSENT, status, source: 'onboarding' },
      { timeoutMs: SET_CONSENT_TIMEOUT_MS },
    )
  } catch (error) {
    warn('동의를 저장하지 못했습니다:', error)
  }

  const saved = !response?.error && DECIDED.includes(response?.consent?.status)
  if (!saved) {
    setState({ saving: false, saveFailed: true })
    draw()
    return
  }

  setState({ saving: false, saveFailed: false, choosing: false, status: response.consent.status })
  draw()
  if (state.status === 'granted') trackViewedOnce()
}

async function askStatus() {
  try {
    const response = await request({ type: MESSAGES.GET_CONSENT }, { timeoutMs: GET_CONSENT_TIMEOUT_MS })
    const status = response?.consent?.status
    return DECIDED.includes(status) ? status : 'undecided'
  } catch (error) {
    warn('동의 상태를 읽지 못했습니다:', error)
    return 'undecided'
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
// 늦게 도착한 응답은 이 페이지 로드에서 다시 그리지 않는다.
async function load() {
  const [status, showExample] = await Promise.all([askStatus(), askShowExample()])
  setState({ status, showExample })
  draw()
  if (status === 'granted') trackViewedOnce()
}

load()
