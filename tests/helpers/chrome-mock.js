export function installChromeMock(initial = {}) {
  const store = { ...initial }
  const sessionStore = {}
  const listeners = []
  const removedListeners = []
  const calls = { sidePanelOpen: [], setPanelBehavior: [] }

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
      setUninstallURL() {},
      getManifest: () => ({ version: '0.1.0' }),
      onMessage: { addListener: (fn) => listeners.push(fn) },
      onInstalled: { addListener: () => {} },
    },
    tabs: {
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
    __session: sessionStore,
    __calls: calls,
  }

  globalThis.chrome = chrome
  return store
}
