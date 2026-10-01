const DEVICE_KEY = 'crf_device_id'
const USER_KEY = 'crf_user_id'
const INSTALLED_AT_KEY = 'crf_installed_at'

function generateId() {
  return crypto.randomUUID()
}

export async function getDeviceId() {
  const stored = await chrome.storage.local.get(DEVICE_KEY)
  if (stored[DEVICE_KEY]) return stored[DEVICE_KEY]

  const created = generateId()
  await chrome.storage.local.set({ [DEVICE_KEY]: created })
  return created
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
