import { resolveVisitor, readCommand } from './visitor.js'
import { resolveSource } from './source.js'
import { deviceClass } from './device.js'
import { assignInstallCta } from './experiment.js'
import { storeUrl, handoffUrl } from './links.js'
import { EVENTS, createTracker } from './tracker.js'

const SHARE_TITLE = '체험단 리뷰 제거기 for 쿠팡'
const COPIED = '복사했습니다'
const COPY_FAILED = '복사하지 못했습니다. 주소창의 주소를 직접 복사해 주세요'
const OPTED_OUT_UNSAVED_NOTICE = '이번 방문은 기록하지 않습니다. 이 브라우저는 설정을 저장하지 못해, 다음에도 주소 끝에 #notrack 을 붙여 열어 주세요.'
const OPTED_IN_NOTICE = '이 브라우저의 방문을 다시 기록합니다.'
const optedOutNotice = (deviceId) => `이 브라우저의 방문은 더 기록하지 않습니다. 방문자 번호: ${deviceId}`
// 데모의 윗변이 화면 세로 가운데에 닿으면 본 것으로 센다. 비율 기준은 두 화면보다 긴 구간이 0.5 에 닿지 못해 쓰지 않는다.
const DEMO_OBSERVER_OPTIONS = { rootMargin: '0px 0px -50% 0px', threshold: 0 }

const noop = () => {}

// 화면 상태와 계측은 서로의 실패에 영향을 받지 않아야 한다. 단계마다 이 함수로 감싸 실패를 삼키고 다음 단계로 넘어간다.
function safely(action, onError = noop) {
  try {
    return action()
  } catch {
    return onError()
  }
}

