// Run only against a disposable QA database/server. Creates and deletes its own test room.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:8181'
const connections = []
async function request(player, path, body, method = 'POST', expected = 200) {
  const response = await fetch(`${origin}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${player.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.equal(response.status, expected, `${path}: ${await response.clone().text()}`)
  return expected === 204 ? null : response.json()
}
async function account(name) {
  const token = randomBytes(32).toString('hex')
  const player = await request({token}, '/players', {displayName: name, deviceToken: token})
  return {...player, token}
}
async function connect(player) {
  const ws = new WebSocket(origin.replace(/^http/, 'ws') + '/ws')
  const messages = []
  ws.addEventListener('message', event => messages.push(JSON.parse(event.data)))
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  const send = (type, payload = {}) => ws.send(JSON.stringify({type, payload}))
  const wait = async (predicate) => {
    const until = Date.now() + 5000
    while (Date.now() < until) {
      const index = messages.findIndex(predicate)
      if (index >= 0) return messages.splice(index, 1)[0]
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for websocket event: ${JSON.stringify(messages)}`)
  }
  send('AUTH', {deviceToken: player.token}); await wait(message => message.type === 'CONNECTED')
  connections.push(ws)
  return {send, wait, ws}
}

const host = await account('Smoke host'), guest = await account('Smoke guest'), third = await account('Smoke third')
let room
try {
  const h = await connect(host), g = await connect(guest), t = await connect(third)
  room = await request(host, '/rooms', {name: 'Disposable smoke test', gameType: 'LIARS_DECK'}, 'POST', 201)
  await request(guest, `/rooms/${room.id}/join`)
  await request(third, `/rooms/${room.id}/join`)
  h.send('SYNC_ROOM', {roomId:room.id})
  await h.wait(m => m.type === 'ROOM_STATE' && m.payload.players.find(p => p.id === host.id).presence === 'ACTIVE')
  await request(host, `/rooms/${room.id}/start`, {deckCount:1,cardsPerPlayer:5}, 'POST', 409)
  g.send('SYNC_ROOM', {roomId:room.id}); t.send('SYNC_ROOM', {roomId:room.id})
  await h.wait(m => m.type === 'ROOM_STATE' && m.payload.players.every(p => p.presence === 'ACTIVE'))
  await request(host, `/rooms/${room.id}/start`, {deckCount:1,cardsPerPlayer:5})
  await h.wait(m => m.type === 'ROOM_STATE' && m.payload.game?.phase === 'ACTIVE')
  g.send('LEAVE_ROOM')
  await h.wait(m => m.type === 'ROOM_STATE' && m.payload.game?.hands.length === 2)
  g.send('SYNC_ROOM', {roomId:room.id})
  await g.wait(m => m.type === 'ROOM_REJECTED')
  t.ws.close()
  const ended = await h.wait(m => m.type === 'ROOM_STATE' && m.payload.game?.phase === 'FINISHED')
  assert.equal(ended.payload.status, 'LOBBY')
  assert.equal(ended.payload.game.winnerId, null)
  assert.equal(ended.payload.players.length, 3)
  assert.ok(ended.payload.players.every(p => p.balance === 0))
  await request(host, `/rooms/${room.id}/skins/purchase`, {skinId:'AURORA'}, 'POST', 409)
  await request(host, `/rooms/${room.id}/skins/equip`, {skinId:'CLASSIC'}, 'PUT')
  // Complete actual deals, exercising durable payouts and records (not seeded counters).
  await request(host, `/rooms/${room.id}/players/${third.id}`, undefined, 'DELETE', 204)
  g.send('SYNC_ROOM', {roomId:room.id})
  await g.wait(m => m.type === 'ROOM_STATE' && m.payload.status === 'LOBBY' && m.payload.players.every(p => p.presence === 'ACTIVE'))
  async function winHost() {
    const started = await request(host, `/rooms/${room.id}/start`, {deckCount:1,cardsPerPlayer:3})
    if (started.game.currentPlayerId !== host.id) {
      const snapshot = await request(guest, `/rooms/${room.id}/snapshot`, undefined, 'GET')
      g.send('GAME_COMMAND',{roomId:room.id,action:'PLAY',cardIds:[snapshot.game.hand[0].id],declaredRank:'A'})
      await h.wait(m => m.type === 'ROOM_STATE' && m.payload.game?.gameId === started.game.gameId && m.payload.game.currentPlayerId === host.id)
    }
    const snapshot = await request(host, `/rooms/${room.id}/snapshot`, undefined, 'GET')
    h.send('GAME_COMMAND',{roomId:room.id,action:'PLAY',cardIds:snapshot.game.hand.map(c=>c.id),declaredRank:'A'})
    await g.wait(m => m.type === 'ROOM_STATE' && m.payload.game?.gameId === started.game.gameId && m.payload.game.pendingClaim?.playerId === host.id && m.payload.game.hands.find(hand => hand.playerId === host.id)?.cardCount === 0)
    g.send('GAME_COMMAND',{roomId:room.id,action:'FOLD'})
    const result = (await h.wait(m => m.type === 'ROOM_STATE' && m.payload.game?.gameId === started.game.gameId && m.payload.game.phase === 'FINISHED')).payload
    assert.equal(result.game.pendingClaim,null)
    assert.equal(result.game.earnings.find(entry=>entry.playerId === host.id).amount,125 + snapshot.game.generation * 30)
    assert.equal(result.game.outcomes.at(-1).type,'GAME_WON')
    return result
  }
  const wins = []
  for (let index = 0; index < 5; index++) wins.push(await winHost())
  const won = wins.at(-1)
  assert.equal(won.records.find(r=>r.playerId === host.id).wins,5)
  assert.equal(won.records.find(r=>r.playerId === host.id).bestStreak,5)
  const earned = wins.reduce((total, result) => total + result.game.earnings.find(e=>e.playerId === host.id).amount, 0)
  assert.equal(won.players.find(p=>p.id === host.id).balance,earned)
  const bought = await request(host, `/rooms/${room.id}/skins/purchase`, {skinId:'AURORA'})
  assert.equal(bought.players.find(p=>p.id === host.id).balance,earned - 750)
  const otherView = await request(guest, `/rooms/${room.id}/snapshot`, undefined, 'GET')
  assert.equal(otherView.skins.find(s=>s.id === 'AURORA').owned,false)
  assert.equal(otherView.players.find(p=>p.id === host.id).equippedSkin,'AURORA')
  await request(guest, `/rooms/${room.id}/skins/equip`, {skinId:'AURORA'}, 'PUT', 409)
  const next = await request(host, `/rooms/${room.id}/start`, {deckCount:1,cardsPerPlayer:3})
  await request(guest, `/rooms/${room.id}/stop`, {gameId:next.game.gameId}, 'POST', 403)
  const beforeStop = new Map(next.players.map(player => [player.id,player.balance]))
  const firstPlayer = next.game.currentPlayerId
  const firstClient = firstPlayer === host.id ? h : g
  const firstSnapshot = await request(firstPlayer === host.id ? host : guest, `/rooms/${room.id}/snapshot`, undefined, 'GET')
  firstClient.send('GAME_COMMAND',{roomId:room.id,action:'PLAY',cardIds:[firstSnapshot.game.hand[0].id],declaredRank:'A'})
  const advanced = (await h.wait(m => m.type === 'ROOM_STATE' && m.payload.game?.gameId === next.game.gameId && m.payload.game.currentPlayerId !== firstPlayer)).payload
  const secondPlayer = advanced.game.currentPlayerId
  const secondClient = secondPlayer === host.id ? h : g
  const secondSnapshot = await request(secondPlayer === host.id ? host : guest, `/rooms/${room.id}/snapshot`, undefined, 'GET')
  secondClient.send('GAME_COMMAND',{roomId:room.id,action:'PLAY',cardIds:[secondSnapshot.game.hand[0].id]})
  const credited = (await h.wait(m => m.type === 'ROOM_STATE' && m.payload.game?.gameId === next.game.gameId && m.payload.game.earnings.some(entry=>entry.amount > 0))).payload
  assert.ok(credited.players.find(player=>player.id === firstPlayer).balance > beforeStop.get(firstPlayer))
  const stopped = await request(host, `/rooms/${room.id}/stop`, {gameId:next.game.gameId})
  assert.equal(stopped.game,null)
  assert.equal(stopped.records.find(r=>r.playerId === host.id).currentStreak,5)
  assert.ok(stopped.players.every(player=>player.balance === beforeStop.get(player.id)))
  assert.match(stopped.notice,/restored to its pre-deal balance/)
  console.log('PASS: PostgreSQL migration, presence/departures, real game payouts, win/streak records, personal skin ownership, shared edition visibility, and pre-deal wallet rollback.')
} finally {
  if (room) await request(host, `/rooms/${room.id}`, undefined, 'DELETE', 204)
  connections.forEach(ws => ws.close())
}

if (process.env.QA_KEEP_BOTS === 'true') {
  const rooms = await request(host, '/rooms', undefined, 'GET')
  const visualRoom = rooms.find(r => r.name === 'Shader QA')
  assert.ok(visualRoom, 'Create the Shader QA room in the QA browser first')
  for (const player of [guest, third]) {
    await request(player, `/rooms/${visualRoom.id}/join`)
    const client = await connect(player); client.send('SYNC_ROOM', {roomId:visualRoom.id})
  }
  console.log('Visual QA guests are connected to Shader QA; stop this process when finished.')
  await new Promise(() => {})
}
