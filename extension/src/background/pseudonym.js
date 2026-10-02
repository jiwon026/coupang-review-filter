export const SALT_KEY = 'crf_salt'

const SALT_BYTES = 32
const HASH_BYTES = 8

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function generateSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)))
}

async function loadOrCreateSalt() {
  const stored = await chrome.storage.local.get(SALT_KEY)
  if (stored[SALT_KEY]) return stored[SALT_KEY]

  const created = generateSalt()
  await chrome.storage.local.set({ [SALT_KEY]: created })
  return created
}

// 확인 후 생성이라 동시에 부르면 솔트가 둘 생길 수 있다. identity.js 의 getDeviceId 처럼
// 진행 중인 호출을 공유하고, 끝나면(성공이든 실패든) 비워 다음 호출이 저장소를 다시 읽게 한다.
let saltInFlight = null

function getSalt() {
  if (!saltInFlight) {
    saltInFlight = loadOrCreateSalt().finally(() => {
      saltInFlight = null
    })
  }
  return saltInFlight
}

// 설치마다 다른 솔트와 함께 SHA-256 으로 바꾼 값의 앞 16자리(hex). 솔트는 기기를 떠나지 않는다.
export async function pseudonymize(value) {
  if (value === null || value === undefined) return null

  const salt = await getSalt()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${value}`))
  return toHex(new Uint8Array(digest).slice(0, HASH_BYTES))
}
