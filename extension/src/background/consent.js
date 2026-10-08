import { CONSENT } from '../shared/consent-status.js'

export { CONSENT }

export const CONSENT_KEY = 'crf_consent'

const UNDECIDED_STATE = { status: CONSENT.UNDECIDED, decidedAt: null }

async function readStored() {
  const stored = await chrome.storage.local.get(CONSENT_KEY)
  const value = stored[CONSENT_KEY]
  return value && typeof value === 'object' ? value : null
}

// 저장값이 없거나 알 수 없는 상태면 아직 고르지 않은 것으로 본다.
// everGranted 는 한 번이라도 동의한 적이 있는지다. 지금 꺼져 있어도 이미 보낸 통계가 있을 수 있다.
export async function getConsent() {
  const value = await readStored()
  const everGranted = value?.everGranted === true
  if (value?.status !== CONSENT.GRANTED && value?.status !== CONSENT.DENIED) return { ...UNDECIDED_STATE, everGranted }
  return { status: value.status, decidedAt: value.decidedAt ?? null, everGranted }
}

// 읽고 쓰는 사이에 다른 호출이 끼면 firstGrant 가 두 번 true 가 될 수 있다. 쓰기를 한 줄로 세운다.
let writeQueue = Promise.resolve()

async function applyConsent(status, now) {
  const previous = await readStored()
  const grantedBefore = previous?.everGranted === true
  const firstGrant = status === CONSENT.GRANTED && !grantedBefore
  const everGranted = grantedBefore || status === CONSENT.GRANTED

  await chrome.storage.local.set({
    [CONSENT_KEY]: { status, decidedAt: now, everGranted },
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

async function applyReset() {
  const previous = await readStored()
  if (previous?.status !== CONSENT.GRANTED) return false

  await chrome.storage.local.set({
    [CONSENT_KEY]: { ...UNDECIDED_STATE, everGranted: true },
  })
  return true
}

// 알린 내용이 달라져 동의를 다시 받아야 할 때 쓴다(명세 13.6). 동의한 상태만 아직 고르지 않은 상태로 되돌리고 true 를 돌려준다.
// 거절했거나 고르지 않은 기기는 건드리지 않고 false 를 돌려준다. 동의한 적이 있다는 기록은 남겨서
// 다시 동의해도 firstGrant 가 false 다. setConsent 와 같은 줄에 서서 진행 중인 저장이 끝난 뒤의 값을 본다.
export function resetGrantedConsent() {
  const result = writeQueue.then(applyReset)
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
