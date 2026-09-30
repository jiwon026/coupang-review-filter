import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { watchPurchaseIntent } from '../extension/src/content/purchase.js'

const TEST_SELECTORS = { cart: '.crf-test-cart', buyNow: '.crf-test-buy' }

describe('watchPurchaseIntent', () => {
  let doc

  beforeEach(() => {
    doc = new JSDOM(`<body>
      <button class="crf-test-cart">장바구니 담기</button>
      <button class="crf-test-buy"><span class="inner">바로구매</span></button>
      <button class="crf-test-other">공유</button>
    </body>`).window.document
  })

  it('장바구니 클릭을 감지한다', () => {
    const onIntent = vi.fn()
    watchPurchaseIntent(doc, onIntent, TEST_SELECTORS)
    doc.querySelector('.crf-test-cart').click()
    expect(onIntent).toHaveBeenCalledWith('cart')
  })

  it('바로구매 클릭을 감지한다', () => {
    const onIntent = vi.fn()
    watchPurchaseIntent(doc, onIntent, TEST_SELECTORS)
    doc.querySelector('.crf-test-buy').click()
    expect(onIntent).toHaveBeenCalledWith('buy_now')
  })

  it('버튼 안쪽 글자를 눌러도 감지한다', () => {
    const onIntent = vi.fn()
    watchPurchaseIntent(doc, onIntent, TEST_SELECTORS)
    doc.querySelector('.inner').click()
    expect(onIntent).toHaveBeenCalledWith('buy_now')
  })

  it('관계없는 버튼은 무시한다', () => {
    const onIntent = vi.fn()
    watchPurchaseIntent(doc, onIntent, TEST_SELECTORS)
    doc.querySelector('.crf-test-other').click()
    expect(onIntent).not.toHaveBeenCalled()
  })

  it('페이지가 전파를 막아도 감지한다', () => {
    doc.querySelector('.crf-test-cart').addEventListener('click', (event) => event.stopPropagation())
    const onIntent = vi.fn()
    watchPurchaseIntent(doc, onIntent, TEST_SELECTORS)
    doc.querySelector('.crf-test-cart').click()
    expect(onIntent).toHaveBeenCalledWith('cart')
  })

  it('실제 쿠팡 셀렉터를 기본값으로 쓴다', () => {
    const real = new JSDOM(`<body>
      <button class="prod-cart-btn twc-flex-1">장바구니 담기</button>
      <button class="prod-buy-btn twc-flex-1"><span class="prod-buy-btn__txt">바로구매</span></button>
    </body>`).window.document
    const onIntent = vi.fn()
    watchPurchaseIntent(real, onIntent)
    real.querySelector('.prod-buy-btn__txt').click()
    real.querySelector('.prod-cart-btn').click()
    expect(onIntent).toHaveBeenNthCalledWith(1, 'buy_now')
    expect(onIntent).toHaveBeenNthCalledWith(2, 'cart')
  })
})
