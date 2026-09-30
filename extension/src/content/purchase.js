import { PURCHASE_SELECTORS } from './selectors.js'

export function watchPurchaseIntent(root, onIntent, selectors = PURCHASE_SELECTORS) {
  root.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (!target || typeof target.closest !== 'function') return

      if (target.closest(selectors.cart)) {
        onIntent('cart')
        return
      }
      if (target.closest(selectors.buyNow)) {
        onIntent('buy_now')
      }
    },
    true,
  )
}
