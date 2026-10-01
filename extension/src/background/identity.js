const DEVICE_KEY = 'crf_device_id'
const USER_KEY = 'crf_user_id'
const INSTALLED_AT_KEY = 'crf_installed_at'

function generateId() {
  return crypto.randomUUID()
}

async function loadOrCreateDeviceId() {
  const stored = await chrome.storage.local.get(DEVICE_KEY)
  if (stored[DEVICE_KEY]) return stored[DEVICE_KEY]

  const created = generateId()
  await chrome.storage.local.set({ [DEVICE_KEY]: created })
  return created
}

// 확인 후 생성이라, 설치 직후 여러 곳이 동시에 부르면 서로 다른 UUID 가 생길 수 있다.
// 진행 중인 호출을 공유하고, 끝나면(성공이든 실패든) 비워 다음 호출이 저장소를 다시 읽게 한다.
let deviceIdInFlight = null

export function getDeviceId() {
  if (!deviceIdInFlight) {
    deviceIdInFlight = loadOrCreateDeviceId().finally(() => {
      deviceIdInFlight = null
    })
  }
  return deviceIdInFlight
}

export async function setDeviceId(id) {
  await chrome.storage.local.set({ [DEVICE_KEY]: id })
}

export async function getUserId() {
  const stored = await chrome.storage.local.get(USER_KEY)
  return stored[USER_KEY] ?? null
}

export async function setUserId(id) {
  await chrome.storage.local.set({ [USER_KEY]: id })
}

export async function getInstalledAt() {
  const stored = await chrome.storage.local.get(INSTALLED_AT_KEY)
  return stored[INSTALLED_AT_KEY] ?? null
}

export async function setInstalledAt(timestampMs) {
  await chrome.storage.local.set({ [INSTALLED_AT_KEY]: timestampMs })
}
