import { SITE, isLandingConfigured } from '../shared/site.js'
import { ONBOARDING_PATH } from '../shared/pages.js'
import { getDeviceId, getInstalledAt, setInstalledAt } from './identity.js'
import { isCollectionAllowed, resetGrantedConsent } from './consent.js'

const LOG_PREFIX = '[체험단 필터]'

function warn(message, error) {
  console.warn(`${LOG_PREFIX} ${message}`, error?.message ?? error)
}

// d(기기 번호)와 i(설치 시각)는 쿼리가 아니라 조각(#)에 싣는다. 조각은 서버로 전송되지 않으므로
// 호스팅 서버의 접속 기록에 기기 번호가 남지 않는다. v(버전)는 식별자가 아니므로 쿼리에 둔다.
// d 와 i 는 null 이면 싣지 않는다. 동의하지 않은 사용자의 제거 페이지는 열리되 조각이 없어 누구인지 알 수 없다.
export function buildUninstallUrl({ origin, version, deviceId = null, installedAt = null }) {
  const url = new URL(SITE.uninstallPath, origin)
  url.searchParams.set('v', version)

  const fragment = new URLSearchParams()
  if (deviceId != null) fragment.set('d', deviceId)
  if (installedAt != null) fragment.set('i', String(installedAt))
  const hash = fragment.toString()
  if (hash) url.hash = hash

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
    // 이 경로(제거 주소)에서는 미동의 상태일 때 기기 번호를 읽지도(없으면 새로 만들지도) 않는다.
    // 실험 배정은 동의 전에도 기기 번호를 만들지만, 그 번호는 동의하기 전에는 기기 안에만 남는다.
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

// 설치 직후와 동의를 다시 받을 때 온보딩 탭을 연다. tabs.create 는 tabs 권한이 필요 없다. 실패해도 설치 처리는 이어간다.
async function openOnboarding() {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_PATH) })
  } catch (error) {
    warn('온보딩 페이지를 열지 못했습니다:', error)
  }
}

// 이 버전부터 무신사에서도 동작한다. 그 전 버전에서 받은 동의는 쿠팡 상품 페이지만 알리고 받은 것이다(명세 13.6).
const RECONSENT_VERSION = '1.1.0'

const VERSION_SHAPE = /^\d+(\.\d+)*$/

function versionParts(value) {
  return typeof value === 'string' && VERSION_SHAPE.test(value) ? value.split('.').map(Number) : null
}

// version 이 target 보다 앞선 버전인지. 없는 자리는 0 으로 본다('1.0' 은 '1.0.0' 과 같다).
// 숫자와 점으로만 된 문자열이 아니면 false 다. 모르면 동의를 되돌리지 않는다.
export function isVersionBefore(version, target) {
  const parts = versionParts(version)
  const targetParts = versionParts(target)
  if (parts === null || targetParts === null) return false

  const length = Math.max(parts.length, targetParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (parts[index] ?? 0) - (targetParts[index] ?? 0)
    if (difference !== 0) return difference < 0
  }
  return false
}

// 1.1.0 전 버전에서 올라온 기기가 동의한 상태였으면 아직 고르지 않은 상태로 되돌리고 온보딩 탭을 한 번 연다.
// 거절했거나 고르지 않은 기기는 그대로 두고 탭도 열지 않는다. 기기 번호, 설치 시각, 실험 배정은 건드리지 않는다.
async function reaskConsentAfterUpdate(previousVersion) {
  if (!isVersionBefore(previousVersion, RECONSENT_VERSION)) return

  let reset = false
  try {
    reset = await resetGrantedConsent()
  } catch (error) {
    warn('동의를 되돌리지 못했습니다:', error)
  }
  if (!reset) return

  // 되돌린 뒤에 부르면 제거 주소에서 기기 번호와 설치 시각이 빠진다. 주소를 고친 뒤에 탭을 연다.
  await configureUninstallUrl()

  await openOnboarding()
}

export async function handleInstalled(details) {
  if (details?.reason === 'update') {
    await reaskConsentAfterUpdate(details.previousVersion)
    return
  }
  if (details?.reason !== 'install') return

  try {
    await setInstalledAt(Date.now())
  } catch (error) {
    warn('설치 시각을 저장하지 못했습니다:', error)
  }

  // configureUninstallUrl 은 실패를 스스로 삼킨다. 설치 시각이 주소에 실리도록 저장 뒤에 부른다.
  // 설치 순간에는 동의가 없으므로 이벤트를 보내지 않는다. Extension Installed 는 처음 동의할 때 보낸다.
  await configureUninstallUrl()

  await openOnboarding()
}
