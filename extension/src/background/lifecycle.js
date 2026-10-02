import { SITE, isLandingConfigured } from '../shared/site.js'
import { getDeviceId, getInstalledAt, setInstalledAt } from './identity.js'
import { isCollectionAllowed } from './consent.js'

const LOG_PREFIX = '[체험단 필터]'

function warn(message, error) {
  console.warn(`${LOG_PREFIX} ${message}`, error?.message ?? error)
}

// d(기기 번호)와 i(설치 시각)는 null 이면 싣지 않는다. 동의하지 않은 사용자의 제거 페이지는 열리되 누구인지 알 수 없다.
export function buildUninstallUrl({ origin, version, deviceId = null, installedAt = null }) {
  const url = new URL(SITE.uninstallPath, origin)
  if (deviceId != null) url.searchParams.set('d', deviceId)
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
  if (!isLandingConfigured(SITE.landingOrigin)) return

  try {
    // 동의한 경우에만 기기 번호와 설치 시각을 싣는다. 동의 상태를 읽지 못하면 싣지 않는다(실패 시 닫힘).
    // 미동의 상태에서는 기기 번호를 읽지도(없으면 새로 만들지도) 않는다.
    const granted = await isCollectionAllowed()
    const url = buildUninstallUrl({
      origin: SITE.landingOrigin,
      version: chrome.runtime.getManifest().version,
      deviceId: granted ? await getDeviceId() : null,
      installedAt: granted ? await getInstalledAt() : null,
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
  // 설치 순간에는 동의가 없으므로 이벤트를 보내지 않는다. Extension Installed 는 처음 동의할 때 보낸다.
  await configureUninstallUrl()
}
