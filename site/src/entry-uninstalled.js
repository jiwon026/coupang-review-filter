import { initUninstalledPage } from './uninstalled.js'

// __AMPLITUDE_KEY__ 와 __AMPLITUDE_ENDPOINT__ 는 site/build.js 의 define 이 넣는다.
initUninstalledPage({
  document,
  location,
  history,
  config: { apiKey: __AMPLITUDE_KEY__, endpoint: __AMPLITUDE_ENDPOINT__ },
})