// crypto.randomUUID 는 옛 사파리와 비보안 컨텍스트에 없다. 그때도 이벤트가 사라지지 않게 로컬에서 만든 값으로 대신한다.
function localId() {
  const hex = (count) => Array.from({ length: count }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16)
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`
}

function safeUuid(source) {
  return () => {
    try {
      const id = source()
      if (typeof id === 'string' && id !== '') return id
    } catch {
      // 생성기를 쓸 수 없으면 아래의 로컬 생성으로 넘어간다.
    }
    return localId()
  }
}

function show(element, visible) {
  if (element) element.hidden = !visible
}

// 제외를 저장하지 못했다면 다음 방문에는 기록된다. 영구 제외라고 약속하지 않고 방문자 번호도 보이지 않는다.
function noticeText(visitor) {
  if (visitor.command !== 'optout') return OPTED_IN_NOTICE
  return visitor.persisted === false ? OPTED_OUT_UNSAVED_NOTICE : optedOutNotice(visitor.deviceId)
}

// 읽은 명령을 따라 안내를 보이고 조각을 지운다. 둘은 서로 독립이다.
function applyCommand({ document, location, history }, visitor) {
  if (visitor.command === null) return
  safely(() => history.replaceState(null, '', `${location.pathname}${location.search}`))
  const notice = document.getElementById('optout-notice')
  if (!notice) return
  notice.textContent = noticeText(visitor)
  notice.hidden = false
}

// 설치 버튼과 넘기기를 어느 쪽에 보일지 정한다. storeLive 가 false 면 기본 상태(심사 중 문구)를 그대로 둔다.
function showScreen({ document, navigator }, { storeLive, device, variant, entrySource }) {
  if (!storeLive) return
  show(document.getElementById('store-pending'), false)
  const href = storeUrl({ entrySource, variant })
  for (const id of ['cta-hero', 'cta-sticky']) document.getElementById(id)?.setAttribute('href', href)
  if (device === 'desktop') {
    show(document.getElementById('cta-hero'), true)
    return
  }
  show(document.getElementById('handoff'), true)
  show(document.getElementById('handoff-share'), typeof navigator.share === 'function')
}

// hero_sticky 인 PC 에서만, 히어로 버튼이 화면 밖으로 나가면 바를 보인다. 관찰자가 없으면 바를 보이지 않는다.
function watchHero({ window, document }, { storeLive, device, variant }) {
  if (!storeLive || device !== 'desktop' || variant !== 'hero_sticky') return
  const hero = document.getElementById('cta-hero')
  if (typeof window.IntersectionObserver !== 'function' || !hero) return
  const sticky = document.getElementById('sticky')
  const observer = new window.IntersectionObserver((entries) => {
    const latest = entries[entries.length - 1]
    const away = !latest.isIntersecting
    show(sticky, away)
    document.body.classList.toggle('has-sticky', away)
  })
  observer.observe(hero)
}

function buildTracker({ navigator, config }, visitor, common, clock, uuid) {
  return createTracker({
    apiKey: config.apiKey,
    endpoint: config.endpoint || undefined,
    deviceId: visitor.deviceId,
    enabled: !visitor.optedOut && navigator.webdriver !== true,
    common,
    sessionId: clock(),
    now: clock,
    randomUUID: uuid,
  })
}

function viewProperties(source) {
  const properties = {}
  for (const key of ['referrer_domain', 'utm_source', 'utm_medium', 'utm_campaign']) {
    if (source[key] !== null && source[key] !== undefined) properties[key] = source[key]
  }
  return properties
}

// 처음 화면이 보이게 될 때 한 번만 보낸다. 백그라운드 탭에서 열린 방문은 보일 때까지 기다린다.
function sendViewOnce({ document }, track, source) {
  const send = () => track(EVENTS.LANDING_VIEWED, viewProperties(source))
  if (document.visibilityState === 'visible') {
    send()
    return
  }
  const onChange = () => {
    if (document.visibilityState !== 'visible') return
    document.removeEventListener('visibilitychange', onChange)
    send()
  }
  document.addEventListener('visibilitychange', onChange)
}

// 데모가 기준선에 닿으면 한 번 보내고 관찰을 끊는다.
function watchDemo({ window, document }, track) {
  const demo = document.getElementById('demo')
  if (typeof window.IntersectionObserver !== 'function' || !demo) return
  const observer = new window.IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      track(EVENTS.DEMO_VIEWED, {})
      observer.disconnect()
    },
    DEMO_OBSERVER_OPTIONS,
  )
  observer.observe(demo)
}

// 이동은 막지 않는다. 전송은 keepalive 라 페이지를 떠나도 나간다.
// 가운데 버튼은 click 이 아니라 auxclick 으로 오므로 button 1 만 같은 이벤트로 센다(오른쪽 버튼은 세지 않는다).
function wireInstallButtons({ document }, track) {
  for (const [id, location] of [['cta-hero', 'hero'], ['cta-sticky', 'sticky']]) {
    const send = () => track(EVENTS.INSTALL_CTA_CLICKED, { cta_location: location })
    const link = document.getElementById(id)
    link?.addEventListener('click', send)
    link?.addEventListener('auxclick', (event) => {
      if (event.button === 1) send()
    })
  }
}

// 넘기기 주소에 싣는 원래 유입원. handoff 로 들어온 방문자가 다시 넘기면 처음 유입원(utm_campaign)을 이어 간다.
// 처리방침에서 돌아온 방문(internal)은 유입원이 아니므로 싣지 않는다.
function handoffOrigin(source) {
  if (source.utm_source === 'handoff') return source.utm_campaign
  return source.entry_source === 'internal' ? undefined : source.entry_source
}

function setStatus(document, text) {
  const status = document.getElementById('handoff-status')
  if (status) status.textContent = text
}

async function copyLink({ document, navigator }, entrySource) {
  try {
    await navigator.clipboard.writeText(handoffUrl({ channel: 'copy', entrySource }))
    setStatus(document, COPIED)
  } catch {
    setStatus(document, COPY_FAILED)
  }
}

async function shareLink({ navigator }, entrySource) {
  try {
    await navigator.share({ title: SHARE_TITLE, url: handoffUrl({ channel: 'share', entrySource }) })
  } catch {
    // 사용자가 공유 창을 닫으면 거부된다. 오류가 아니므로 아무것도 보이지 않는다.
  }
}

// 이벤트는 버튼을 누른 시점에 보낸다. 성공 여부와 상관없이 넘기려는 의향을 잰다.
function wireHandoff(page, track, entrySource) {
  const { document } = page
  document.getElementById('handoff-copy')?.addEventListener('click', () => {
    track(EVENTS.HANDOFF_REQUESTED, { channel: 'copy' })
    void copyLink(page, entrySource)
  })
  document.getElementById('handoff-share')?.addEventListener('click', () => {
    track(EVENTS.HANDOFF_REQUESTED, { channel: 'share' })
    void shareLink(page, entrySource)
  })
}

const NO_SOURCE = { utm_source: null, utm_medium: null, utm_campaign: null, referrer_domain: null, entry_source: 'direct' }

// 순서: 방문자, 유입원, 화면 종류, 실험 배정, 화면 상태, 계측. 어느 단계가 던져도 그 뒤 단계가 실행된다.
export function initLanding({ window, document, navigator, config = {}, now = Date.now, random = Math.random, randomUUID }) {
  const { location, history } = window
  const page = { window, document, navigator, location, history, config }
  const clock = typeof now === 'function' ? now : () => now
  const uuid = safeUuid(randomUUID ?? (() => window.crypto.randomUUID()))

  const storage = safely(() => window.localStorage, () => null)
  // 방문자를 확인하지 못했다면 기록하지 않는 쪽으로 닫는다.
  const visitor = safely(
    () => resolveVisitor({ storage, hash: location.hash, randomUUID: uuid }),
    () => ({ deviceId: uuid(), optedOut: true, persisted: false, command: safely(() => readCommand(location.hash), () => null) }),
  )
  safely(() => applyCommand(page, visitor))

  const source = safely(
    () => resolveSource({ search: location.search, referrer: document.referrer, ownHost: location.hostname }),
    () => NO_SOURCE,
  )
  const device = safely(
    () => deviceClass({ userAgent: navigator.userAgent, uaDataMobile: navigator.userAgentData?.mobile, maxTouchPoints: navigator.maxTouchPoints }),
    () => 'desktop',
  )
  const variant = safely(() => assignInstallCta({ deviceClass: device, storage, random }), () => 'none')
  const screen = { storeLive: Boolean(config.storeLive), device, variant, entrySource: source.entry_source }
  safely(() => showScreen(page, screen))
  safely(() => watchHero(page, screen))

  const common = { device_class: device, entry_source: source.entry_source, exp_install_cta: variant, store_live: screen.storeLive }
  const track = safely(() => buildTracker(page, visitor, common, clock, uuid), () => noop)
  safely(() => sendViewOnce(page, track, source))
  safely(() => watchDemo(page, track))
  safely(() => wireInstallButtons(page, track))
  safely(() => wireHandoff(page, track, handoffOrigin(source)))
}
