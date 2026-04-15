# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start both server and client in parallel (development mode)
- `npm run build` - Build client for production (outputs to `client/dist/`)
- `npm run start` - Start server only (also serves static client in production)

Server runs on `http://localhost:3001`. Client dev server proxies `/api` and `/ws` to the server via Vite config.

## Architecture

npm workspace monorepo with two packages:

### Server (`server/`)
Node.js + Express backend with WebSocket support. Uses CommonJS modules.

- **`index.js`** - Entry point. Creates Express app, HTTP server, WebSocket server (`/ws`), initializes collectors, mounts API routes.
- **`collectors/`** - Each network config category has a collector extending `BaseCollector` (`base.js`). Subclasses implement `async collect() -> Map<string, string>`. The base class provides `poll()` (collect + diff against last state) and `diff()` (detects added/removed/modified entries). Collectors execute platform-specific shell commands (Windows/macOS).
- **`services/database.js`** - SQLite via `better-sqlite3`. Three tables: `snapshots`, `config_items`, `changes`. All queries use prepared statements returned from `init()`.
- **`services/polling.js`** - `PollingService` runs each collector on its own interval, persists changes to DB, and broadcasts via WebSocket.
- **`routes/`** - REST API endpoints: `/api/status`, `/api/snapshots` (CRUD + diff), `/api/changes` (query/filter/latest).

### Client (`client/`)
React 18 SPA with Vite. Uses ES modules.

- **Pages**: Dashboard (real-time monitoring), Snapshots (CRUD), DiffView (compare two snapshots), Timeline (historical changes).
- **`hooks/useWebSocket.js`** - WebSocket connection with exponential backoff reconnection. Returns `{ connected, lastChange, status }`.
- **`api/index.js`** - Thin fetch wrapper for all REST endpoints.
- **`data/categoryGuide.js`** - Category metadata and diagnostic command references.

### Monitored Categories
Route table, DNS config, network adapters, system proxy, firewall rules, hosts file, ARP/connections. Each has its own collector with platform-specific command execution and parsing.

### Data Flow
Collectors poll at category-specific intervals (2-10s) → `PollingService` diffs against previous state → changes persisted to SQLite → broadcast to WebSocket clients → React Dashboard updates in real-time.

## Tech Stack

- **Server**: Express, better-sqlite3 (WAL mode), ws (WebSocket), cors
- **Client**: React 18, React Router 6, Ant Design 5, dayjs, Vite 6
- **Database**: SQLite (`data/monitor.db`, gitignored)
- **No testing framework or linter configured**

## Key Patterns

- **Collector pattern**: Extend `BaseCollector`, implement `collect()` returning a `Map<string, string>`. Register in `server/index.js`.
- **Prepared statements**: `database.init()` returns an object of prepared statements passed to routes and polling service.
- **Production mode**: Set `NODE_ENV=production` to serve static client files and enable SPA fallback routing.
