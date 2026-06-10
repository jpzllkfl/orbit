# Orbit — Plex-style media library

One container: React UI + Plex CORS proxy. Demo library works immediately; connect TMDB + Plex from **Connections** in the sidebar.

## Quick start (Docker — recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose).

```powershell
cd orbit-app
docker compose up --build
```

Or double-click **`run.ps1`** (Windows).

Open **http://localhost:8090**

Stop: `Ctrl+C` or `docker compose down`

Custom port:

```powershell
$env:ORBIT_PORT=3000; docker compose up --build
```

## What's inside the container

| Piece | Role |
|-------|------|
| `dist/` | Built React UI (Vite) |
| `server/` | Express — serves UI + `/api/plex/*` proxy |
| Plex proxy | Forwards library, artwork, and playback to your Plex server (fixes browser CORS) |

Health check: `GET /api/health`

## Connect Plex (Overseerr-style)

On first launch, the setup wizard opens automatically:

1. **Sign in with Plex** — PIN/OAuth at `app.plex.tv` (no URL or token needed)
2. **Choose server** — Orbit discovers servers on your account (auto-picks if you only have one)
3. **Pick libraries** — movie/TV sections to import (all selected by default)
4. **Optional TMDB** — richer posters
5. **Sync** — `buildTree()` pulls collections + titles from Plex into Orbit

Re-run anytime from sidebar → **Connections**.

Advanced fallback: server URL + token (hidden under “Advanced” on step 1).

The container must reach your Plex server on the network — use your `https://….plex.direct:32400` address when running in Docker.

## Deploy on your Plex PC (GitHub)

**First time on the server:**

```powershell
git clone https://github.com/jpzllkfl/orbit.git
cd orbit
docker compose up --build -d
```

Point your Cloudflare tunnel at `http://127.0.0.1:8090`.

**After updates** (on the Plex PC):

```powershell
cd orbit
.\update.ps1
```

Or manually: `git pull` then `docker compose up --build -d`.

Account data and sync state live in the Docker volume `orbit-data` — rebuilds do not wipe your login or library cache.

## Local development (without Docker)

```bash
cd orbit-app
npm install
npm run dev:all    # UI → http://localhost:5173  API/proxy → :8090
```

Production-style locally:

```bash
npm run build
npm start          # http://localhost:8090
```

## Orbit Desktop (Windows — like Plex)

**Orbit Desktop** bundles the UI **and** Orbit Media Server on your PC (same as Plex app + Plex Media Server in one installer).

**Try without installing:**

```powershell
cd orbit-app
npm install
npm run desktop    # opens Orbit + starts local server on http://127.0.0.1:8090
```

**Build a Windows installer (.exe):**

```powershell
npm install
npm run dist:win
```

Installer output: `orbit-app/release/Orbit-Setup-1.0.0.exe`

After install, launch **Orbit** from the Start menu. Use **Connections → Orbit Media Server → Add Library → Pick folder on this PC** to scan `C:\`, `T:\`, or any local drive.

The NAS copy at `orbit.broken-eye.com` is a separate server install (Docker/Dockge) for remote access — your PC installer is for local libraries and offline use.

## Architecture notes

- `src/lib/plex.js` — real Plex client; uses `/api/plex/proxy` and `/api/plex/media` when `VITE_PLEX_PROXY=1` (Docker build) or in Vite dev mode.
- `src/lib/library.js` — TMDB artwork (calls TMDB directly from the browser).
- Full “going live” guide: `../design_handoff_orbit/CLAUDE.md`

## Next steps

- Import live library via `Plex.buildTree()` (wizard port pending)
- Video player + hls.js for transcode playback
- Detail page, Atlas, Orbit Map views
