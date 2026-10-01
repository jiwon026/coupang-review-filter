// MV3 서비스 워커는 유휴 시 종료되므로 탭별 요약은 모듈 변수가 아니라
// storage.session 에 둔다. 저장소가 단일 진실 원천이다.
const SUMMARY_KEY_PREFIX = 'crf_summary_'

function keyFor(tabId) {
  return `${SUMMARY_KEY_PREFIX}${tabId}`
}

export async function saveSummary(tabId, summary) {
  await chrome.storage.session.set({ [keyFor(tabId)]: summary })
}

export async function loadSummary(tabId) {
  const key = keyFor(tabId)
  const stored = await chrome.storage.session.get(key)
  return stored[key] ?? null
}

export async function removeSummary(tabId) {
  await chrome.storage.session.remove(keyFor(tabId))
}
