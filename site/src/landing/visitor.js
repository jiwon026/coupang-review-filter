export const DEVICE_KEY = 'crf_site_device_id'
export const OPTOUT_KEY = 'crf_site_optout'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OPTED_OUT = '1'

// 주소 조각이 정확히 일치할 때만 명령으로 본다. includes 로 찾으면 #notrack2 같은 값이 섞여 들어온다.
export function readCommand(hash) {
  if (hash === '#notrack') return 'optout'
  if (hash === '#track') return 'optin'
  return null
}

// 저장소는 어느 호출이든 던질 수 있다(사파리 사생활 보호 모드, 저장소 차단). 실패는 ok: false 로 돌려준다.
function attempt(action) {
  try {
    return { ok: true, value: action() }
  } catch {
    return { ok: false, value: null }
  }
}

// 로컬 생성기. crypto.randomUUID 가 없는 환경(옛 사파리, 비보안 컨텍스트)을 위한 대체이고 버전 4 형식을 맞춘다.
// 통계용 익명 번호라서 암호학적 강도는 필요 없다.
function fallbackUUID() {
  const hex = (count) => Array.from({ length: count }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16)
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`
}

// 방문자 번호와 이벤트 insert_id 가 함께 쓰는 생성기. 주입한 생성기는 던지거나 엉뚱한 값을 줄 수 있다.
// 형식이 틀린 값은 저장해 봐야 다음 로드에서 버려져 번호가 매번 바뀌므로, 검증을 통과하지 못하면 대체 생성으로 넘어간다.
export function generateUUID(randomUUID) {
  try {
    const id = randomUUID()
    if (typeof id === 'string' && UUID.test(id)) return id
  } catch {
    // 생성기를 쓸 수 없으면 아래의 대체 생성으로 넘어간다.
  }
  return fallbackUUID()
}

// 방문자 번호는 저장소의 값도 신뢰 경계 밖의 입력으로 본다. UUID 형식이 아니면 새로 만들어 덮어쓴다.
function loadDeviceId(storage, randomUUID) {
  const read = attempt(() => storage.getItem(DEVICE_KEY))
  if (read.ok && typeof read.value === 'string' && UUID.test(read.value)) {
    return { deviceId: read.value, persisted: true }
  }
  const deviceId = generateUUID(randomUUID)
  // 읽기가 실패한 저장소는 쓰기도 기대하지 않는다. 이 페이지 로드에서만 쓰는 번호가 된다.
  if (!read.ok) return { deviceId, persisted: false }
  return { deviceId, persisted: attempt(() => storage.setItem(DEVICE_KEY, deviceId)).ok }
}

// 명령이 있으면 저장하고 명령대로 돌려준다. 저장에 실패해도 그 페이지 로드에서는 명령을 따른다.
function loadOptOut(storage, command) {
  if (command === 'optout') {
    return { optedOut: true, persisted: attempt(() => storage.setItem(OPTOUT_KEY, OPTED_OUT)).ok }
  }
  if (command === 'optin') {
    return { optedOut: false, persisted: attempt(() => storage.removeItem(OPTOUT_KEY)).ok }
  }
  const read = attempt(() => storage.getItem(OPTOUT_KEY))
  return { optedOut: read.ok && read.value === OPTED_OUT, persisted: read.ok }
}

// 계측 제외여도 방문자 번호는 만든다. 제외를 알리는 화면에 번호를 보여 줘야 삭제 요청을 받을 수 있다.
// persisted 는 번호와 제외 상태가 모두 저장소에 남았는지를 뜻한다(제외 안내 문구가 이 값에 기댄다).
// idPersisted 는 번호만 따진다. 저장하지 못하는 브라우저는 로드마다 새 번호를 받아 방문자 수가 부풀기 때문에, 통계에서 걸러 낼 수 있게 따로 알린다.
export function resolveVisitor({ storage, hash, randomUUID }) {
  const command = readCommand(hash)
  const device = loadDeviceId(storage, randomUUID)
  const optOut = loadOptOut(storage, command)
  return {
    deviceId: device.deviceId,
    optedOut: optOut.optedOut,
    persisted: device.persisted && optOut.persisted,
    idPersisted: device.persisted,
    command,
  }
}
