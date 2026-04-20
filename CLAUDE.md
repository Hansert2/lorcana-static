# Lorcana Static — Claude Context

## What this is

A fully static Lorcana tournament viewer. The frontend is a single `index.html` deployed on GitHub Pages. A Cloudflare Worker (`worker/worker.js`) acts as a CORS proxy and data assembler, fetching from the Ravensburger Play Hub API on behalf of the browser.

## Key files

- `index.html` — entire frontend (HTML + CSS + JS, no build step)
- `worker/worker.js` — Cloudflare Worker (ES module, uses `export default { fetch }`)
- `worker/wrangler.toml` — worker deployment config
- `worker/package.json` — local wrangler install

## Config

The worker URL is set as a constant at the top of the `<script>` block in `index.html`:

```js
const WORKER_URL = 'https://rphtool-proxy.ilker-y.workers.dev';
```

## Deployment

**Frontend:** push `index.html` to `main` branch — GitHub Pages auto-deploys.

**Worker:** deploy via Cloudflare dashboard (paste `worker/worker.js` into the editor) or via CLI:
```bash
cd worker && npx wrangler deploy
```

Note: `npm install -g wrangler` fails on this machine due to Windows PATH issues with cmd.exe subprocesses. Use local install (`npm install wrangler`) and `npx wrangler` instead. Or use the Cloudflare dashboard editor.

## Data flow

1. Browser calls `WORKER_URL/api/event/:id`
2. Worker fetches event metadata, roster, and all round standings/pairings in parallel from `api.cloudflare.ravensburgerplay.com/hydraproxy/api/v2/`
3. Worker assembles and returns a single JSON object
4. Frontend renders standings, pairings, and roster tabs from that object

## API shape (worker response)

```
{
  eventId, name, store, address,
  startDatetime, endDatetime, timezone,
  eventStatus, displayStatus, gameType, eventType, eventFormat, gameplayFormat,
  capacity, playerCount, numberOfRounds, tiebreakers,
  phases: [{ id, name, status, roundType, totalRounds, rounds }],
  currentRound: { roundNumber, status, id },
  standings: { [roundNumber]: [...rows] },
  pairings:  { [roundNumber]: [...matches] },
  roster:    [...registrations],
  scrapedAt
}
```

## Upstream API endpoints used

- `GET /events/:id/` — event metadata
- `GET /events/:id/registrations/?page=&page_size=` — paginated roster
- `GET /tournament-rounds/:id/standings/paginated/?page=&page_size=` — standings per round
- `GET /tournament-rounds/:id/matches/` — pairings per round (falls back to `/matches/paginated/`)
