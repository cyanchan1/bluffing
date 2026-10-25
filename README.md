# Bluff Table

A reusable multiplayer card-game framework with a first game, **Liar's Deck**. Rooms persist in PostgreSQL; live games run through a server-authoritative game engine and are synchronized over WebSocket.

Based on [tttsaurus/bluffing](https://github.com/tttsaurus/bluffing), with macOS launch helpers and expanded deployment documentation.

## Install once

Run commands from the repository root unless a step explicitly changes directory. Choose the macOS or Linux setup below; they are alternatives. These instructions run Spring Boot and the Vite development server locally, not a production hosting stack.

```bash
git clone https://github.com/cyanchan1/bs.git
cd bs
```

### macOS with Homebrew

Install [Homebrew](https://brew.sh/) first if it is unavailable. Then install the runtimes and helper commands:

```bash
brew install openjdk@21 node@24 postgresql@16 bash coreutils
source scripts/local-env.sh
/usr/bin/python3 --version
chmod +x scripts/macos-bin/setsid scripts/macos-bin/tailscale
printf '\n.local/\n' >> .git/info/exclude
```

The macOS adapter requires `/usr/bin/python3`; install Apple's Command Line Tools if it is missing. The launcher uses Homebrew's modern Bash (`wait -n` support), GNU coreutils (`timeout`), and a Python `setsid` adapter for process groups. It selects Java 21 and Node 24 without changing your shell profile or the system Java default. Docker/Podman is not needed for this setup.

### Linux with Docker, Podman, or native PostgreSQL

Install Java 21, Node 22.22.2+ or 24.15+ (Node 24 recommended), and either Docker, Podman, or PostgreSQL 16. The launcher also requires Bash 4.3+, `curl`, `setsid` (usually util-linux), and `timeout` (usually GNU coreutils). CI tests Java 21 and both Node 22 and 24. The shell commands below are not native Windows PowerShell commands; use an appropriate Linux environment such as WSL.

### Frontend dependencies — required for every setup

```bash
(cd frontend && npm ci --include=optional)
```

This installs the versions recorded in `package-lock.json`. Install dependencies on the machine where the game runs; do not copy `node_modules` between operating systems or CPU architectures. If a copied dependency folder fails to load, move it aside and repeat the locked install. The first backend launch downloads Gradle and Java dependencies and compiles the server. Later launches reuse the caches; they do not reinstall the whole project.

## Start locally

### macOS

```bash
bash scripts/start-local-macos.sh
```

The wrapper loads the Homebrew environment, initializes the project database only when missing, starts it if stopped, and then calls `start-dev.sh`. Existing data is reused. It records the launcher PID for `stop-local.sh`. Do not start a second pair while the first is running.

| Setting | macOS wrapper | Direct `start-dev.sh` / container defaults |
| --- | --- | --- |
| Frontend | `http://127.0.0.1:5173` | `http://127.0.0.1:5173` |
| Backend | `http://127.0.0.1:8080` | `http://127.0.0.1:8080` |
| PostgreSQL | `127.0.0.1:5433` | `localhost:5432` |
| Database / user / password | `blufftable` / `blufftable` / `blufftable` | Same defaults |
| Database storage | `.local/postgres` | Docker/Podman volume `blufftable-data` |
| Startup timeout per server | 600 seconds | 120 seconds |

The macOS wrapper explicitly sets `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`, overriding inherited values. To use a different database, configure the environment and call `start-dev.sh` directly instead. PostgreSQL logs go to `.local/postgres.log`; the saved launcher PID is `.local/app.pid`. Keep `.local/` out of version control and retain the data directory between runs. These credentials are for this local setup.

### Linux: start PostgreSQL using one option

**Docker:**

```bash
docker compose up -d db
```

**Podman, first run:**

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

**Podman, subsequent runs:**

```bash
podman start blufftable-db
```

For native PostgreSQL, create the database/user and start the database separately. The backend defaults to `jdbc:postgresql://localhost:5432/blufftable`; override with `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD` when calling `start-dev.sh` directly.

After the database is running and frontend dependencies are installed:

```bash
bash scripts/start-dev.sh
```

### What the launcher does

Open `http://127.0.0.1:5173` after the ready message. Vite proxies `/api` and `/ws` to Spring Boot. The launcher checks dependencies and occupied ports, starts Spring Boot, and waits for readiness and interrupted-room recovery before starting Vite. Both servers share a terminal; Ctrl+C, startup failure, or an unexpected server exit cleans up the pair. PostgreSQL remains running separately. Gradle uses a plain console so errors stay readable.

`PORT` overrides the backend port and keeps the frontend proxies aligned. `BLUFF_STARTUP_TIMEOUT` overrides each server's readiness deadline. With a custom `DB_URL`, the backend checks database availability instead of the launcher requiring a listener on 5432.

The account opened through `http://localhost:5173` or `http://127.0.0.1:5173` is treated as the server runner and receives persistent **ROOT** access on that device identity. Root can delete any room and kick any player. Remote visitors are normal accounts unless their already-root device identity is reused. Different origins (including `localhost`, `127.0.0.1`, and the HTTPS sharing URL) keep separate browser storage.

## Share with friends

| Mode | Visitor requirements | Entry point |
| --- | --- | --- |
| Local only | Same computer | `http://127.0.0.1:5173` |
| Tailscale Serve | Connected Tailscale client and access permission | Private HTTPS URL |
| Tailscale Funnel | Browser; no Tailscale client required | Public HTTPS URL |

Keep the host Mac/computer awake, online, and running the frontend, backend, database, and Tailscale while playing remotely. Share the URL printed by Tailscale, not `127.0.0.1` (which means the visitor's own computer).

### Prepare Tailscale

Install [Tailscale](https://tailscale.com/download) and connect it. On macOS, open Tailscale.app, sign in, and turn on the connection. The project wrapper finds the application's CLI in `/Applications` or `~/Applications` even when `tailscale` is not on the terminal PATH.

For manual Tailscale commands in a new macOS terminal, run these from the repository root first:

```bash
source scripts/local-env.sh
export PATH="$PWD/scripts/macos-bin:$PATH"
```

The standalone app also provides `/Applications/Tailscale.app/Contents/MacOS/Tailscale` as an absolute command path. On **Linux only**, initialize the daemon with:

```bash
sudo systemctl enable --now tailscaled
sudo tailscale up
```

On Linux, if Serve reports `serve config denied`, an administrator can grant the local account permission with `sudo tailscale set --operator="$USER"`. Do not use the Linux `systemctl` instructions on macOS.

### Private access: Serve

Friends must install and connect Tailscale and be allowed to access the host. Invite them to the tailnet or share the host machine through Tailscale's admin console and have them accept the invitation. See [device sharing](https://tailscale.com/docs/features/sharing).

Start on macOS:

```bash
bash scripts/start-local-macos.sh --tailnet
```

On Linux, with the database already running:

```bash
bash scripts/start-dev.sh --tailnet
```

Choose one command. It checks Tailscale connectivity, starts the application, then configures **Serve** and prints the private HTTPS URL. If the game is already running, use `bash scripts/tailscale-serve.sh` instead, after preparing the command environment above. Only the Vite gateway is forwarded; PostgreSQL and Spring Boot remain behind the local proxy.

### Public access: Funnel

Funnel makes the game reachable from the public internet. Start the game **without `--tailnet`** using the normal local command for your platform. Keep that terminal running; in a second terminal, prepare the Tailscale command environment as above, then run:

```bash
tailscale funnel --bg http://127.0.0.1:5173
tailscale funnel status
```

Complete Tailscale's authorization/HTTPS setup if prompted. Share the printed `https://<machine>.<tailnet>.ts.net/` URL. Friends do not need Tailscale. See [Funnel requirements and troubleshooting](https://tailscale.com/docs/features/tailscale-funnel).

`--tailnet` always configures Serve, not Funnel. The latest Serve/Funnel command for a port determines whether it is private or public, so running `--tailnet` again can switch port 443 back to private access. `Funnel on` confirms configuration, not successful public DNS or end-to-end connectivity. Verify using a device/network without Tailscale.

## Stop the servers

Closing a browser does not stop the game. Background Serve/Funnel mappings also remain configured after Ctrl+C. For a complete shutdown:

1. In a separate terminal, prepare the Tailscale command environment if needed, then close the sharing entry point. Choose the command for the active mode; skip this step if no mapping exists:

   ```bash
   # Funnel
   tailscale funnel --https=443 off
   # OR Serve
   tailscale serve --https=443 off
   ```

2. Press **Ctrl+C** in the game terminal. For a launch made through the macOS wrapper, you can instead run from the repository root:

   ```bash
   bash scripts/stop-local.sh
   ```

3. Stop the database using the option matching your setup, after the backend has finished shutting down:

   ```bash
   # Project-specific macOS database
   bash scripts/stop-local-db.sh
   # OR Docker
   docker compose stop db
   # OR Podman
   podman stop blufftable-db
   ```

4. Optionally disconnect Tailscale in its app if you no longer need other Tailscale connections.

**Stopping PostgreSQL does not delete its disk data or directly clear backend memory.** Stopping it while the backend is running prevents database reads/writes. Stopping the backend releases the live game state in memory; the current deal cannot resume. On restart, interrupted rooms return to the lobby and wallets are restored to their persisted pre-deal checkpoints. Saved accounts, rooms, balances, records, and skins survive normal shutdowns. Do not delete database storage/volumes or use `clear-database.sh` merely to stop playing.

## Troubleshooting

### Tailscale is installed but the command is missing

On macOS, use the macOS launcher or prepare the command environment shown above. Installing the GUI does not necessarily put a `tailscale` command on PATH. `Stopped` means the app was found but is disconnected; open it and connect. Reinstalling the game does not address this.

### Friends cannot open the URL

Check `tailscale funnel status`: `tailnet only` requires Tailscale and access permission; `Funnel on` indicates the public mode is configured. Confirm the app itself works:

```bash
curl --fail http://127.0.0.1:5173/api/health
```

A healthy application returns `{"status":"UP"}`. A failed local probe points to frontend/backend readiness; inspect their terminal output and database log. A browser `DNS_PROBE_FINISHED_NXDOMAIN` happens earlier: the domain could not be resolved.

For DNS failures, query the actual hostname printed by Tailscale (replace the example):

```text
nslookup YOUR-MACHINE.YOUR-TAILNET.ts.net 1.1.1.1
```

Tailscale documents that public DNS publication can take up to ten minutes. This is not a guarantee that waiting will fix every failure. If public resolvers still return NXDOMAIN, check [Tailscale status](https://status.tailscale.com/) and its support; if authoritative DNS also returns NXDOMAIN, clearing a visitor's cache cannot repair that missing public record. Do not mark public access as working based solely on `Funnel on`.

If public DNS resolves but a Windows visitor still sees an old lookup failure, they can wait for the cache to expire or run `ipconfig /flushdns`. This clears the whole Windows DNS client cache, not just this hostname; it does not change DNS settings or delete browser logins. Browsers may also keep their own DNS caches. Do not use a private `100.x` Tailscale address as a public replacement URL.

### First-time username screen and identities

For a fresh visitor experience, use a private/incognito window. To rename the existing account, use the profile menu. Clearing this site's browser storage removes its saved identity credential and can make the old identity inaccessible; it does not erase the old account from PostgreSQL. Clearing the database affects every player and does not clear browser storage, so it does not guarantee the first-time username screen appears.

### WebSocket reconnects

A later `ws proxy error: ECONNRESET` means an established WebSocket was reset by a peer or the network; it does not, by itself, identify a game-server bug. The browser reconnects automatically. During an active deal, a real disconnect still removes the player from that deal according to the game rules. Repeated resets should be investigated with the backend log and the affected device's network state; proxy errors are kept visible.

Creating, joining, and opening tables use HTTP and remain available while the live connection reconnects. The waiting room enters live presence after authentication succeeds; starting a deal still requires every seated player to be active. A connection notice and **Reconnect now** control appear in the lobby, with **RECONNECT** also available in the room header. Connection/authentication attempts and HTTP requests time out after 12 seconds instead of leaving controls stuck. Automatic live retries back off up to 10 seconds, and returning to the tab or regaining network connectivity also retries. Rejected live authentication restores the existing device credential before retrying; room creation is never automatically repeated after an uncertain HTTP result.

## Clear application data and restore backups

**This resets all players, not just your current browser. It is not a shutdown command.** Accounts, rooms, memberships, balances, records, and skin ownership are removed; table structure and Flyway migration history are retained. Database reset does not clear the browser's saved identity. Restart the backend and reload browsers afterwards; accounts can be recreated.

Stop the backend first and wait for it to exit. **Keep PostgreSQL running** so the script can back up and modify it. If you changed the backend port, pass `--backend-port` with that value. The script deliberately does not infer the target from `DB_URL`.

### macOS project database (port 5433)

From the repository root:

```bash
bash scripts/stop-local.sh
source scripts/local-env.sh
```

After the backend has stopped, inspect the target without changing anything:

```bash
bash scripts/clear-database.sh --local --host 127.0.0.1 --port 5433 \
  --database blufftable --user blufftable --dry-run
```

Only when intending to erase all game data, run:

```bash
PGPASSWORD=blufftable bash scripts/clear-database.sh --local \
  --host 127.0.0.1 --port 5433 --database blufftable --user blufftable
```

If the project database was already stopped, start only the existing cluster first (after sourcing `local-env.sh`):

```bash
pg_ctl -D "$PWD/.local/postgres" -l "$PWD/.local/postgres.log" \
  -o "-h 127.0.0.1 -p 5433 -k $PWD/.local" -w start
```

### Container database

Preview first, then run the second command only when intending to reset:

```bash
bash scripts/clear-database.sh --container blufftable-db --dry-run
bash scripts/clear-database.sh --container blufftable-db
```

Use `--runtime podman` or `--runtime docker` when needed. Native clients use `--local` and `PGPASSWORD`. Set `--database`, `--user`, `--host`, and `--port` explicitly for other targets; run `--help` for details.

The script requires typing `CLEAR <database-name>`, creates and checks a private backup under `.backups/` (or a new `--backup PATH`), then truncates known application tables in a transaction. It refuses system databases, a listening backend, other active database connections, and backup overwrites. Unknown foreign-key dependencies cause rollback, not a cascading wipe. Recovery requires restoring the backup; restarting alone will not bring erased data back.

### Restore a backup

Choose the exact backup and target database. **Restoring replaces database objects and data with the backup contents.** Keep the backend stopped and PostgreSQL running. Backups contain private application data; `.backups/` is git-ignored.

macOS, after `source scripts/local-env.sh` (replace `YOUR_BACKUP.dump`):

```bash
PGPASSWORD=blufftable pg_restore --exit-on-error --single-transaction \
  --host 127.0.0.1 --port 5433 --username blufftable --dbname blufftable \
  --clean --if-exists --no-owner --no-privileges .backups/YOUR_BACKUP.dump
```

Podman (use `docker` instead for Docker):

```bash
podman exec -i blufftable-db pg_restore --exit-on-error --single-transaction \
  -U blufftable -d blufftable --clean --if-exists --no-owner --no-privileges \
  < .backups/YOUR_BACKUP.dump
```

Then start the game normally and reload the browser.

## Script reference

Paths below are relative to `scripts/`. The macOS helper files must accompany this README when distributing or committing the setup; do not copy only the documentation.

| File | Purpose |
| --- | --- |
| `start-local-macos.sh` | Configure Homebrew tools, initialize/start the project database, save the launcher PID, then call `start-dev.sh`. |
| `local-env.sh` | Source into a shell to select the installed Java, Node, PostgreSQL, Bash, and coreutils tools; does not install them or add `macos-bin` to PATH. |
| `macos-bin/setsid` | Python adapter used by the launcher to create separate process sessions on macOS. |
| `macos-bin/tailscale` | Forward CLI arguments to Tailscale.app in `/Applications` or `~/Applications`. |
| `start-dev.sh` | Start backend, wait for readiness, start frontend, and clean up both on exit; database must already be running. |
| `stop-local.sh` | Stop the application launcher recorded by the macOS wrapper; leave PostgreSQL running. |
| `stop-local-db.sh` | Stop the project PostgreSQL cluster without deleting data. |
| `tailscale-serve.sh` | Check Tailscale and configure private Serve access for an already-running frontend; never enables Funnel. |
| `clear-database.sh` | Back up and clear all game data after explicit confirmation. |
| `ci-integration.sh` | Orchestrate migration, API/WebSocket, and browser checks against a disposable QA database. |
| `test-migration.mjs` | Check legacy database migration/backfill in an isolated schema, then roll back the test changes. |
| `smoke-test.mjs` | Exercise real game flows with test accounts and a test room; use only a disposable QA backend. |
| `tests/start-dev.test.mjs` | Check launcher ordering, failures, timeouts, and process cleanup using mock services. |
| `tests/clear-database.test.mjs` | Check reset argument validation and non-mutating previews. |
| `tests/ci-integration.test.mjs` | Check integration target guards and missing-artifact handling. |

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

On macOS, first run `source scripts/local-env.sh` and `export PATH="$PWD/scripts/macos-bin:$PATH"` from the repository root.

```bash
bash ./gradlew :server:check :server:bootJar
node scripts/tests/start-dev.test.mjs
node scripts/tests/clear-database.test.mjs
node scripts/tests/ci-integration.test.mjs
cd frontend
npm ci --include=optional
npm run typecheck
npm run test:coverage
npm run build
```

The Java suite covers readiness, departures, multi-tab presence, start gating, persistent balances, personal purchases, wins/streaks, emergency-stop permissions/recovery, token hashing/authentication boundaries, wallet arithmetic and reward locking. Launcher tests run isolated mock services to verify startup ordering, copied scripts, dependency failures, disconnected Tailscale, timeouts and process cleanup without touching a database or Tailscale configuration. Reset safety tests check invalid database names, arguments, ports, and non-mutating dry runs.

`npm test` runs the isolated store regressions plus Vitest presentation/component tests. These cover reconnects, HTTP/authentication timeouts, stale navigation, private receipts, pending-versus-paid wallets, stable turn seats, tied rankings, modal focus/dismissal and private card rendering. `npm run typecheck` checks the application **and test/configuration code**. Browser tests use real HTTP/WebSocket services, not mocked game state.

### Continuous integration

`.github/workflows/ci.yml` runs on every push, pull request, and manual dispatch. It needs no repository secrets and never connects to your running game database or Tailscale account.

| Job | Checks |
| --- | --- |
| Scripts and safety | Workflow validation, shell/JavaScript syntax, launcher regressions, database-reset safeguards, disposable integration-target guards |
| Frontend (Node 22 and 24) | Clean locked install, TypeScript checks, store/presentation/React component tests, V8 coverage gates, production build |
| Backend (Java 21) | Wrapper validation, JUnit/Mockito tests, H2 persistence tests, JaCoCo gates, executable Spring Boot jar |
| PostgreSQL/WebSocket/browser | Disposable PostgreSQL 16 service, legacy migration/backfill, fresh Flyway startup, complete game/payout/purchase/rollback scenarios, Chromium desktop and mobile tests |
| CI passed | Requires every job, including both frontend matrix entries, to succeed |

Frontend coverage gates apply to `presentation.ts`, `Modal.tsx`, `Leaderboards.tsx`, and `GameFeedback.tsx`: 80% lines/statements, 75% functions, 70% branches. The VM-isolated store suite runs separately and is not counted in those coverage figures. Backend gates cover all production classes: 75% lines and 60% branches. A coverage regression below a gate fails CI.

Test artifacts include JUnit XML, HTML/LCOV frontend coverage, JaCoCo HTML/XML, backend startup logs, and browser reports with failure screenshots/videos/traces (14-day retention). Successful builds also upload `frontend-dist` and `backend-jar` (7-day retention). Production jars use the stable filename `server/build/libs/bluff-table.jar`. There is no automatic deployment.

Actions are pinned to commit SHAs, checkout credentials are not persisted, the workflow token is read-only, dependency caches are enabled, and superseded runs are cancelled. Dependabot proposes weekly updates for Actions, npm and Gradle. In GitHub branch protection/rulesets, select **CI passed** as the required check after its first run; that repository setting is not changed by these files.

### Run the integration pipeline locally

Create a **new disposable database** (not `blufftable`), build the jar, and install the browser once:

```bash
podman exec blufftable-db createdb -U blufftable blufftable_localqa
bash ./gradlew :server:bootJar
(cd frontend && npm ci --include=optional && npx playwright install chromium)
QA_DATABASE=blufftable_localqa QA_RUNTIME=podman bash scripts/ci-integration.sh
```

The runner requires a `blufftable_*qa` database name, refuses an occupied backend port, starts its own backend on **8181**, and stops it on exit. Playwright starts/stops a separate Vite instance on **5174**. Neither port may already be in use. Browser tests run the same flows on desktop and mobile: persistent/duplicate identities, rename, create/join, host-only setup, play, challenger-only card reveals and forced-stop wallet rollback. Test rooms are removed, but QA accounts remain in this disposable database; remove it manually when finished. Do not reuse a database that contains real accounts or rooms.

Use `QA_RUNTIME=docker QA_CONTAINER=YOUR_CONTAINER` for Docker, or `QA_RUNTIME=local PGHOST=127.0.0.1 PGUSER=blufftable PGPASSWORD=...` with installed `psql`. `PGPORT`, `PGUSER` and `PGPASSWORD` configure the backend's loopback database connection; container mode defaults to container `blufftable-db`. Set `QA_SKIP_BROWSER=true` to run only migrations and HTTP/WebSocket scenarios. For an already-running **QA** backend on 8181, the browser suite alone is `cd frontend && npm run test:e2e`.

For real PostgreSQL/WebSocket smoke tests, run a separate backend against a **disposable database** and then `QA_ORIGIN=http://127.0.0.1:8181 node scripts/smoke-test.mjs`. This script creates test accounts and deletes its own room. Optional separate frontend QA: set `BLUFF_BACKEND_URL=http://127.0.0.1:8181` and `VITE_LOCAL_API_URL=http://127.0.0.1:8181`, then run `npm run dev -- --port 5174`. Do not point a second backend at a live database: startup intentionally releases interrupted games.

## SPELL trap card

Each deal gives every participant one additional black card with red `SPELL` lettering. The configured hand size counts ordinary cards; SPELL is added on top. It behaves as a wildcard matching the declared rank when checking a mixed play. Only a play consisting of exactly one SPELL card triggers the special effect when challenged; it need not be the player's last card.

The challenger takes the entire current pool, including SPELL. Its size is frozen as the spelling penalty. Every remaining participant, including the defender and challenger, hears the same difficult word. Normal play pauses and the shared fifteen-second server deadline starts immediately when the challenge triggers. There is no preparation stage or readiness button. Each player can submit once manually. Input edits are synchronized to the server as private drafts; at the deadline, the latest received draft is automatically submitted for anyone who has not submitted manually. Incorrect, blank or missing answers draw the frozen penalty in ordinary cards. Thus a challenger who takes seven cards and then fails spelling draws another seven. A reserve of undealt ordinary cards supplies penalties; when exhausted, another shuffled ordinary deck set is generated. No extra SPELL cards are generated.

The server validates the challenge ID, participant and deadline. Correctness and canonical spellings appear only after everyone submits or time expires. A defender with no cards cannot win until the challenge resolves. Case and surrounding whitespace are ignored; listed British/American variants are accepted. Participants leaving the deal are removed under the existing departure rules. A deal with fewer than two participants ends without a winner bonus.

The [2,000-word pack](scripts/vocabulary/words.txt) and [audio provenance/cache documentation](scripts/vocabulary/README.md) describe sourcing and deployment. Audio is fetched on demand and cached on disk rather than held in the game heap. The pack is a difficult general English spelling list, not an official TOEFL vocabulary. Restart the backend after updating the pack or rules; frontend changes reload through Vite during development.
