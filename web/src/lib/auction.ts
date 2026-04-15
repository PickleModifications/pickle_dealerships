import type { Auction } from '../types'

export function msUntil(endsAt: string | null): number {
  if (!endsAt) return 0
  const end = new Date(endsAt).getTime()
  if (Number.isNaN(end)) return 0
  return end - Date.now()
}

export function formatTimeRemaining(endsAt: string | null): string {
  if (!endsAt) return 'Awaiting bid'
  const ms = msUntil(endsAt)
  if (ms <= 0) return 'Ended'
  const totalSecs = Math.ceil(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function isEndingSoon(endsAt: string | null, windowSeconds = 30): boolean {
  if (!endsAt) return false
  const ms = msUntil(endsAt)
  return ms > 0 && ms <= windowSeconds * 1000
}

export function nextBidFloor(auction: Auction): number {
  if (auction.current_bid && auction.current_bid > 0) {
    return auction.current_bid + auction.min_increment
  }
  return auction.starting_bid
}

export type BidStatus = 'leading' | 'outbid' | 'not_bidding' | 'ended' | 'won'

export function getBidStatus(auction: Auction, myIdentifier: string | null | undefined): BidStatus {
  if (auction.status === 'won' && auction.winner_identifier === myIdentifier) return 'won'
  if (auction.status !== 'active') return 'ended'
  if (!myIdentifier) return 'not_bidding'
  if (auction.current_bidder === myIdentifier) return 'leading'
  return 'not_bidding'
}

export function maskBidder(id: string | null | undefined): string {
  if (!id) return 'Anonymous'
  const tail = id.split(':').pop() || id
  return tail.length <= 4 ? `***${tail}` : `***${tail.slice(-4)}`
}
