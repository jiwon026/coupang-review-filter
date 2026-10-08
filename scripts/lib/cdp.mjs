// 크롬 헤드리스를 띄워 CDP(크롬 개발자 도구 프로토콜)로 페이지를 열고 스크립트를 평가한다. 확인 스크립트 전용이다.
// 일반 크롬은 명령줄로 확장을 싣는 것을 막으므로 확장 대신 번들을 페이지에 직접 넣어 본다(명세 13.10).
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
// 헤드리스의 기본 UA 에는 HeadlessChrome 이 들어가 쇼핑몰이 다른 화면을 줄 수 있다. 일반 크롬의 UA 로 연다.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function findPageTarget(port) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const target = targets.find((item) => item.type === 'page')
      if (target) return target
    } catch {
      // 크롬이 아직 뜨는 중이다.
    }
    await sleep(250)
  }
  throw new Error('크롬이 뜨지 않았습니다. CHROME_PATH 를 확인하세요.')
}

export async function launch({ port = 9333, width = 1280, height = 900 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'crf-cdp-'))
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      `--user-agent=${USER_AGENT}`,
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const target = await findPageTarget(port)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))

  let nextId = 0
  const pending = new Map()
  const consoleErrors = []
  socket.addEventListener('message', (message) => {
    const data = JSON.parse(message.data)
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data)
      pending.delete(data.id)
      return
    }
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      consoleErrors.push(data.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
    }
    if (data.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(data.params.exceptionDetails?.exception?.description ?? 'exception')
    }
  })

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId
      pending.set(id, resolve)
      socket.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')
  await send('Runtime.enable')

  return {
    consoleErrors,
    async goto(url, waitMs = 5000) {
      await send('Page.navigate', { url })
      await sleep(waitMs)
    },
    // body 는 async 함수의 본문이다. return 한 값을 돌려받는다. 던지면 { __error } 를 돌려준다.
    async evaluate(body) {
      const reply = await send('Runtime.evaluate', {
        expression: `(async()=>{${body}})()`,
        awaitPromise: true,
        returnByValue: true,
      })
      const details = reply.result?.exceptionDetails
      if (details) return { __error: details.exception?.description ?? details.text ?? 'error' }
      return reply.result?.result?.value
    },
    async screenshot(clip) {
      const reply = await send('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' })
      return Buffer.from(reply.result.data, 'base64')
    },
    async close() {
      socket.close()
      chrome.kill()
    },
  }
}
