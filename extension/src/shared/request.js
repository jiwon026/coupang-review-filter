// 확장 페이지(패널, 온보딩)가 백그라운드에 묻는 공용 헬퍼. 네트워크 요청은 하지 않는다.
// 읽기는 짧게 기다리고(그리고 기본 상태로 그린다), 쓰기는 조금 더 기다린 뒤 실패로 다룬다.
export const GET_CONSENT_TIMEOUT_MS = 2000
export const SET_CONSENT_TIMEOUT_MS = 5000

// timeoutMs 를 주면 그 안에 응답이 없을 때 거절한다. 주지 않으면 응답이 올 때까지 기다린다.
export function request(message, { timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    let timer
    const finish = (settle, value) => {
      clearTimeout(timer)
      settle(value)
    }

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => reject(new Error('응답 시간이 지났습니다')), timeoutMs)
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError
        if (error) finish(reject, new Error(error.message))
        else finish(resolve, response)
      })
    } catch (error) {
      finish(reject, error)
    }
  })
}
