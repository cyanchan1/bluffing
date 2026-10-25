import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useGameStore } from './store'
import type { Card, Member, Player, RoomSummary } from './types'
import { CardBack } from './CardBack'
import { PlayerAvatar } from './PlayerAvatar'
import { SpellingChallenge } from './SpellingChallenge'
import { DeckShop } from './DeckShop'
import { Modal } from './Modal'
import { Leaderboards } from './Leaderboards'
import { skinNames, tableSkins } from './presentation'
import { PlayHistory, RoundFeedback, Wallets } from './GameFeedback'
import { TableSeats, TableActivity } from './TableActivity'

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export default function App() {
  const { player, room, error, clearError, bootstrapping } = useGameStore()
  useEffect(() => { window.scrollTo(0, 0) }, [room?.id, room?.game?.phase])
  useEffect(() => {
    const reconnect = () => useGameStore.getState().reconnect()
    const onVisible = () => { if (document.visibilityState === 'visible') reconnect() }
    window.addEventListener('online', reconnect)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', reconnect)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return (
    <MotionConfig reducedMotion="user"><main className={room ? 'app game-shell' : 'app'}>
      <Ambient />
      <div className="screen">
        {bootstrapping ? <DeviceCheck key="device-check" /> : !player ? <Identity key="identity" /> : room ? <Room key={room.id} /> : <Lobby key="lobby" />}
      </div>
      <AnimatePresence>
        {error && (
          <motion.button className="toast" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} onClick={clearError}>
            <span className="toast-icon">!</span><strong>{error}</strong><span className="toast-close" aria-hidden="true">×</span>
          </motion.button>
        )}
      </AnimatePresence>
    </main></MotionConfig>
  )
}

function DeviceCheck() {
  return <motion.section className="device-check page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <Brand /><div className="device-spinner">♠</div><p>Recognizing this device…</p>
  </motion.section>
}

function Ambient() {
  return <div className="ambient" aria-hidden="true"><i /><i /></div>
}

function Brand() {
  return <div className="brand"><div className="brand-mark">♠</div><div><strong>BLUFF</strong><span>TABLE</span></div></div>
}

function Identity() {
  const identify = useGameStore(s => s.identify)
  const loading = useGameStore(s => s.loading)
  const [name, setName] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim()) void identify(name.trim())
  }
  return (
    <motion.section className="identity page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="identity-copy">
        <Brand />
        <p className="eyebrow">THE SOCIAL CARD TABLE</p>
        <h1>Read the room.<br /><em>Play the player.</em></h1>
        <p className="lede">A sharp multiplayer table where every card is a claim, and every claim can be called.</p>
        <div className="suit-row"><span>♠</span><span>♥</span><span>♣</span><span>♦</span></div>
      </div>
      <form className="identity-card" onSubmit={submit}>
        <span className="step">01 / ENTER THE TABLE</span>
        <h2>What should we call you?</h2>
        <label>PLAYER NAME<input autoFocus maxLength={24} placeholder="The Velvet Fox" value={name}
          onChange={e => setName(e.target.value)} /></label>
        <button className="primary" disabled={!name.trim() || loading}>{loading ? 'Taking a seat…' : 'Take a seat'} <b>→</b></button>
      </form>
    </motion.section>
  )
}

