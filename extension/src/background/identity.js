const DEVICE_KEY = 'crf_device_id'
const USER_KEY = 'crf_user_id'

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
