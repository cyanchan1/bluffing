# Bluff Table

A reusable multiplayer card-game framework with a first game, **Liar's Deck**. Rooms persist in PostgreSQL; live games run through a server-authoritative game engine and are synchronized over WebSocket.

## Run locally

Prerequisites: Java 21+, Node 22.13+ (Node 24 recommended), and either Docker, Podman, or a PostgreSQL 16 database.

### Start PostgreSQL with Podman

Use this when `docker` is not installed:

```bash
podman run -d \
  --name blufftable-db \
  -e POSTGRES_DB=blufftable \
  -e POSTGRES_USER=blufftable \
  -e POSTGRES_PASSWORD=blufftable \
  -p 5432:5432 \
  -v blufftable-data:/var/lib/postgresql/data \
  docker.io/library/postgres:16-alpine
```

On later runs, restart the existing container with:

```bash
podman start blufftable-db
```

Install frontend dependencies once:

```bash
cd frontend
npm install
cd ..
```

Then start the backend and frontend together:

```bash
./scripts/start-dev.sh
```

### Start PostgreSQL with Docker

```bash
docker compose up -d db
./scripts/start-dev.sh
```

Open `http://localhost:5173`. Vite proxies `/api` and `/ws` to Spring Boot on port `8080`.

The combined start script starts Spring Boot first and waits until startup and interrupted-room recovery are complete before opening Vite. This prevents browsers or the existing Tailscale mapping from sending API requests to a backend that is still starting. Both development servers share one terminal and stop when you press Ctrl+C; a startup failure or process exit also cleans up the other server. PostgreSQL remains running so room balances survive application restarts. Gradle uses a plain console so its progress display does not overwrite application errors.

The launcher checks Vite's runtime before starting either server and invokes Gradle, Vite and the Tailscale helper through their interpreters to tolerate missing executable bits in copied checkouts. Install `frontend/node_modules` on the machine where you run the game; do not copy it between Windows and Linux. To rebuild a copied dependency folder while retaining the locked versions, move that `node_modules` folder aside, then run `npm ci --include=optional` inside `frontend`.

The account opened through `http://localhost:5173` or `http://127.0.0.1:5173` is treated as the server runner and receives persistent **ROOT** access on that device identity. Root can delete any room and kick any player. Tailnet visitors are normal accounts unless their already-root device identity is being reused.

The backend defaults to `jdbc:postgresql://localhost:5432/blufftable` with username/password `blufftable`. Override with `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`.

`PORT` changes the backend port and the launcher keeps Vite's REST/WebSocket proxy and local identity API aligned with it. `BLUFF_STARTUP_TIMEOUT` controls each server's readiness deadline in seconds (default `120`); every HTTP probe also has a short timeout. With a custom `DB_URL`, Spring Boot checks that database instead of the launcher requiring a local PostgreSQL listener.

## Share privately with Tailscale

This exposes only the Vite gateway to your tailnet. PostgreSQL and Spring Boot remain behind the local proxy and are not opened directly to the network. HTTPS is terminated by Tailscale Serve, and the existing `/ws` proxy carries secure WebSocket connections without additional client configuration.

After PostgreSQL is running and frontend dependencies are installed, start the complete application and Tailscale gateway with one command:

```bash
./scripts/start-dev.sh --tailnet
```

This verifies Tailscale is connected before launching the servers, starts Spring Boot and then Vite, configures Tailscale Serve after both are ready, and prints the private `https://<machine>.<tailnet>.ts.net` URL. Only devices and users permitted by your tailnet access policy can reach it. Press Ctrl+C to stop both application servers; the Tailscale Serve mapping remains configured for the next run.

Tailscale must already be connected. On Linux, initialize it once with:

```bash
sudo systemctl enable --now tailscaled
sudo tailscale up
```

If Tailscale reports `serve config denied`, grant your local account permission to manage Serve once, then rerun the script:

```bash
sudo tailscale set --operator=$USER
```

You can also manage only the Tailscale mapping while the application is already running:

```bash
./scripts/tailscale-serve.sh
```

