const CONSENT_STORAGE_KEY = 'crf_consent'
export const EXTENSION_ORIGIN = 'chrome-extension://test-extension-id/'

// 이벤트 전송을 기대하는 테스트의 준비 단계에서 쓴다. 저장소에 동의 상태를 granted 로 미리 둔다.
export function grantConsent(store, decidedAt = 1_700_000_000_000) {
  store[CONSENT_STORAGE_KEY] = { status: 'granted', decidedAt, everGranted: true }
  return store
}

export function installChromeMock(initial = {}) {
  const store = { ...initial }
  const sessionStore = {}
  const listeners = []
  const removedListeners = []
  const installedListeners = []
  const calls = { sidePanelOpen: [], setPanelBehavior: [], setUninstallURL: [], setAccessLevel: [], tabsCreate: [] }

  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys]
          const result = {}
          for (const key of list) {
            if (key in store) result[key] = store[key]
          }
          return result
        },
        async set(items) {
          Object.assign(store, items)
        },
        setAccessLevel(options) {
          calls.setAccessLevel.push(options)
          return Promise.resolve()
        },
      },
      session: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys]
          const result = {}
          for (const key of list) {
            if (key in sessionStore) result[key] = sessionStore[key]
          }
          return result
        },
        async set(items) {
          Object.assign(sessionStore, items)
        },
        async remove(keys) {
          const list = Array.isArray(keys) ? keys : [keys]
          for (const key of list) delete sessionStore[key]
        },
      },
    },
    runtime: {
      setUninstallURL: (url) => {
        calls.setUninstallURL.push(url)
        return Promise.resolve()
      },
      id: 'test-extension-id',
      getURL: (path = '') => `${EXTENSION_ORIGIN}${path}`,
      getManifest: () => ({ version: '0.1.0' }),
      onMessage: { addListener: (fn) => listeners.push(fn) },
      onInstalled: { addListener: (fn) => installedListeners.push(fn) },
    },
    tabs: {
      create: (options) => {
        calls.tabsCreate.push(options)
        return Promise.resolve({ id: calls.tabsCreate.length })
      },
      onRemoved: { addListener: (fn) => removedListeners.push(fn) },
    },
    sidePanel: {
      open: (options) => {
        calls.sidePanelOpen.push(options)
        return Promise.resolve()
      },
      setPanelBehavior: (options) => {
        calls.setPanelBehavior.push(options)
        return Promise.resolve()
      },
    },
    __listeners: listeners,
    __removedListeners: removedListeners,
    __installedListeners: installedListeners,
    __session: sessionStore,
    __calls: calls,
  }

  globalThis.chrome = chrome
  return store
}
