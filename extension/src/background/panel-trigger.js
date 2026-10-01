// 패널을 어떤 경로로 열었는지(배너의 자세히 보기 또는 툴바) 패널이 알 수 있게 한다.
// 툴바로 연 패널은 배너 문구와 무관하므로 banner_copy 실험의 패널 열기율에서 구분해야 한다.
// 백그라운드가 OPEN_PANEL 을 받으면 창별 표시를 남기고, 패널은 로드할 때 한 번 소비한다.
// 워커가 유휴로 종료돼도 이어지도록 storage.session 에 둔다.
export const PANEL_TRIGGER_KEY_PREFIX = 'crf_panel_trigger_'
// 이보다 오래된 표시는 이번 패널 열기와 무관한 것으로 본다.
export const PANEL_TRIGGER_TTL_MS = 5000

function keyFor(windowId) {
  return `${PANEL_TRIGGER_KEY_PREFIX}${windowId}`
}

// 표시 저장이 끝나기 전에 패널이 물어도 표시를 보게 한다.
let pendingMark = Promise.resolve()

export function markPanelTrigger(windowId, now = Date.now()) {
  pendingMark = chrome.storage.session.set({ [keyFor(windowId)]: { windowId, at: now } })
  return pendingMark
}

export async function consumePanelTrigger(windowId, now = Date.now()) {
  await pendingMark.catch(() => {})
  const key = keyFor(windowId)
  const stored = await chrome.storage.session.get(key)
  const mark = stored[key]
  if (!mark) return 'toolbar'

  // 한 번 쓴 표시는 지운다. 남겨 두면 같은 창에서 뒤에 툴바로 연 패널이 banner 로 기록된다.
  await chrome.storage.session.remove(key)
  return now - mark.at <= PANEL_TRIGGER_TTL_MS ? 'banner' : 'toolbar'
}
