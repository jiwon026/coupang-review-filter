import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

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
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('watching...')
} else {
  await esbuild.build(options)
}
