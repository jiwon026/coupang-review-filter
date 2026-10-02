import { describe, it, expect } from 'vitest'
import { UNKNOWN_ERROR_NAME, safeErrorName } from '../extension/src/shared/error-name.js'

describe('safeErrorName', () => {
  it.each(['TypeError', 'RangeError', 'DOMException', 'E', 'a'.repeat(40)])('영문자만 1~40자면 그대로 돌려준다(%s)', (name) => {
    expect(safeErrorName(name)).toBe(name)
  })

  it.each([
    ['빈 문자열', ''],
    ['41자', 'a'.repeat(41)],
    ['공백 포함', 'Type Error'],
    ['숫자 포함', 'Error42'],
    ['쿠팡 번호', '7590830589'],
    ['한글(리뷰 본문 같은 자유 텍스트)', '배송이빨라요'],
    ['기호 포함', 'Type_Error'],
    ['줄바꿈으로 덧붙인 텍스트', 'TypeError\n리뷰 본문'],
    ['앞뒤 공백', ' TypeError '],
    ['숫자', 42],
    ['null', null],
    ['undefined', undefined],
    ['객체', { toString: () => 'TypeError' }],
    ['배열', ['TypeError']],
  ])('%s 이면 Unknown 이다', (_label, value) => {
    expect(safeErrorName(value)).toBe('Unknown')
  })

  it('기본 이름은 Unknown 이다', () => {
    expect(UNKNOWN_ERROR_NAME).toBe('Unknown')
  })
})
