export function installChromeMock(initial = {}) {
  const store = { ...initial }

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
    },
  }

  globalThis.chrome = chrome
  return store
}
