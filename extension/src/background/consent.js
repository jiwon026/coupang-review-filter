import { CONSENT } from '../shared/consent-status.js'

export { CONSENT }

export const CONSENT_KEY = 'crf_consent'

// 동의를 받을 때 알린 범위다. 1 은 쿠팡만 알리던 1.0.x, 2 는 쿠팡과 무신사를 알리는 1.1.0 부터다.
// 1.0.x 는 이 값을 저장하지 않았으므로 값이 없으면 1 로 본다. 알리는 범위가 넓어지면 올린다(명세 13.6).
export const CONSENT_SCOPE = 2

const UNDECIDED_STATE = { status: CONSENT.UNDECIDED, decidedAt: null }

async function readStored() {
  const stored = await chrome.storage.local.get(CONSENT_KEY)
  const value = stored[CONSENT_KEY]
  return value && typeof value === 'object' ? value : null
}

// 지금보다 좁은 범위를 알리고 받은 동의인지. 업데이트 때 안내 화면을 여는 기준이라 동의한 상태만 본다.
function isOutdatedGrant(value) {
  return value?.status === CONSENT.GRANTED && value.scope !== CONSENT_SCOPE
}

// 저장값이 없거나 알 수 없는 상태면 아직 고르지 않은 것으로 본다.
// everGranted 는 한 번이라도 동의한 적이 있는지다. 지금 꺼져 있어도 이미 보낸 통계가 있을 수 있다.
// 옛 범위의 결정은 동의든 거절이든 저장값을 고치지 않고 읽을 때마다 아직 고르지 않은 것으로 돌려준다.
// 업데이트 처리가 늦거나 빠지거나 저장이 실패해도 넓어진 범위의 통계가 나가지 않는다(실패 시 닫힘).
// 옛 범위에서 거절한 사람이 본 고지는 쿠팡만 적힌 화면이다. 패널에서 켜려면 안내 화면을 거치게 한다.
export async function getConsent() {
  const value = await readStored()
  const everGranted = value?.everGranted === true || isOutdatedGrant(value)
  const decided = value?.status === CONSENT.GRANTED || value?.status === CONSENT.DENIED
  if (!decided || value.scope !== CONSENT_SCOPE) return { ...UNDECIDED_STATE, everGranted }
  return { status: value.status, decidedAt: value.decidedAt ?? null, everGranted }
}

// 다시 물어야 하는 기기인지. 저장된 동의가 옛 범위의 granted 일 때만 true 다. 읽지 못하면 false 다.
export async function needsReconsent() {
  try {
    return isOutdatedGrant(await readStored())
  } catch {
    return false
  }
}

// 읽고 쓰는 사이에 다른 호출이 끼면 firstGrant 가 두 번 true 가 될 수 있다. 쓰기를 한 줄로 세운다.
let writeQueue = Promise.resolve()

async function applyConsent(status, now) {
  const previous = await readStored()
  // 옛 범위의 동의도 동의한 적이 있는 것이다. 다시 동의해도 firstGrant 는 false 다.
  const grantedBefore = previous?.everGranted === true || previous?.status === CONSENT.GRANTED
  const firstGrant = status === CONSENT.GRANTED && !grantedBefore
  const everGranted = grantedBefore || status === CONSENT.GRANTED

  await chrome.storage.local.set({
    [CONSENT_KEY]: { status, decidedAt: now, everGranted, scope: CONSENT_SCOPE },
  })
  return { status, decidedAt: now, firstGrant, everGranted }
}

export function setConsent(status, now = Date.now()) {
  if (status !== CONSENT.GRANTED && status !== CONSENT.DENIED) {
    return Promise.reject(new Error(`동의 상태가 올바르지 않습니다: ${String(status)}`))
  }
  const result = writeQueue.then(() => applyConsent(status, now))
  // 앞선 호출의 실패가 뒤따르는 호출을 막지 않게 한다.
  writeQueue = result.catch(() => {})
  return result
}

// 저장소를 읽지 못하면 보내지 않는다(실패 시 닫힘).
export async function isCollectionAllowed() {
  try {
    return (await getConsent()).status === CONSENT.GRANTED
  } catch {
    return false
  }
}
