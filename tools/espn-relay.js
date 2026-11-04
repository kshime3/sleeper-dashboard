// ESPN relay — a tiny Cloudflare Worker (free) that lets the dashboard read your PRIVATE ESPN leagues.
//
// Why: ESPN only shares private leagues with your login cookies (espn_s2 and SWID), and a web page
// can't send those to ESPN. This Worker keeps the cookies secret (Cloudflare "secrets", never in this
// code or the public repo), fetches the league from ESPN, and passes it back to the dashboard.
//
// Safety: read-only (GET only), only the league IDs listed in LEAGUES, only ESPN's league data address,
// and browsers may only call it from the dashboard's web address (ALLOWED_ORIGINS).
//
// Settings in Cloudflare (Worker → Settings → Variables and Secrets):
//   ESPN_S2          Secret  your espn_s2 cookie
//   SWID             Secret  your SWID cookie, including the { } braces
//   LEAGUES          Text    59081,903211
//   ALLOWED_ORIGINS  Text    https://kshime3.github.io        (optional; this is the default)
//
// The dashboard calls:  https://<your-worker>.workers.dev/league/<season>/<leagueId>?view=mTeam&view=mRoster…
// Optional extras passed through: scoringPeriodId=<week>, and the X-Fantasy-Filter header (free agents).

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://kshime3.github.io').split(',').map(s => s.trim());
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Fantasy-Filter',
      'Vary': 'Origin',
    };
    const reply = (body, status, extra) => new Response(body, { status, headers: Object.assign({}, cors, extra || {}) });

    if (request.method === 'OPTIONS') return reply(null, 204);
    if (request.method !== 'GET') return reply('Read-only relay', 405);
    if (origin && !allowed.includes(origin)) return reply('Not allowed from this website', 403);
    if (!env.ESPN_S2 || !env.SWID) return reply('Relay is missing the ESPN_S2 / SWID secrets', 500);

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') return reply(JSON.stringify({ ok: true, leagues: (env.LEAGUES || '').split(',') }), 200, { 'Content-Type': 'application/json' });

    const m = url.pathname.match(/^\/league\/(\d{4})\/(\d+)$/);
    if (!m) return reply('Not found', 404);
    const [, season, leagueId] = m;
    const leagues = (env.LEAGUES || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!leagues.includes(leagueId)) return reply('This league is not on the relay\'s list', 403);

    const target = new URL('https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/' + season + '/segments/0/leagues/' + leagueId);
    for (const v of url.searchParams.getAll('view')) if (/^[A-Za-z]{2,40}$/.test(v)) target.searchParams.append('view', v);
    const sp = url.searchParams.get('scoringPeriodId');
    if (sp && /^\d{1,2}$/.test(sp)) target.searchParams.set('scoringPeriodId', sp);

    const headers = {
      Cookie: 'espn_s2=' + env.ESPN_S2 + '; SWID=' + env.SWID,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (fantasy dashboard relay)',
    };
    const filter = request.headers.get('X-Fantasy-Filter');
    if (filter && filter.length < 2000) headers['X-Fantasy-Filter'] = filter;

    const res = await fetch(target, { headers });
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      return reply(JSON.stringify({ error: 'ESPN refused the cookies — they may have expired. Log in to ESPN again and update ESPN_S2 / SWID in Cloudflare.' }), 401, { 'Content-Type': 'application/json' });
    }
    return reply(body, res.status, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=20' });
  },
};
