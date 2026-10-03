import { describe, it, expect } from 'vitest'
import { deviceClass } from '../site/src/landing/device.js'

// 실제 브라우저가 보내는 전체 UA 문자열이다. 줄이지 않는다.
const UA = {
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5.1 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  // 안드로이드 태블릿의 크롬은 UA 에 Mobile 토큰이 없고 userAgentData.mobile 도 false 를 보고한다.
  androidTabletChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}

describe('deviceClass', () => {
  it('윈도우 크롬은 desktop 이다', () => {
    expect(deviceClass({ userAgent: UA.windowsChrome })).toBe('desktop')
  })

  it('맥 사파리는 desktop 이다', () => {
    expect(deviceClass({ userAgent: UA.macSafari })).toBe('desktop')
  })

  it('아이폰 사파리는 mobile 이다', () => {
    expect(deviceClass({ userAgent: UA.iphoneSafari })).toBe('mobile')
  })

  it('안드로이드 크롬은 mobile 이다', () => {
    expect(deviceClass({ userAgent: UA.androidChrome })).toBe('mobile')
  })

  it('uaDataMobile true 가 데스크톱 UA 를 이긴다', () => {
    expect(deviceClass({ userAgent: UA.windowsChrome, uaDataMobile: true })).toBe('mobile')
  })

  it('uaDataMobile false 는 증거가 아니라서 모바일 UA 를 이기지 못한다', () => {
    expect(deviceClass({ userAgent: UA.iphoneSafari, uaDataMobile: false })).toBe('mobile')
  })

  it('안드로이드 태블릿 크롬(Mobile 토큰 없음, uaDataMobile false)은 mobile 이다', () => {
    expect(deviceClass({ userAgent: UA.androidTabletChrome, uaDataMobile: false })).toBe('mobile')
    expect(deviceClass({ userAgent: UA.androidTabletChrome })).toBe('mobile')
  })

  it('윈도우 크롬에 uaDataMobile false 는 desktop 이다', () => {
    expect(deviceClass({ userAgent: UA.windowsChrome, uaDataMobile: false })).toBe('desktop')
  })

  it('uaDataMobile 이 undefined 면 UA 로 판정한다', () => {
    expect(deviceClass({ userAgent: UA.iphoneSafari, uaDataMobile: undefined })).toBe('mobile')
    expect(deviceClass({ userAgent: UA.windowsChrome, uaDataMobile: undefined })).toBe('desktop')
  })

  it('uaDataMobile 이 boolean 이 아니면 무시하고 UA 로 판정한다', () => {
    expect(deviceClass({ userAgent: UA.windowsChrome, uaDataMobile: 'true' })).toBe('desktop')
    expect(deviceClass({ userAgent: UA.androidChrome, uaDataMobile: null })).toBe('mobile')
  })

  it('판정할 수 없으면(빈 문자열, 값 없음) desktop 이다', () => {
    expect(deviceClass({ userAgent: '' })).toBe('desktop')
    expect(deviceClass({})).toBe('desktop')
    expect(deviceClass()).toBe('desktop')
  })
})

// 아이패드 사파리는 아이패드OS 13 부터 데스크톱 모드가 기본이라 맥과 같은 UA 를 보내고 userAgentData 도 없다.
// 실제 맥과 구별하는 단서는 터치 지점 수뿐이다(맥은 0, 아이패드는 5).
const IPAD_DESKTOP_MODE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'

describe('deviceClass 아이패드 데스크톱 모드', () => {
  it('Macintosh UA 에 maxTouchPoints 5 면 mobile 이다', () => {
    expect(deviceClass({ userAgent: IPAD_DESKTOP_MODE_UA, maxTouchPoints: 5 })).toBe('mobile')
  })

  it('같은 UA 에 maxTouchPoints 0 이면 desktop 이다(실제 맥)', () => {
    expect(deviceClass({ userAgent: IPAD_DESKTOP_MODE_UA, maxTouchPoints: 0 })).toBe('desktop')
  })

  it('maxTouchPoints 가 없어도 맥 사파리는 desktop 이다', () => {
    expect(deviceClass({ userAgent: UA.macSafari, maxTouchPoints: undefined })).toBe('desktop')
  })

  it('maxTouchPoints 가 1 이하이거나 숫자가 아니면 맥은 desktop 이다', () => {
    expect(deviceClass({ userAgent: UA.macSafari, maxTouchPoints: 1 })).toBe('desktop')
    expect(deviceClass({ userAgent: UA.macSafari, maxTouchPoints: '5' })).toBe('desktop')
    expect(deviceClass({ userAgent: UA.macSafari, maxTouchPoints: null })).toBe('desktop')
  })

  it('터치 노트북(윈도우 크롬, maxTouchPoints 10)은 desktop 이다', () => {
    expect(deviceClass({ userAgent: UA.windowsChrome, maxTouchPoints: 10 })).toBe('desktop')
  })

  it('uaDataMobile false 는 Macintosh UA 와 maxTouchPoints 5 를 뒤집지 못한다', () => {
    expect(deviceClass({ userAgent: IPAD_DESKTOP_MODE_UA, uaDataMobile: false, maxTouchPoints: 5 })).toBe('mobile')
  })

  it('uaDataMobile true 는 maxTouchPoints 와 상관없이 mobile 이다', () => {
    expect(deviceClass({ userAgent: UA.windowsChrome, uaDataMobile: true, maxTouchPoints: 0 })).toBe('mobile')
  })
})
