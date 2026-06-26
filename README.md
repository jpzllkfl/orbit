# Orbit — Plex-style media library

Orbit is your personal media hub: **Orbit Media Server (OMS)** scans files on your PC for direct play, **Plex** supplies posters/themes/metadata, and your **Orbit account** syncs libraries to web and iPad.

## Quick start (Docker — NAS / cloud)

```powershell
cd orbit-app
docker compose up --build
```

Open **http://localhost:8090** (production: https://orbit.broken-eye.com)

## Orbit Desktop (Windows — Plex PC)

```powershell
cd orbit-app
npm install
npm run dist:win    # builds Orbit-Setup-*.exe
# or for dev:
npm run desktop
```

**Recommended on the Plex PC:** install [mpv](https://mpv.io) and ffmpeg for playback:

```powershell
winget install shinchiro.mpv
winget install ffmpeg
```

## How it fits together

| Piece | Role |
|-------|------|
| **Orbit Media Server** | Scans `T:\`, local drives; direct play + transcode |
| **Plex connection** | Artwork, themes, collection art, display metadata only (optional) |
| **Orbit account** | Syncs library layout, progress, settings to web/iPad |
| **Desktop relay** | Web streams from your Plex PC via cloud when signed in |

### Setup flow

1. **Desktop:** Connections → add OMS libraries → scan folders on this PC
2. **Optional:** Connections → **Connect Plex for artwork** (metadata-only; does not import Plex files)
3. **Account:** Sign in → **Sync now** on desktop and web
4. **Web/iPad:** Same account — library appears; playback relays to desktop when online

Re-run setup anytime from **Connections**.

## Local development

```bash
cd orbit-app
npm install
npm run dev:all    # UI :5173, API :8090
```

```bash
npm run build && npm start
```

## Deploy (Dockge / TrueNAS)

```bash
node scripts/dockge-deploy.mjs --stack orbit --sha <commit>
```

Desktop releases build automatically on push to `main` (GitHub Actions).

## Architecture

- `src/` — React UI (Vite + TypeScript)
- `server/` — Express API, OMS, Plex proxy, account sync, **desktop stream relay**
- `electron/` — Windows desktop + embedded OMS + mpv player
- `src/lib/plex.js` — Plex client (metadata + optional legacy import)
- `src/lib/omsSync.ts` — merge desktop scans into synced tree

## Playback notes

- **Desktop:** OMS direct play; mpv for MKV/HEVC; browser fallback uses transcode (ffmpeg)
- **Web:** Streams relay through your cloud server to the desktop OMS when `orbit.desktop.media.v1` is synced
- **Plex:** Posters/themes only in default mode — files stay on OMS

Health: `GET /api/health`
