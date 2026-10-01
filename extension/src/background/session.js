// 앰플리튜드 세션. session_id 가 없으면 모든 이벤트가 세션 밖(-1)으로 집계되어
// 세션 단위 지표(필터 활성 세션 수, 필터 활성 세션 비율)를 계산할 수 없다.
// 앰플리튜드 관례대로 세션 id 는 세션 시작 시각(ms)이다.
//
// 상태는 storage.session 에 둔다. 서비스 워커가 유휴로 종료돼도 이어지고,
// 브라우저를 다시 열면 비워져 새 세션이 되는 것이 의도와 맞다.
export const SESSION_KEY = 'crf_session'
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000

async function nextSessionId(now) {
  const stored = await chrome.storage.session.get(SESSION_KEY)
  const current = stored[SESSION_KEY]
  const expired = !current || now - current.lastEventAt > SESSION_TIMEOUT_MS
  const id = expired ? now : current.id
  await chrome.storage.session.set({ [SESSION_KEY]: { id, lastEventAt: now } })
  return id
}

// 읽고 쓰는 사이에 다른 호출이 끼면 같은 시점 이벤트 둘이 서로 다른 세션을 만든다.
// 호출을 한 줄로 세워 앞 호출의 저장이 끝난 뒤 다음 호출이 읽게 한다. 앞 호출의 실패는 뒤 호출과 무관하다.
let queue = Promise.resolve()

export function getSessionId(now) {
  const result = queue.then(() => nextSessionId(now))
  queue = result.catch(() => {})
  return result
}