To inspect or disable the proxy later:

```bash
tailscale serve status
tailscale serve --https=443 off
```

This integration uses Tailscale Serve, not Funnel, so it does not publish the game to the public internet.

A later `ws proxy error: ECONNRESET` means an established WebSocket was reset by a peer or the network; it does not, by itself, identify a game-server bug. The browser reconnects automatically. During an active deal, a real disconnect still removes the player from that deal according to the game rules. Repeated resets should be investigated with the backend log and the affected device's network state; proxy errors are kept visible.

Creating, joining, and opening tables use HTTP and remain available while the live connection reconnects. The waiting room enters live presence after authentication succeeds; starting a deal still requires every seated player to be active. A connection notice and **Reconnect now** control appear in the lobby, with **RECONNECT** also available in the room header. Connection/authentication attempts and HTTP requests time out after 12 seconds instead of leaving controls stuck. Automatic live retries back off up to 10 seconds, and returning to the tab or regaining network connectivity also retries. Rejected live authentication restores the existing device credential before retrying; room creation is never automatically repeated after an uncertain HTTP result.

## Architecture

- `server`: Spring MVC REST for lobby commands, a raw JSON WebSocket for game commands/events, JPA for persistent rooms, memberships, and money.
- `frontend`: React + TypeScript + Vite, Zustand state, Motion animations, and responsive CSS.
- `device identity`: the browser creates a 256-bit credential once. PostgreSQL stores only its SHA-256 hash; authenticated REST requests and the WebSocket handshake restore the same player and room balances on later visits.
- `identity tags`: duplicate nicknames are allowed. Every player also exposes a stable short `#tag` derived from their device-bound account, and nicknames can be changed from the profile menu without changing that identity.
- `presence`: authenticated WebSocket sessions distinguish players who are in the room, online elsewhere, or offline. The lobby reports both durable seated players and currently active seated players (non-member root spectators do not count). Server ping/pong checks remove broken connections after at most approximately 75 seconds; normal closes are handled immediately. Another connected tab in the same room keeps the account present.
- `durable kicks`: kicking deactivates a room seat but retains that account's room balance. Rejoining restores the same membership and balance. Deleting the room is the only operation that permanently removes its memberships and balances.
- `GameEngine`: game-type boundary. A room declares its game type and the matching engine owns game commands and snapshots.
- `LiarsDeckEngine`: in-memory, lock-protected authoritative match state. Room membership and balances remain durable between matches.
- If the server restarts during a live match, the volatile match is intentionally abandoned and the durable room returns to `LOBBY` instead of becoming stuck.

## Liar's Deck rules implemented

