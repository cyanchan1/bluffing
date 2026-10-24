import type { GameOutcome, GameView, Member, RoomView } from '../src/types'

export const self = { id: 'one', displayName: 'Dealer', identityTag: '11111', root: false }
export const other = { id: 'two', displayName: 'Dealer', identityTag: '22222', root: false }

export function outcome(overrides: Partial<GameOutcome> = {}): GameOutcome {
  return { id: 1, type: 'PLAY_PASSED', playerId: self.id, challengerId: null,
    rewardPlayerId: self.id, amount: 20, poolSize: 2, declaredRank: 'A', revealedCards: [], ...overrides }
}

export function game(overrides: Partial<GameView> = {}): GameView {
  return { gameId: 'deal-one', phase: 'ACTIVE', deckCount: 1, cardsPerPlayer: 5,
    currentPlayerId: self.id, initializerId: self.id, targetRank: null, poolSize: 0,
    generation: 1, consecutiveFolds: 0, lastClaim: null, hand: [],
    hands: [{ playerId: self.id, cardCount: 5 }, { playerId: other.id, cardCount: 5 }],
    events: [], winnerId: null, participants: [self.id, other.id], pendingClaim: null,
    earnings: [], plays: [], outcomes: [], ...overrides }
}

export function room(overrides: Partial<RoomView> = {}): RoomView {
  const members: Member[] = [self, other].map((player, index) => ({ ...player,
    seatIndex: index, balance: 500, host: index === 0, presence: 'ACTIVE', equippedSkin: 'CLASSIC' }))
  return { id: 'room-one', name: 'Test table', gameType: 'LIARS_DECK', status: 'IN_GAME',
    hostId: self.id, players: members, game: game(), skins: [], records: [], notice: null, ...overrides }
}
