import { MESSAGES } from '../shared/messages.js'
import { EVENTS } from '../shared/events.js'
import { SITE, privacyUrl } from '../shared/site.js'
import { EXPERIMENTS } from '../core/experiment.js'
import { renderOnboarding } from './view.js'

const LOG_PREFIX = '[체험단 필터]'
const DECIDED = ['granted', 'denied']
// 백그라운드가 깨어나지 못해 응답이 오지 않아도 화면은 그려야 한다.
const LOAD_TIMEOUT_MS = 2000

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

function request(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError
        if (error) reject(new Error(error.message))
        else resolve(response)
      })
    } catch (error) {
      reject(error)
    }
  })
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
    onExample: () => track(EVENTS.ONBOARDING_EXAMPLE_CLICKED),
    onChange: () => {
      setState({ choosing: true, saveFailed: false })
      draw()
    },
  })
}

async function choose(status) {
  if (state.saving) return
  setState({ saving: true })

  let response = null
  try {
    response = await request({ type: MESSAGES.SET_CONSENT, status, source: 'onboarding' })
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
    const response = await request({ type: MESSAGES.GET_CONSENT })
    const status = response?.consent?.status
    return DECIDED.includes(status) ? status : 'undecided'
  } catch (error) {
    warn('동의 상태를 읽지 못했습니다:', error)
    return 'undecided'
  }
}

async function askShowExample() {
  try {
    const response = await request({ type: MESSAGES.GET_VARIANT })
    return response?.variants?.[EXPERIMENTS.ONBOARDING_EXAMPLE.id] !== 'hide'
  } catch (error) {
    warn('실험 배정을 읽지 못했습니다:', error)
    return true
  }
}

function withTimeout(promise, fallback) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), LOAD_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// 두 응답을 함께 기다려 한 번에 그린다. 먼저 기본 화면을 그리면 이미 고른 사용자에게 선택 화면이 깜빡이고,
// hide 변형에게 예시 링크가 잠깐 보인다. 응답이 늦거나 없으면 기본 상태로 그린다.
async function load() {
  const [status, showExample] = await withTimeout(Promise.all([askStatus(), askShowExample()]), ['undecided', true])
  setState({ status, showExample })
  draw()
  if (status === 'granted') trackViewedOnce()
}

load()
