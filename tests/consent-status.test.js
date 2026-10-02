import { describe, it, expect } from 'vitest'
import { CONSENT, DECIDED_STATUSES, consentStatusFrom } from '../extension/src/shared/consent-status.js'
import { CONSENT as BACKGROUND_CONSENT } from '../extension/src/background/consent.js'
import { ONBOARDING_PATH } from '../extension/src/shared/pages.js'

describe('동의 상태 공용 상수', () => {
  it('백그라운드의 CONSENT 와 같은 값이다', () => {
    expect(BACKGROUND_CONSENT).toEqual({ GRANTED: 'granted', DENIED: 'denied', UNDECIDED: 'undecided' })
    expect(CONSENT).toBe(BACKGROUND_CONSENT)
  })

  it('고른 상태는 granted 와 denied 뿐이다', () => {
    expect(DECIDED_STATUSES).toEqual(['granted', 'denied'])
  })

  it('온보딩 경로는 매니페스트가 아닌 확장 내부 페이지 경로다', () => {
    expect(ONBOARDING_PATH).toBe('src/onboarding/index.html')
  })
})

describe('consentStatusFrom', () => {
  it.each(['granted', 'denied', 'undecided'])('%s 응답에서 상태를 읽는다', (status) => {
    expect(consentStatusFrom({ consent: { status, decidedAt: null } })).toBe(status)
  })

  it.each([
    ['읽기 실패 표지', { consent: { status: 'undecided', decidedAt: null }, error: 'failed' }],
    ['알 수 없는 상태', { consent: { status: 'maybe' } }],
    ['consent 없음', {}],
    ['응답 없음', undefined],
    ['null', null],
  ])('%s 이면 null 이다', (_label, response) => {
    expect(consentStatusFrom(response)).toBeNull()
  })
})
