# Lorcana Tournament Stats

A static web app for viewing live standings, pairings, and rosters for Disney Lorcana TCG tournaments hosted on the Ravensburger Play Hub.

**Live site:** https://hansert2.github.io/lorcana-static/

## Usage

Open the app and enter an event ID, or link directly with a query parameter:

```
https://hansert2.github.io/lorcana-static/?event=495144
```

## Architecture

```
GitHub Pages (index.html)
        │
        │ fetch /api/event/:id
        ▼
Cloudflare Worker (rphtool-proxy.ilker-y.workers.dev)
        │
        │ parallel requests
        ▼
Ravensburger API (api.cloudflare.ravensburgerplay.com)
```

- **`index.html`** — single-file frontend. All UI, state, and rendering in one file.
- **`worker/worker.js`** — Cloudflare Worker that fetches and assembles event data from the Ravensburger API. Adds CORS headers and 30-second edge caching.
- **`worker/wrangler.toml`** — Wrangler deployment config for the worker.

The worker is needed because the Ravensburger API does not allow direct browser requests (no CORS headers). The worker proxies the requests from the edge and adds the necessary headers.

## Features

- Standings with tiebreakers (OMW%, GW%, OGW%) per round
- Pairings with match results per round
- Full player roster with status
- Player spotlight modal with match history and tiebreaker trajectory
- Head-to-head history shown on pairing cards
- Country flags from player profiles
- Auto-refresh every 30 seconds during live events
- Deep-linkable via `?event=` URL parameter

## Deploying the Worker

If you need to redeploy the Cloudflare Worker:

```bash
cd worker
npm install wrangler
npx wrangler login
npx wrangler deploy
```

Then update the `WORKER_URL` constant in `index.html` if the URL changed.
