export const CONSENT = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDECIDED: 'undecided',
}

export const CONSENT_KEY = 'crf_consent'

const UNDECIDED_STATE = { status: CONSENT.UNDECIDED, decidedAt: null }

async function readStored() {
  const stored = await chrome.storage.local.get(CONSENT_KEY)
  const value = stored[CONSENT_KEY]
  return value && typeof value === 'object' ? value : null
}

// 저장값이 없거나 알 수 없는 상태면 아직 고르지 않은 것으로 본다.
export async function getConsent() {
  const value = await readStored()
  if (value?.status !== CONSENT.GRANTED && value?.status !== CONSENT.DENIED) return { ...UNDECIDED_STATE }
  return { status: value.status, decidedAt: value.decidedAt ?? null }
}

// 읽고 쓰는 사이에 다른 호출이 끼면 firstGrant 가 두 번 true 가 될 수 있다. 쓰기를 한 줄로 세운다.
let writeQueue = Promise.resolve()

async function applyConsent(status, now) {
  const previous = await readStored()
  const everGranted = previous?.everGranted === true
  const firstGrant = status === CONSENT.GRANTED && !everGranted

  await chrome.storage.local.set({
    [CONSENT_KEY]: { status, decidedAt: now, everGranted: everGranted || status === CONSENT.GRANTED },
  })
  return { status, decidedAt: now, firstGrant }
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
