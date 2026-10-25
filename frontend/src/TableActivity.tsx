import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { GameView, RoomView } from './types'

type Play = NonNullable<GameView['plays']>[number]

function PlayerName({ room, id }: { room: RoomView; id: string | null }) {
  const player = room.players.find(player => player.id === id)
    ?? room.records.find(player => player.playerId === id)
  return <span className="activity-player-name">{player?.displayName ?? 'Player'}{player && <small>#{player.identityTag}</small>}</span>
}

export function TableActivity({ room, myTurn }: { room: RoomView; myTurn: boolean }) {
  const game = room.game!
  const latestPlay = game.plays?.at(-1)
  // Initial snapshots and reconnects show the last play in the rail without replaying it.
  const cursor = useRef({ gameId: game.gameId, playId: latestPlay?.id ?? 0 })
  const [announcement, setAnnouncement] = useState<Play | null>(null)
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    if (cursor.current.gameId !== game.gameId) {
      cursor.current = { gameId: game.gameId, playId: latestPlay?.id ?? 0 }
      setAnnouncement(null)
      return
    }
    if (!latestPlay || latestPlay.id <= cursor.current.playId) return
    cursor.current.playId = latestPlay.id
    setAnnouncement(latestPlay)
  }, [game.gameId, latestPlay])
  useEffect(() => {
    if (!announcement) return
    const timer = window.setTimeout(() => setAnnouncement(null), 2800)
    return () => window.clearTimeout(timer)
  }, [announcement])
  const turnKey = `${game.currentPlayerId}-${latestPlay?.id ?? 0}-${game.generation}-${game.consecutiveFolds}`
  return <>
    <div className="table-play-layer" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">{announcement && <motion.div className="table-play-announcement" key={announcement.id}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 22, scale: reduceMotion ? 1 : .85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -14 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
        <span className="play-announcement-player"><PlayerName room={room} id={announcement.playerId} /> <span>played</span></span>
        <strong className="play-announcement-claim">{announcement.cardCount} <span>×</span> {announcement.declaredRank}</strong>
      </motion.div>}</AnimatePresence>
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
