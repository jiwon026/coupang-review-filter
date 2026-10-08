import { describe, it, expect } from 'vitest'
import { SHOP_IDS, UNKNOWN_SHOP_ID, safeShopId } from '../extension/src/shared/shops.js'

describe('safeShopId', () => {
  it('쇼핑몰 목록은 coupang, musinsa 둘이다', () => {
    expect(SHOP_IDS).toEqual(['coupang', 'musinsa'])
  })

  it.each(['coupang', 'musinsa'])('목록에 있는 값(%s)은 그대로 돌려준다', (id) => {
    expect(safeShopId(id)).toBe(id)
  })

  it.each([
    ['대문자가 섞인 값', 'Coupang'],
    ['빈 문자열', ''],
    ['null', null],
    ['undefined', undefined],
    ['객체', {}],
    ['뒤에 공백이 붙은 값', 'musinsa '],
    ['목록에 없는 문자열', 'evil<script>'],
    ['배열', ['coupang']],
    ['문자열로 바뀌면 목록에 있는 객체', { toString: () => 'coupang' }],
    ['숫자', 0],
  ])('%s 이면 unknown 이다', (_label, value) => {
    expect(safeShopId(value)).toBe('unknown')
  })

  it('모르는 쇼핑몰의 값은 unknown 이다', () => {
    expect(UNKNOWN_SHOP_ID).toBe('unknown')
  })
})
