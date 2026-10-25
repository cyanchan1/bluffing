import type { Card } from './types'
import { straightClaimRanks, truthfulPlusRanks } from './gameModes'

/** Only describes your selection: never exposes another player's face-down cards. */
export function PlusRules({ cards = [], rank }: { cards?: Card[]; rank?: string | null }) {
  const straight = straightClaimRanks(cards)
  const truthful = truthfulPlusRanks(cards)
  const bluff = !!cards.length && !!rank && !truthful.includes(rank)
  return <section className="plus-rules" aria-label="Liar’s Deck Plus rules">
    <header><strong>✦ PLUS RULES</strong><span>54 CARDS / DECK</span></header>
    <p><b>Jokers are wild.</b> Every deck has two. They can match any rank or fill a straight.</p>
    <details><summary>4-card straight → 4 × a rank inside it</summary>
      <div className="straight-example" aria-label="A, 2, 3, 4 can claim four Aces, twos, threes or fours">
        <span>A</span><span>2</span><span>3</span><span>4</span><b>→ 4 × A / 2 / 3 / 4</b>
      </div>
      <p>Exactly four consecutive ranks, any suits. Ace can be low (A-2-3-4) or high (J-Q-K-A), never wraparound. A claim outside the completed straight is a bluff.</p>
    </details>
    {cards.length > 0 && <div className={`selection-verdict ${bluff ? 'is-bluff' : 'is-truth'}`} role="status">
      <strong>{bluff ? 'You’re bluffing this rank' : straight.length ? 'Straight ready' : cards.some(card => card.rank === 'JOKER') ? 'Wildcards selected' : 'Your selection'}</strong>
      <span>{truthful.length === 13 ? 'Truthful as any rank' : truthful.length ? `Truthful as: ${truthful.join(' · ')}` : 'No truthful rank — this is a bluff'}</span>
    </div>}
  </section>
}
