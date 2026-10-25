import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { skinNames } from './presentation'
import { PlayerAvatar } from './PlayerAvatar'
import { useGameStore } from './store'
import type { RoomView } from './types'

function PlayerName({ room, id, showTag = true }: { room: RoomView; id: string | null; showTag?: boolean }) {
  const player = room.players.find(player => player.id === id)
    ?? room.records.find(player => player.playerId === id)
  return <span className="activity-player-name">{player?.displayName ?? 'Player'}{showTag && player && <small>#{player.identityTag}</small>}</span>
}

export function StageInfo({ room, connected }: { room: RoomView; connected: boolean }) {
  const game = room.game!
  const current = room.players.find(player => player.id === game.currentPlayerId)
  const lastPlay = game.plays?.at(-1)
  const skin = current?.equippedSkin ?? 'CLASSIC'
  const reduceMotion = useReducedMotion()
  return <section className={`stage-panel turn-skin-${skin.toLowerCase()}`} aria-label="Player activity">
    <motion.div className="stage-current" key={game.currentPlayerId}
      initial={{ opacity: 0, x: reduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .25 }}>
      <div className="stage-heading"><span>ON STAGE</span><b aria-hidden="true">✦</b></div>
      <strong className="stage-name"><PlayerName room={room} id={game.currentPlayerId} /></strong>
      <span className="stage-edition">{skinNames[skin]}</span>
      <div className="stage-thinking" role="status">
        {connected ? <>THINKING<span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span></> : 'RECONNECTING…'}
      </div>
    </motion.div>
    <div className="stage-last-play" aria-live="polite" aria-atomic="true">
      <span className="stage-last-label">LAST PLAYED</span>
      {lastPlay ? <motion.div key={lastPlay.id} initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }}>
        <PlayerName room={room} id={lastPlay.playerId} />
        <strong className="stage-last-claim">{lastPlay.cardCount} <span>×</span> {lastPlay.declaredRank}</strong>
      </motion.div> : <p>No play yet</p>}
    </div>
  </section>
}

export function TableActivity({ room, myTurn }: { room: RoomView; myTurn: boolean }) {
  const game = room.game!
  const latestPlay = game.plays?.at(-1)
  const reduceMotion = useReducedMotion()
  const turnKey = `${game.currentPlayerId}-${latestPlay?.id ?? 0}-${game.generation}-${game.consecutiveFolds}`
  return <>
    <div className="table-play-layer" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">{latestPlay ? <motion.div className="table-play-announcement" key={latestPlay.id}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 22, scale: reduceMotion ? 1 : .85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -14 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
        <span className="play-announcement-player"><PlayerName room={room} id={latestPlay.playerId} showTag={false} /> <span>played</span></span>
        <strong className="play-announcement-claim">{latestPlay.cardCount} <span>×</span> {latestPlay.declaredRank}</strong>
      </motion.div> : <div className="table-play-empty">No cards played yet · Open the round</div>}</AnimatePresence>
    </div>
    <div className="your-turn-anchor">
      <AnimatePresence mode="wait">{myTurn && <motion.div className="your-turn-cue" key={turnKey} role="status"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 18, scale: reduceMotion ? 1 : .9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
        <span aria-hidden="true">◆</span> YOUR TURN <span aria-hidden="true">◆</span>
      </motion.div>}</AnimatePresence>
    </div>
  </>
}

// Rotate around the viewer once; advancing a turn never moves the seats.
export function TableSeats({ room, playerId, connected }: { room: RoomView; playerId: string; connected: boolean }) {
  const { player, kickPlayer } = useGameStore()
  const spelling = room.game!.spelling
  const spellingRunning = spelling?.stage === "ACTIVE"
  const hands = room.game!.hands
  const selfIndex = hands.findIndex(hand => hand.playerId === playerId)
  const seats = selfIndex < 0 ? hands : [...hands.slice(selfIndex), ...hands.slice(0, selfIndex)]
  return <ol className="table-seats" aria-label="Players around the table">{seats.map((hand, index) => {
    const member = room.players.find(member => member.id === hand.playerId)
    const angle = Math.PI / 2 + index * Math.PI * 2 / seats.length
    const current = !spellingRunning && room.game!.currentPlayerId === hand.playerId
    const self = hand.playerId === playerId
    return <li key={hand.playerId} className={`table-seat ${current ? 'current' : ''} ${self ? 'self' : ''}`}
      style={self ? undefined : { left: `${50 + 44 * Math.cos(angle)}%`, top: `${50 + 43 * Math.sin(angle)}%` }}
      aria-current={current ? 'step' : undefined}>
      <div className="seat-avatar" aria-hidden="true"><PlayerAvatar avatar={member?.equippedAvatar} /><span>{hand.cardCount}</span></div>
      <strong title={`${member?.displayName ?? 'Player'} #${member?.identityTag ?? ''}`}>{member?.displayName ?? 'Player'}</strong>
      <small>{self ? 'YOU · ' : ''}{spellingRunning ? 'SPELLING' : current ? connected ? 'THINKING…' : 'RECONNECTING' : member?.presence === 'OFFLINE' ? 'OFFLINE' : `${hand.cardCount} cards`}</small>
      {(player?.root || room.hostId === playerId) && !self && <button className="seat-remove" aria-label={`Kick ${member?.displayName ?? 'Player'}`} onClick={() => void kickPlayer(room.id, hand.playerId)}>×</button>}
    </li>
  })}</ol>
}
