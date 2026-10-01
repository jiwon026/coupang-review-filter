import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')
// 기본(build, watch)은 개발용이라 디버그 로그를 켠다. --release 는 로그를 번들에서 걷어낸다.
// 콘텐츠 번들에 config.local.js(API 키)를 넣지 않으려고 설정 파일 대신 빌드 시점 상수를 쓴다.
const debug = !process.argv.includes('--release')

const options = {
  entryPoints: {
    content: 'extension/src/content/index.js',
    background: 'extension/src/background/index.js',
    sidepanel: 'extension/src/sidepanel/index.js',
  },
  bundle: true,
  format: 'iife',
  outdir: 'extension/dist',
  target: 'chrome120',
  define: { __CRF_DEBUG__: String(debug) },
  // 운영 빌드는 구문 최소화와 debugLog 호출부의 PURE 주석으로 로그 호출을 호출째 걷어낸다(로그 문구가 번들에 남지 않는다).
  // 개발 빌드는 PURE 주석을 무시해야 같은 호출이 살아남는다.
  minifySyntax: !debug,
  ignoreAnnotations: debug,
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('watching...')
} else {
  await esbuild.build(options)
}
