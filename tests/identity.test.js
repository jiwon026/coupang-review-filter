import { describe, it, expect, beforeEach } from 'vitest'
import { installChromeMock } from './helpers/chrome-mock.js'
import { getDeviceId, setDeviceId, getUserId, setUserId } from '../extension/src/background/identity.js'

describe('identity', () => {
  let store

  beforeEach(() => {
    store = installChromeMock()
  })

  it('저장된 device_id가 없으면 새로 만든다', async () => {
    const id = await getDeviceId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(10)
  })

  it('두 번 호출하면 같은 값을 준다', async () => {
    const first = await getDeviceId()
    const second = await getDeviceId()
    expect(second).toBe(first)
  })

  it('생성한 값을 저장소에 쓴다', async () => {
    const id = await getDeviceId()
    expect(store.crf_device_id).toBe(id)
  })

  it('랜딩에서 받은 id로 덮어쓸 수 있다', async () => {
    await getDeviceId()
    await setDeviceId('abc123')
    expect(await getDeviceId()).toBe('abc123')
  })

  it('user_id는 기본값이 null이다', async () => {
    expect(await getUserId()).toBeNull()
  })

  it('user_id를 저장하고 읽는다', async () => {
    await setUserId('token-xyz')
    expect(await getUserId()).toBe('token-xyz')
  })
})
