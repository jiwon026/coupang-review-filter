import { coupang } from './coupang.js'
import { musinsa } from './musinsa.js'

const SITES = [coupang, musinsa]

// 호스트 이름이 정확히 같을 때만 부품을 돌려준다. 이름에 쇼핑몰 글자가 들어 있기만 한 호스트는 대상이 아니다.
export function resolveSite(hostname) {
  return SITES.find((site) => site.hosts.includes(hostname)) ?? null
}