- Host selects deck count and either an automatic hand size (`floor(decks * 52 / players)`) or a custom hand size.
- Every seated player must be inside the room before starting. Away/offline seats must return or be kicked by the host/root.
- Leaving the room or losing the last room connection removes the player from the current deal permanently. They cannot rejoin that ongoing deal. Remaining players continue in order; the departing hand and unresolved pool are discarded without payout. Room membership and money remain intact.
- With at most one participant remaining, the deal ends automatically without a winner bonus. The table returns to setup. Root and the room host may inspect an ongoing game as spectators, but cannot regain a removed hand.
- The initializer chooses a declared rank and plays one or more cards face down. Later plays inherit that rank.
- Fold advances the turn and does not change the last claim. After every player folds once without a new play, the pool vanishes, Recent plays is cleared for every viewer, and the player who made the final fold initializes a new pool. Play IDs continue increasing so clearing history cannot replay or suppress later play animations.
- Challenge tests the most recent non-folded claim. Only the player who initiated that Truth Check receives the challenged cards, whether truthful or a bluff, in their history and verdict receipt. All other players, including the defender and root spectators, see the card count and verdict without card faces. The server filters both snapshots and receipts per viewer; earlier unchallenged plays stay hidden. A liar takes the full pool and the challenger initializes next; otherwise the challenger takes the pool and the challenged player initializes next. A Truth Check does not itself clear Recent plays.
- You cannot challenge your own claim after other players fold.
- An empty hand is a pending win: the final claim can still be challenged. A replacement play, all opponents folding, or a truthful check confirms victory. A caught bluff returns the pool to the player and the deal continues.
- Each claim has risk `10 × generation × cards played`. It starts **pending**, not spendable. Once another play replaces it, it can no longer be checked: its base risk is paid immediately, without revealing whether it was a bluff. A single fold does not secure a claim; a complete fold cycle pays the final unresolved claim before clearing the pool. Earlier secured claims are never paid twice or revoked by later checks.
- A successful Truth Check pays the challenger `2 × risk`; a failed check pays the truthful defender `2 × risk`. The bluffer/unsuccessful challenger earns nothing from that check. An accepted final play secures its base risk (or double risk for a truthful check) plus the existing `100 + 25 × decks` winner bonus. A deal ending with one or fewer players, or a host/root forced stop, restores every participant's room wallet to its persisted pre-deal checkpoint; none of that aborted deal's rewards survive.
- In-game wallets separate **confirmed earnings this game**, **awaiting verdict**, and the **spendable room balance**. Game earnings are gross rewards, not the room-balance delta (buying skins does not subtract from game earnings). Structured, sequential server receipts drive verdicts, private revealed cards and payout animations without parsing log strings or replaying duplicate snapshots. The round-order strip keeps player seats in a fixed order and moves a **NOW** highlight as turns advance, including wraparound. Departed players are removed without changing the remaining players' original seat numbers.

## Room rankings and emergency stop

Each room keeps durable **total wins**, **current win streak**, and **best win streak** per account. The gold champions board ranks total wins; the coral streak board ranks personal bests and highlights current streaks. Equal scores share a rank. Kicked/offline players remain on the boards, and their records return with them when they rejoin. Records start from this update; older games had no saved result history to reconstruct.

Only games with an actual winner count. The winner adds one win and extends their streak; other players who entered that deal reset their current streak, including anyone who left or was kicked. Sitting out a deal does not affect a streak. Forced stops, insufficient-player endings, and server restarts do not change rankings.

The host and root can use **Stop deal** from the table toolbar, including when the room is stuck in `IN_GAME` without an engine session. They may inspect a deal as moderators after leaving, but cannot regain a removed hand. A confirmation explains that the pool is discarded and every participant's wallet returns to its balance from before the deal. The checkpoints are stored in PostgreSQL, so interrupted-server recovery performs the same rollback. Every viewer returns to setup with a shared notice. The API checks the confirmed game ID so a stale stop request cannot terminate a newer deal.

## Personal deck collection (per room)

The shop sells **Aurora** (750 coins), **Supernova** (1,750), and **Prism** (3,500); the House deck is free. A purchase spends the buyer's balance in that room and unlocks/equips the skin **only for that player in that room**. Other players must buy their own editions. Purchases are serialized and charged once, including simultaneous requests. These are gameplay coins, not real money. New editions are purchased between deals so an abort cannot create a free unlock; owned editions can still be equipped during a deal with **My deck**.

Everyone sees the current player's edition on the animated table backdrop, glowing frame, and named “On stage” banner. The pool card backs show the **last claimant's** edition, so advancing the turn does not incorrectly recolor someone else's play. Equipment changes broadcast immediately to all viewers. The designs use original foil waves, stellar spirals, and chromatic interference. Animation pauses off-screen/in background tabs, respects reduced-motion preferences, and has CSS fallbacks when WebGL is unavailable. Ownership/equipment survive kicks and restarts; deleting the room removes these room-specific purchases.

Migrations `V5__player_skins_and_room_records.sql` and `V6__game_balance_snapshots.sql` run automatically on backend restart. V6 adds the persisted pre-deal wallet checkpoint used by abort and interrupted-server recovery. Because V4 shared purchases did not record who paid, V5 copies existing room unlocks/equipment to **all existing memberships, including inactive ones**, preserving previous access. New members do not inherit those unlocks. Legacy tables remain as migration history but are no longer used by the app. Restart the backend after updating; an already-running JVM does not load new rules or API fields.

