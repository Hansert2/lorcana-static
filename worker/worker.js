const API_BASE = 'https://api.cloudflare.ravensburgerplay.com/hydraproxy/api/v2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Accept': 'application/json',
  'Referer': 'https://tcg.ravensburgerplay.com/',
};

async function getJSON(url) {
  const res = await fetch(url, { headers: UPSTREAM_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getAllPages(baseUrl, pageSize = 100) {
  let page = 1;
  const allResults = [];
  while (true) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const data = await getJSON(`${baseUrl}${sep}page=${page}&page_size=${pageSize}`);
    const results = data.results ?? (Array.isArray(data) ? data : [data]);
    allResults.push(...results);
    if (!data.next_page_number || results.length === 0) break;
    page = data.next_page_number;
  }
  return allResults;
}

async function scrapeEvent(eventId) {
  const event = await getJSON(`${API_BASE}/events/${eventId}/`);

  const rounds = [];
  for (const phase of event.tournament_phases ?? []) {
    for (const round of phase.rounds ?? []) {
      rounds.push({ ...round, phaseName: phase.phase_name, phaseId: phase.id });
    }
  }

  const [roster] = await Promise.all([
    getAllPages(`${API_BASE}/events/${eventId}/registrations/`),
  ]);

  const standingsByRound = {};
  const pairingsByRound  = {};

  await Promise.all(rounds.map(async (round) => {
    const tasks = [];

    if (round.standings_status === 'GENERATED') {
      tasks.push(
        getAllPages(`${API_BASE}/tournament-rounds/${round.id}/standings/paginated/`)
          .then(data => { standingsByRound[round.round_number] = data; })
      );
    }

    if (round.pairings_status === 'GENERATED') {
      tasks.push(
        getJSON(`${API_BASE}/tournament-rounds/${round.id}/matches/`)
          .then(async (data) => {
            if (data.matches && Array.isArray(data.matches)) {
              pairingsByRound[round.round_number] = data.matches;
            } else {
              pairingsByRound[round.round_number] = await getAllPages(
                `${API_BASE}/tournament-rounds/${round.id}/matches/paginated/`
              );
            }
          })
      );
    }

    return Promise.all(tasks);
  }));

  const currentRound = rounds
    .filter(r => r.status !== 'UPCOMING')
    .sort((a, b) => b.round_number - a.round_number)[0] ?? rounds[0];

  return {
    eventId:        event.id,
    name:           event.name,
    store:          event.store,
    address:        event.full_address,
    startDatetime:  event.start_datetime,
    endDatetime:    event.end_datetime,
    timezone:       event.timezone,
    eventStatus:    event.event_status,
    displayStatus:  event.display_status,
    gameType:       event.game_type,
    eventType:      event.event_type,
    eventFormat:    event.event_format,
    gameplayFormat: event.gameplay_format?.name ?? null,
    capacity:       event.capacity,
    playerCount:    roster.length || event.registered_user_count,
    numberOfRounds: event.number_of_rounds,
    tiebreakers:    event.tiebreakers,
    phases: (event.tournament_phases ?? []).map(p => ({
      id:          p.id,
      name:        p.phase_name,
      status:      p.status,
      roundType:   p.round_type,
      totalRounds: p.number_of_rounds,
      rounds:      p.rounds,
    })),
    currentRound: currentRound
      ? { roundNumber: currentRound.round_number, status: currentRound.status, id: currentRound.id }
      : null,
    standings:  standingsByRound,
    pairings:   pairingsByRound,
    roster,
    scrapedAt:  new Date().toISOString(),
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url   = new URL(request.url);
    const match = url.pathname.match(/^\/api\/event\/(\d+)$/);

    if (!match) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const eventId = match[1];

    // Cache at the edge for 30 seconds — same TTL as the Node server used
    const cache     = caches.default;
    const cacheKey  = new Request(url.toString());
    const cached    = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const data     = await scrapeEvent(eventId);
      const response = new Response(JSON.stringify(data), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30',
        },
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};
