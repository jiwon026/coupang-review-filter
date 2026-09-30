export function installChromeMock(initial = {}) {
  const store = { ...initial }
  const listeners = []
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
    },
    runtime: {
      setUninstallURL() {},
      getManifest: () => ({ version: '0.1.0' }),
      onMessage: { addListener: (fn) => listeners.push(fn) },
      onInstalled: { addListener: () => {} },
    },
    tabs: {
      onRemoved: { addListener: () => {} },
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
    __calls: calls,
  }

  globalThis.chrome = chrome
  return store
}