function Lobby() {
  const { player, rooms, connected, reconnect, loadRooms, createRoom, joinRoom, deleteRoom, openRoom, loading } = useGameStore()
  const [roomName, setRoomName] = useState(randomRoomName)
  const [deleteTarget, setDeleteTarget] = useState<RoomSummary | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  useEffect(() => { void loadRooms(); const timer = setInterval(loadRooms, 5000); return () => clearInterval(timer) }, [loadRooms])

  return (
    <motion.div className="lobby page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <header><Brand /><button className="profile" onClick={() => setEditingProfile(true)}><span className={connected ? 'online' : ''} />
        <span className="profile-name">{player && <IdentityName name={player.displayName} tag={player.identityTag} />}{player?.root && <b className="root-badge">ROOT</b>}</span>
        <div className="avatar">{initials(player?.displayName)}</div></button></header>
      {!connected && <div className="lobby-reconnecting" role="status"><strong>Reconnecting to the live table…</strong><button onClick={reconnect}>Reconnect now <span aria-hidden="true">↻</span></button></div>}
      <section className="lobby-intro">
        <div><p className="eyebrow">TABLE LOBBY</p><h1>Find your <em>next table.</em></h1></div>
        <form className="create-room" onSubmit={e => { e.preventDefault(); void createRoom(roomName) }}>
          <div className="create-room-title"><span>HOST A TABLE</span><b>LIAR'S DECK</b></div>
          <div className="create-field"><label htmlFor="room-name">ROOM NAME</label><div className="generated-name"><input id="room-name" maxLength={40} value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="Midnight Casino" />
            <button type="button" aria-label="Generate another room name" onClick={() => setRoomName(randomRoomName())}>↻</button></div></div>
          <button className="primary compact" disabled={loading || !roomName.trim()}>{loading ? 'Please wait…' : 'Create table'} <b>＋</b></button>
        </form>
      </section>
      <section className="rooms-section">
        <div className="section-title"><h2>Open tables</h2><span>{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</span></div>
        {rooms.length === 0 ? <EmptyRooms /> : <div className="room-grid">
          {rooms.map((room, index) => <RoomCard key={room.id} room={room} index={index}
            onJoin={() => room.joined ? void openRoom(room.id) : void joinRoom(room.id)}
            onInspect={player?.root && !room.joined ? () => void openRoom(room.id) : undefined}
            disabled={loading}
            onDelete={() => setDeleteTarget(room)} canDelete={room.hostId === player?.id || Boolean(player?.root)} />)}
        </div>}
      </section>
      <AnimatePresence>{editingProfile && player && <ProfileEditor player={player} onClose={() => setEditingProfile(false)} />}</AnimatePresence>
      <AnimatePresence>{deleteTarget && <ConfirmDelete room={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={() => {
        void deleteRoom(deleteTarget.id); setDeleteTarget(null)
      }} />}</AnimatePresence>
    </motion.div>
  )
}

function EmptyRooms() {
  return <div className="empty"><div className="empty-cards"><i>?</i><i>♠</i></div><h3>No open tables.</h3></div>
}

function RoomCard({ room, index, onJoin, onDelete, canDelete, onInspect, disabled }: { room: RoomSummary; index: number; onJoin: () => void; onDelete: () => void; canDelete: boolean; onInspect?: () => void; disabled: boolean }) {
  return (
    <article className="room-card">
      <div className="room-top"><span className="game-tag">LIAR'S DECK</span><span className={`status status-${room.status.toLowerCase()}`}>{room.status === 'LOBBY' ? 'Open' : 'In play'}</span></div>
      <div className="room-emblem">{index % 2 ? '♦' : '♠'}</div>
      <h3>{room.name}</h3>
      <div className="room-meta"><span><b>♟</b> {room.playerCount}/{room.maxPlayers} players</span><span className="active-count"><i /> {room.activePlayerCount} active</span><span>Created {timeAgo(room.createdAt)}</span></div>
      <div className="room-actions">
        <button className="secondary" disabled={disabled || (!room.joined && (room.status === 'IN_GAME' || room.playerCount >= room.maxPlayers))} onClick={onJoin}>{room.joined ? 'Return to table' : room.status === 'IN_GAME' ? 'Game in progress' : room.playerCount >= room.maxPlayers ? 'Table full' : 'Join table'} <b>→</b></button>
        {onInspect && <button className="secondary inspect-button" onClick={onInspect} disabled={disabled}>Manage</button>}
        {canDelete && <button className="icon-button danger" aria-label="Delete room" onClick={onDelete}>×</button>}
      </div>
    </article>
  )
}

function Room() {
  const room = useGameStore(s => s.room)
  if (!room) return null
  return room.game?.phase === 'ACTIVE' ? <GameTable key={room.game.gameId} /> : <WaitingRoom />
}

function TopBar() {
  const { room, player, leaveRoom, connected, reconnect, stopGame, loading, error } = useGameStore()
  const [confirmExit, setConfirmExit] = useState(false)
  const [stopTarget, setStopTarget] = useState<{ gameId: string | null } | null>(null)
  const canStop = (player?.root || room?.hostId === player?.id) && (room?.status === 'IN_GAME' || room?.game?.phase === 'ACTIVE')
  const exit = () => {
    if (room?.game?.phase === 'ACTIVE') setConfirmExit(true)
    else leaveRoom()
  }
  return <><header className="table-header"><Brand /><button className="room-name" onClick={exit} aria-label="Leave room">← <span>{room?.name}</span><b className="mobile-exit">Leave</b></button><div className="connection"><i className={connected ? 'online' : ''} />{connected ? 'LIVE' : <button onClick={reconnect}>RECONNECT ↻</button>}</div></header>
    {canStop && <nav className="table-tools" aria-label="Table tools">
      <button className="force-stop" disabled={loading || !connected} onClick={() => setStopTarget({ gameId: room?.game?.gameId ?? null })}>■ Stop deal</button>
    </nav>}
    {stopTarget && <Modal label="Force stop this deal" onClose={() => setStopTarget(null)}><div className="modal-card">
      <div className="modal-kicker danger-text">HOST / ROOT OVERRIDE</div><h2>End this deal?</h2>
      <p>Every player's room wallet returns to its balance from before this deal. No game rewards survive. Wins and streaks will not change.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="modal-actions"><button className="secondary" onClick={() => setStopTarget(null)}>Keep playing</button><button className="primary destructive" disabled={loading || !connected} onClick={async () => { if (await stopGame(stopTarget.gameId)) setStopTarget(null) }}>Stop & restore wallets</button></div>
    </div></Modal>}
    {confirmExit && <Modal label="Leave this deal?" onClose={() => setConfirmExit(false)}><div className="modal-card">
      <div className="modal-kicker">LEAVE THE DEAL</div><h2>Heading out?</h2><p>You cannot rejoin this deal. Your room membership, balance and skins stay safe.</p>
      <div className="modal-actions"><button className="secondary" onClick={() => setConfirmExit(false)}>Stay here</button><button className="primary compact" onClick={leaveRoom}>Leave deal →</button></div>
    </div></Modal>}
  </>
}

function WaitingRoom() {
  const { room, player, startGame, kickPlayer, loading, leaveRoom, connected } = useGameStore()
  const [decks, setDecks] = useState(1)
  const [custom, setCustom] = useState(false)
  const [cards, setCards] = useState(7)
  if (!room || !player) return null
  const isHost = room.hostId === player.id
  const canManage = isHost || player.root
  const absent = room.players.filter(member => member.presence !== 'ACTIVE').length
  const validHand = !custom || (Number.isInteger(cards) && cards >= 1 && cards * room.players.length <= decks * 52)
  const winner = room.players.find(member => member.id === room.game?.winnerId)
  return (
    <motion.div className="waiting page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <TopBar />
      {room.notice && <div className="match-result" role="status"><b>■ Table reset</b><span>{room.notice}</span></div>}
      {room.game?.phase === 'FINISHED' && <div className="match-result" role="status"><b>{winner ? `♛ ${winner.displayName} #${winner.identityTag} won the deal` : 'Deal ended · not enough players'}</b><span>{winner ? 'Ready for another hand?' : 'No winner bonus. Room wallets restored.'}</span></div>}
      <section className={`waiting-layout ${isHost ? '' : 'no-game-setup'}`}>
        <div className="waiting-copy"><p className="eyebrow">LIAR'S DECK</p><h1>Waiting <em>room.</em></h1>
          <button className="text-button" onClick={leaveRoom}>← Back to open tables</button></div>
        <div className="players-panel panel"><div className="panel-heading"><span>SEATING ORDER</span><b>{room.players.length} / 8</b></div>
          <div className="player-list">{room.players.map((member, i) => <PlayerRow key={member.id} member={member} index={i} self={member.id === player.id}
            canKick={canManage && member.id !== player.id} onKick={() => void kickPlayer(room.id, member.id)} />)}</div>
          {Array.from({ length: Math.max(0, 2 - room.players.length) }).map((_, i) => <div className="open-seat" key={i}><i /> Waiting for a player…</div>)}
        </div>
        {isHost && <div className="setup-panel panel"><div className="panel-heading"><span>GAME SETUP</span><b>PER GAME</b></div>
          <label>NUMBER OF DECKS<div className="stepper"><button onClick={() => setDecks(Math.max(1, decks - 1))}>−</button><strong>{decks}</strong><button onClick={() => setDecks(Math.min(8, decks + 1))}>＋</button></div></label>
          <div className="toggle-line"><strong>HAND SIZE</strong><button className={`mode-toggle ${custom ? 'on' : ''}`} onClick={() => setCustom(!custom)}><span>AUTO</span><span>CUSTOM</span></button></div>
          {custom && <label>CARDS PER PLAYER<input type="number" min="1" max={decks * 52} value={cards} onChange={e => setCards(Number(e.target.value))} /></label>}
          <button className="primary" disabled={room.players.length < 2 || absent > 0 || !validHand || loading || !connected} onClick={() => void startGame(decks, custom ? cards : null)}>{room.players.length < 2 ? 'Need 2 players' : absent ? `Waiting for ${absent} to enter` : !validHand ? 'Not enough cards' : 'Deal the cards'} <b>→</b></button>
          {absent > 0 && <p className="ready-state">{room.players.length - absent}/{room.players.length} here · everyone must be inside to start.</p>}
        </div>}
      </section>
      <SpellingChallenge />
      <Leaderboards />
      <DeckShop />
    </motion.div>
  )
}

function PlayerRow({ member, index, self, canKick, onKick }: { member: Member; index: number; self: boolean; canKick: boolean; onKick: () => void }) {
  return <div className="player-row"><div className="seat">0{index + 1}</div><div className="avatar small"><PlayerAvatar avatar={member.equippedAvatar} /></div>
    <div className="player-identity"><strong><IdentityName name={member.displayName} tag={member.identityTag} />{self && ' · You'}</strong>
      <span>{member.host ? 'Table host' : 'Player'} <PresenceStatus status={member.presence} /></span><span className={`edition-chip edition-${member.equippedSkin?.toLowerCase() ?? 'classic'}`}>✦ {skinNames[member.equippedSkin ?? 'CLASSIC']}</span></div>
    <b className="coins">◆ {member.balance}</b>{canKick && <button className="kick-button" onClick={onKick}>KICK</button>}</div>
}

function GameTable() {
  const { room, player, command, connected } = useGameStore()
  const [selected, setSelected] = useState<string[]>([])
  const [rank, setRank] = useState('A')
  const game = room?.game
  const handScroll = useRef<HTMLDivElement>(null)
  const previousHand = useRef(new Set<string>())
  useEffect(() => {
    const ids = (game?.hand ?? []).map(card => card.id)
    if (ids.some(id => !previousHand.current.has(id)) && handScroll.current) {
      handScroll.current.scrollLeft = 0
    }
    previousHand.current = new Set(ids)
  }, [game?.hand])
  useEffect(() => { setSelected([]) }, [game?.currentPlayerId, game?.poolSize])
  if (!room || !player || !game) return null
  const spellingRunning = game.spelling?.stage === 'ACTIVE'
  const myTurn = connected && !spellingRunning && game.currentPlayerId === player.id && game.phase === 'ACTIVE'
  const participating = game.hands.some(hand => hand.playerId === player.id)
  const skins = tableSkins(room)
  const risk = game.generation * selected.length * 10
  const play = () => { command('PLAY', selected, game.targetRank ? undefined : rank); setSelected([]) }

  return (
    <motion.div className="game page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <RoundFeedback />
      <SpellingChallenge />
      <div className="battle-top">
        <div className="current-play-bar"><TableActivity room={room} myTurn={myTurn} /></div>
        <details className="history-menu"><summary>Recent plays <span>{game.plays?.length ?? 0}</span></summary><PlayHistory room={room} /></details>
        <details className="battle-details"><summary>My wallet</summary><Wallets room={room} playerId={player.id} /></details>
      </div>
      <TopBar />
      <div className="game-layout battle-layout">
        <section className="felt-wrap">
          <div className="table-arena">
          <div className={`felt turn-skin-${skins.turn.toLowerCase()}`}>
            <div className="turn-aura" key={`${game.currentPlayerId}-${skins.turn}`}><CardBack skin={skins.turn} surface /><div className="aura-rings" /></div>
            <div className="felt-line" />
            <AnimatePresence mode="wait">
              <motion.div className="pool" key={`${game.poolSize}-${game.targetRank}`} initial={{ scale: .85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                {game.poolSize ? <><div className={`card-stack pool-skin-${skins.pool.toLowerCase()}`}>{Array.from({ length: Math.min(4, game.poolSize) }).map((_, i) => <i key={i} style={{ transform: `translate(${i * 3}px, ${-i * 3}px) rotate(${(i - 2) * 4}deg)` }} />)}<CardBack skin={skins.pool} compact /></div>
                  <strong>{game.poolSize} {game.poolSize === 1 ? 'card' : 'cards'}</strong></>
                  : <><div className="pool-preview"><CardBack skin={skins.turn} compact /></div><strong>Open the round</strong></>}
              </motion.div>
            </AnimatePresence>
          </div>
          <TableSeats room={room} playerId={player.id} connected={connected} />
          </div>
          {!participating && <div className="my-seat">{player.root ? 'ROOT' : 'HOST'} · SPECTATING</div>}
          {participating && <section className="hand-area">
            {game.pendingClaim && game.hands.some(hand => hand.playerId === game.pendingClaim?.playerId && hand.cardCount === 0) && <p className="final-play-notice" role="status">Final hand pending: Truth Check to challenge, or play / fold to accept. Victory is not confirmed yet.</p>}
            <div className="hand-caption"><span>YOUR HAND <b>{game.hand.length}</b></span><span>{myTurn ? 'Select cards to play' : 'Waiting for your turn'}</span></div>
            <div className="hand-controls">
              {!game.targetRank && myTurn && <label>DECLARE AS<select value={rank} onChange={e => setRank(e.target.value)}>{ranks.map(item => <option key={item}>{item}</option>)}</select></label>}
              <div className="action-buttons">
                <button className="action fold" disabled={!myTurn || game.poolSize === 0} onClick={() => command('FOLD')}><strong>FOLD</strong><span>Pass turn</span></button>
                <button className="action challenge" disabled={!myTurn || !game.lastClaim || game.lastClaim.playerId === player.id} onClick={() => command('CHALLENGE')}><strong>TRUTH CHECK</strong><span>{game.lastClaim ? `Catch a lie → +${game.lastClaim.risk * 2}` : 'No play to check'}</span></button>
                <button className="action play" disabled={!myTurn || selected.length === 0} onClick={play}><strong>PLAY {selected.length || ''}</strong><span>◇ {risk} if safe</span></button>
              </div>
            </div>
            <div ref={handScroll} className="cards" aria-label="Your hand"><div className="cards-track">{game.hand.map((card, index) => <PlayingCard key={card.id} card={card} index={index}
              selected={selected.includes(card.id)} disabled={!myTurn} onClick={() => setSelected(items => items.includes(card.id) ? items.filter(id => id !== card.id) : [...items, card.id])} />)}</div></div>
          </section>}
        </section>
      </div>
    </motion.div>
  )
}

function PlayingCard({ card, selected, disabled, onClick, index }: { card: Card; selected: boolean; disabled: boolean; onClick: () => void; index: number }) {
  const special = card.rank === 'SPELL'
  const red = card.suit === 'HEARTS' || card.suit === 'DIAMONDS'
  const suit = special ? '✦' : { SPADES: '♠', HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣' }[card.suit]
  return <motion.button layout aria-label={`${card.rank} of ${card.suit.toLowerCase()}`} aria-pressed={selected} className={`playing-card ${special ? 'spell-card' : ''} ${red ? 'red' : ''} ${selected ? 'selected' : ''}`} disabled={disabled} onClick={onClick}
    initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: selected ? -22 : 0 }} transition={{ delay: Math.min(index * .025, .35) }}>
    <span>{special ? "SPELL" : card.rank}<small>{suit}</small></span><b>{suit}</b>{special && <em className="spell-card-label">10 SECOND<br />SPELLING TRAP</em>}<span className="bottom">{special ? "SPELL" : card.rank}<small>{suit}</small></span>
  </motion.button>
}

function IdentityName({ name, tag }: { name: string; tag: string }) {
  return <span className="identity-name">{name}<small>#{tag}</small></span>
}

function PresenceStatus({ status }: { status: Member['presence'] }) {
  const label = status === 'ACTIVE' ? 'HERE' : status === 'AWAY' ? 'ONLINE' : 'OFFLINE'
  return <b className={`presence-status ${status.toLowerCase()}`}><i />{label}</b>
}

function ProfileEditor({ player, onClose }: { player: Player; onClose: () => void }) {
  const renamePlayer = useGameStore(s => s.renamePlayer)
  const loading = useGameStore(s => s.loading)
  const error = useGameStore(s => s.error)
  const [name, setName] = useState(player.displayName)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    await renamePlayer(name.trim())
    if (!useGameStore.getState().error) onClose()
  }
  return <Modal label="Change your nickname" onClose={onClose}>
    <motion.form className="modal-card profile-editor" initial={{ y: 24, scale: .97 }} animate={{ y: 0, scale: 1 }} onSubmit={submit} onMouseDown={event => event.stopPropagation()}>
      <div className="modal-kicker">DEVICE IDENTITY</div><h2>Change your nickname.</h2>
      <p>Your identity tag remains <strong>#{player.identityTag}</strong>, even when names overlap.</p>
      <label>NICKNAME<input autoFocus maxLength={24} value={name} onChange={event => setName(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary compact" disabled={!name.trim() || loading}>Save name <b>→</b></button></div>
    </motion.form>
  </Modal>
}

function ConfirmDelete({ room, onCancel, onConfirm }: { room: RoomSummary; onCancel: () => void; onConfirm: () => void }) {
  return <Modal label={`Delete ${room.name}`} onClose={onCancel}>
    <motion.div className="modal-card delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" initial={{ y: 24, scale: .97 }} animate={{ y: 0, scale: 1 }} onMouseDown={event => event.stopPropagation()}>
      <div className="modal-kicker danger-text">UNRECOVERABLE</div><h2 id="delete-title">Delete “{room.name}”?</h2>
      <p>This permanently deletes the table, every table membership, and every balance earned here.</p>
      <div className="modal-actions"><button className="secondary" onClick={onCancel}>Keep room</button><button className="primary destructive" onClick={onConfirm}>Delete permanently</button></div>
    </motion.div>
  </Modal>
}

const roomMoods = ['Velvet', 'Midnight', 'Golden', 'Lucky', 'Quiet', 'Scarlet', 'Silver', 'Secret']
const roomPlaces = ['Casino', 'Parlor', 'Hideaway', 'Penthouse', 'Cabaret', 'Saloon', 'Lounge', 'Club']
function randomRoomName() {
  return `${roomMoods[Math.floor(Math.random() * roomMoods.length)]} ${roomPlaces[Math.floor(Math.random() * roomPlaces.length)]}`
}

function initials(name?: string) { return (name || '?').split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase() }
function timeAgo(value: string) { const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); return mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago` }
