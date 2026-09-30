import { isSponsored } from './sponsored.js'

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function average(list) {
  if (list.length === 0) return null
  const sum = list.reduce((acc, item) => acc + item.rating, 0)
  return round(sum / list.length, 1)
}

function isSponsoredRecord(review) {
  return typeof review.sponsored === 'boolean' ? review.sponsored : isSponsored(review.text)
}

export function summarize(reviews) {
  const list = Array.isArray(reviews) ? reviews : []
  const sponsoredList = list.filter(isSponsoredRecord)
  const organicList = list.filter((review) => !isSponsoredRecord(review))

  const ratingOfficial = average(list)
  const ratingFiltered = average(organicList)
  const ratingDelta =
    ratingOfficial === null || ratingFiltered === null
      ? null
      : round(ratingFiltered - ratingOfficial, 1)

  return {
    total: list.length,
    sponsoredCount: sponsoredList.length,
    organicCount: organicList.length,
    sponsoredRatio: list.length === 0 ? 0 : round(sponsoredList.length / list.length, 3),
    ratingOfficial,
    ratingFiltered,
    ratingDelta,
  }
}
