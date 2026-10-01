import { CONFIG } from '../shared/config.local.js'
import { EVENTS } from '../shared/events.js'
import { track } from './analytics.js'
import { getDeviceId, getInstalledAt, setInstalledAt } from './identity.js'

const LOG_PREFIX = '[체험단 필터]'
const PLACEHOLDER_HOST = 'example.com'
const UNINSTALL_PATH = '/uninstalled'

function warn(message, error) {
  console.warn(`${LOG_PREFIX} ${message}`, error?.message ?? error)
}

// config.example.js 의 자리표시자나 빈 값이 그대로 남아 있으면 랜딩이 없는 것으로 본다.
// 그대로 설정하면 사용자가 확장을 지울 때 엉뚱한 페이지가 열린다.
export function isLandingConfigured(origin) {
  if (!origin) return false

  let host
  try {
    host = new URL(origin).hostname
  } catch {
    return false
  }

  return host !== PLACEHOLDER_HOST && !host.endsWith(`.${PLACEHOLDER_HOST}`)
}

export function buildUninstallUrl({ origin, deviceId, version, installedAt }) {
  const url = new URL(UNINSTALL_PATH, origin)
  url.searchParams.set('d', deviceId)
  url.searchParams.set('v', version)
  if (installedAt != null) url.searchParams.set('i', String(installedAt))
  return url.toString()
}

// 첫 설치 때는 워커 시작의 설정과 onInstalled 안의 설정이 겹친다. 먼저 시작한 쪽이 설치 시각을 비어 있는 상태로
// 읽고 늦게 끝나면 i 없는 주소가 최종값이 된다. 모든 설정 요청을 한 줄로 세워 나중 요청이 나중에 적용되게 한다.
let uninstallUrlQueue = Promise.resolve()

export function configureUninstallUrl() {
  uninstallUrlQueue = uninstallUrlQueue.then(applyUninstallUrl)
  return uninstallUrlQueue
}

async function applyUninstallUrl() {
  if (!isLandingConfigured(CONFIG.landingOrigin)) return

  try {
    const url = buildUninstallUrl({
      origin: CONFIG.landingOrigin,
      deviceId: await getDeviceId(),
      version: chrome.runtime.getManifest().version,
      installedAt: await getInstalledAt(),
    })
    await chrome.runtime.setUninstallURL(url)
  } catch (error) {
    warn('제거 주소를 설정하지 못했습니다:', error)
  }
}

export async function handleInstalled(details) {
  if (details?.reason !== 'install') return

  try {
    await setInstalledAt(Date.now())
  } catch (error) {
    warn('설치 시각을 저장하지 못했습니다:', error)
  }

  // configureUninstallUrl 은 실패를 스스로 삼킨다. 설치 시각이 주소에 실리도록 저장 뒤에 부른다.
  await configureUninstallUrl()

  try {
    await track(EVENTS.EXTENSION_INSTALLED, {})
  } catch (error) {
    warn('설치 이벤트를 보내지 못했습니다:', error)
  }
}
