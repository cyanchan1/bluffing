# Bluff Table

Multiplayer Liar’s Deck with a React/TypeScript frontend and Java/Spring Boot backend.

## Requirements

Java 21, Node.js 24.15+ (or 22.22.2+), npm, PostgreSQL 16, and Linux with Bash, `curl`, `setsid`, and `timeout`. Use the included Gradle wrapper; a system Gradle installation is not needed. Run the following commands from the project root.

## Database

Choose one option. The examples use local development credentials.

### Podman

```bash
podman run -d --name blufftable-db \
  -e POSTGRES_DB=blufftable \
  -e POSTGRES_USER=blufftable \
  -e POSTGRES_PASSWORD=blufftable \
  -p 127.0.0.1:5432:5432 \
  -v blufftable-data:/var/lib/postgresql/data \
  docker.io/library/postgres:16-alpine
```

On later runs: `podman start blufftable-db`. Stop with `podman stop blufftable-db`; the named volume preserves data.

### Docker

```bash
docker compose up -d db
```

Stop with `docker compose stop db`. Do not delete the database volume if you want to keep rooms and balances.

### Existing PostgreSQL

Create a database and owner with your PostgreSQL administrator account:

```sql
CREATE USER blufftable WITH PASSWORD 'choose-a-password';
CREATE DATABASE blufftable OWNER blufftable;
```

Set these variables in the terminal used to start the app:

```bash
export DB_URL='jdbc:postgresql://localhost:5432/blufftable'
export DB_USERNAME='blufftable'
export DB_PASSWORD='choose-a-password'
```

Without overrides, the backend uses database `blufftable` on `localhost:5432`, with username/password `blufftable`. Schema migrations run automatically on startup. Environment variables must be exported; scripts do not load `.env` files.

## Build

```bash
bash scripts/build.sh
```

Installs locked frontend dependencies and builds both parts without a running database:

- Backend: `server/build/libs/bluff-table.jar`
- Frontend: `frontend/dist/`

To build separately:

```bash
bash ./gradlew :server:bootJar
npm --prefix frontend ci --include=optional
npm --prefix frontend run build
```

## Run

With PostgreSQL running, install dependencies once and start both development servers:

```bash
npm --prefix frontend ci --include=optional
bash scripts/start-dev.sh
```

Open **http://localhost:5173**. The launcher waits for the backend on port **8080**, then starts Vite. Vite proxies `/api` and `/ws` to the backend. Ctrl+C stops both servers and leaves PostgreSQL running.

Optional overrides:

```bash
PORT=8081 BLUFF_STARTUP_TIMEOUT=180 bash scripts/start-dev.sh
```

`PORT` changes the backend port and aligns the frontend proxy automatically. `BLUFF_STARTUP_TIMEOUT` is the readiness timeout in seconds (default `120`). Install dependencies on the machine where you run the app; do not copy `node_modules` between operating systems.

To run the built backend separately:

```bash
java -jar server/build/libs/bluff-table.jar
```

The jar requires PostgreSQL and serves only the backend. To serve `frontend/dist/`, configure a web server with SPA fallback and reverse proxies for `/api` and `/ws` (including WebSocket upgrades). Keep both behind the same origin. The combined launcher is the ready-to-use local/Tailscale option.

## Tailscale

Install Tailscale on the server and player devices and connect them to your tailnet. On the Linux server:

```bash
sudo systemctl enable --now tailscaled
sudo tailscale up
```

With PostgreSQL running and frontend dependencies installed:

```bash
bash scripts/start-dev.sh --tailnet
```

The launcher verifies Tailscale connectivity, starts both servers, and configures Tailscale Serve. Open the printed `https://<machine>.<tailnet>.ts.net` URL on devices allowed by your tailnet policy. If Tailscale requests HTTPS/Serve enablement, follow its setup link and retry. This uses private Serve, not public Funnel; the backend stays on loopback.

If Serve reports a permission error, grant your local user permission once:

```bash
sudo tailscale set --operator="$USER"
```

To configure Serve separately after starting the app, inspect it, or disable it:

```bash
bash scripts/network/tailscale.sh
tailscale serve status
tailscale serve --https=443 off
```

Ctrl+C stops the app but preserves the Serve mapping for the next run.