## Clear application data (destructive)

Stop the backend first, then inspect the target:

```bash
./scripts/clear-database.sh --container blufftable-db --dry-run
./scripts/clear-database.sh --container blufftable-db
```

The script supports Podman/Docker (`--runtime podman` / `--runtime docker`) and installed PostgreSQL clients (`--local`, password through `PGPASSWORD`). Use `--database`, `--user`, `--host`, and `--port` for a custom database. `--backend-port` defaults to 8080; `DB_URL` is deliberately not inferred. Run `--help` for all options.

It requires the exact confirmation `CLEAR <database-name>`, creates and checks a private backup under `.backups/` (or `--backup PATH`, never overwritten), then truncates only the known application tables in a transaction. It refuses system databases, a listening backend, and other active database connections. Unknown foreign-key dependencies cause rollback—there is no cascading wipe.

This deletes **all accounts, rooms, balances, records and skins**, but keeps schema and Flyway history. Restart the backend and reload browsers afterwards; accounts will be recreated. Backups contain private application data; `.backups/` is git-ignored. To restore a container backup with the backend stopped:

```bash
podman exec -i blufftable-db pg_restore -U blufftable -d blufftable --clean --if-exists < .backups/YOUR_BACKUP.dump
```

Choose the exact backup and database; restoring replaces the database objects from that backup.

## API overview

- `GET /api/health` — unauthenticated process health check
- `POST /api/players` — creates, restores, or migrates a device identity
- `PATCH /api/players/me` — changes the authenticated account nickname
- `GET /api/rooms`
- `POST /api/rooms`
- `POST /api/rooms/{roomId}/join`
- `DELETE /api/rooms/{roomId}`
- `DELETE /api/rooms/{roomId}/players/{playerId}` — host/root kick; preserves that player's room balance
- `POST /api/rooms/{roomId}/start`
- `POST /api/rooms/{roomId}/stop` — host/root only; `{ "gameId": "<confirmed-game-uuid>" }` (null only when no engine state exists)
- `GET /api/rooms/{roomId}/snapshot`
- `POST /api/rooms/{roomId}/skins/purchase` — `{ "skinId": "AURORA" }`; unlock and equip
- `PUT /api/rooms/{roomId}/skins/equip` — equip the authenticated player's owned skin in this room
- Room snapshots include public player editions and win records, plus the viewer's own skin catalog
- WebSocket `/ws`, authenticated first with `AUTH`, then commands: `PLAY`, `FOLD`, `CHALLENGE`

Every room endpoint requires `Authorization: Bearer <device-token>`. The raw credential never enters the database. Clearing this site's browser storage intentionally creates a new identity; copying the credential to another browser transfers that identity, so treat it as a private secret.

## Verification

```bash
./gradlew :server:test
node scripts/tests/start-dev.test.mjs
cd frontend
npm test
npm run build
```

The Java suite covers readiness, departures, multi-tab presence, start gating, persistent balances, personal purchases, wins/streaks and emergency-stop permissions/recovery. Launcher tests run isolated mock services to verify startup ordering, copied scripts, dependency failures, disconnected Tailscale, timeouts and process cleanup without touching a database or Tailscale configuration. Frontend regressions cover lobby actions during reconnects, handshake/authentication and HTTP timeouts, device restoration, duplicate retry prevention, stale navigation, tied rankings, and turn-versus-pool edition ownership. The PostgreSQL/WebSocket smoke test completes actual games and checks payouts, records, individual purchases and no-payout stops.

For real PostgreSQL/WebSocket smoke tests, run a separate backend against a **disposable database** and then `QA_ORIGIN=http://127.0.0.1:8181 node scripts/smoke-test.mjs`. This script creates test accounts and deletes its own room. Optional separate frontend QA: set `BLUFF_BACKEND_URL=http://127.0.0.1:8181` and `VITE_LOCAL_API_URL=http://127.0.0.1:8181`, then run `npm run dev -- --port 5174`. Do not point a second backend at a live database: startup intentionally releases interrupted games.
