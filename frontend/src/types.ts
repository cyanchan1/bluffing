export type GameType = 'LIARS_DECK' | 'LIARS_DECK_PLUS'
export type RoomStatus = 'LOBBY' | 'IN_GAME'
export type Suit = 'SPADES' | 'HEARTS' | 'DIAMONDS' | 'CLUBS' | 'JOKER'

export interface Player { id: string; displayName: string; identityTag: string; root: boolean }
export interface Card { id: string; rank: string; suit: Suit }
export interface Member {
  id: string
  displayName: string
  identityTag: string
  seatIndex: number
  balance: number
  host: boolean
  presence: 'ACTIVE' | 'AWAY' | 'OFFLINE'
  equippedSkin: SkinId
}
export interface Claim { playerId: string; cardCount: number; generation: number; risk: number }
export interface GameOutcome {
  id: number
  type: 'PLAY_PASSED' | 'POOL_PASSED' | 'CHECK_SUCCEEDED' | 'CHECK_FAILED' | 'GAME_WON' | 'PLAY_VOIDED'
  playerId: string
  challengerId: string | null
  rewardPlayerId: string | null
  amount: number
  poolSize: number
  declaredRank: string | null
  revealedCards: Card[]
}
export interface GameView {
  gameId: string
  phase: 'ACTIVE' | 'FINISHED'
  deckCount: number
  cardsPerPlayer: number
  currentPlayerId: string | null
  initializerId: string | null
  targetRank: string | null
  poolSize: number
  generation: number
  consecutiveFolds: number
  lastClaim: Claim | null
  hand: Card[]
  hands: { playerId: string; cardCount: number }[]
  events: string[]
  winnerId: string | null
  participants: string[]
  pendingClaim: Claim | null
  earnings: { playerId: string; amount: number }[]
  plays?: { id: number; playerId: string; declaredRank: string; cardCount: number;
    status: 'PENDING' | 'PASSED' | 'TRUTH' | 'LIE' | 'VOIDED'; challengerId?: string | null; revealedCards: Card[] }[]
  outcomes: GameOutcome[]
}
export interface RoomSummary {
  id: string
  name: string
  gameType: GameType
  status: RoomStatus
  hostId: string
  playerCount: number
  maxPlayers: number
  activePlayerCount: number
  createdAt: string
  joined: boolean
}
export interface RoomView {
  id: string
  name: string
  gameType: GameType
  status: RoomStatus
  hostId: string
  players: Member[]
  game: GameView | null
  skins: Skin[]
  records: PlayerRecord[]
  notice: string | null
}
export interface PlayerRecord { playerId: string; displayName: string; identityTag: string; wins: number; currentStreak: number; bestStreak: number }
export type SkinId = 'CLASSIC' | 'AURORA' | 'SUPERNOVA' | 'PRISM'
export interface Skin { id: SkinId; name: string; effect: string; price: number; owned: boolean }
