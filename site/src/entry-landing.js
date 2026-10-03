import { initLanding } from './landing/landing.js'
import { STORE_LIVE } from './landing/config.js'

// __AMPLITUDE_KEY__ 와 __AMPLITUDE_ENDPOINT__ 는 site/build.js 의 define 이 넣는다.
initLanding({
  window,
  document,
  navigator,
  config: { apiKey: __AMPLITUDE_KEY__, endpoint: __AMPLITUDE_ENDPOINT__, storeLive: STORE_LIVE },
})
