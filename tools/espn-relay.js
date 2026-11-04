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

    // Compact summary for the dashboard (~30 KB instead of ~5 MB): /summary/<season>/<leagueId>
    const sm = url.pathname.match(/^\/summary\/(\d{4})\/(\d+)$/);
    if (sm) {
      const leaguesOk = (env.LEAGUES || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!leaguesOk.includes(sm[2])) return reply('This league is not on the relay\'s list', 403);
      try {
        const data = await summary(sm[1], sm[2], env);
        return reply(JSON.stringify(data), 200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=20' });
      } catch (err) {
        return reply(JSON.stringify({ error: err.message }), err.status || 502, { 'Content-Type': 'application/json' });
      }
    }

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

// ---------- The compact summary ----------
async function espn(season, leagueId, query, env) {
  const res = await fetch('https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/' + season + '/segments/0/leagues/' + leagueId + '?' + query, {
    headers: { Cookie: 'espn_s2=' + env.ESPN_S2 + '; SWID=' + env.SWID, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (fantasy dashboard relay)' },
  });
  if (res.status === 401 || res.status === 403) {
    const e = new Error('ESPN refused the cookies — they may have expired. Log in to ESPN again and update ESPN_S2 / SWID in Cloudflare.');
    e.status = 401; throw e;
  }
  if (!res.ok) { const e = new Error('ESPN answered ' + res.status); e.status = 502; throw e; }
  return res.json();
}

async function summary(season, leagueId, env) {
  const base = await espn(season, leagueId, 'view=mSettings&view=mTeam&view=mMatchupScore&view=mStatus', env);
  const st = base.status || {};
  const week = st.currentMatchupPeriod || 1;
  const sp = st.latestScoringPeriod || base.scoringPeriodId || week;
  const box = await espn(season, leagueId, 'view=mBoxscore&view=mMatchupScore&scoringPeriodId=' + sp, env);
  const s = base.settings || {};
  const swid = (env.SWID || '').toUpperCase();
  const members = {};
  for (const m of base.members || []) members[m.id] = m.displayName || ((m.firstName || '') + ' ' + (m.lastName || '')).trim();
  const teams = (base.teams || []).map(t => {
    const r = (t.record && t.record.overall) || {};
    return {
      id: t.id, name: t.name || ((t.location || '') + ' ' + (t.nickname || '')).trim(), abbrev: t.abbrev,
      owner: t.primaryOwner || (t.owners || [])[0] || '', ownerName: members[t.primaryOwner || (t.owners || [])[0]] || '',
      mine: (t.owners || []).some(o => String(o).toUpperCase() === swid),
      w: r.wins || 0, l: r.losses || 0, t: r.ties || 0, pf: r.pointsFor || 0, pa: r.pointsAgainst || 0,
      streak: r.streakLength ? (r.streakType === 'WIN' ? 'W' : r.streakType === 'LOSS' ? 'L' : 'T') + r.streakLength : '',
      seed: t.playoffSeed || 0,
    };
  });
  const schedule = (base.schedule || []).map(m => ({
    w: m.matchupPeriodId, h: m.home ? m.home.teamId : null, hp: m.home ? m.home.totalPoints : 0,
    a: m.away ? m.away.teamId : null, ap: m.away ? m.away.totalPoints : 0, winner: m.winner || 'UNDECIDED',
  }));
  // This week's lineups, live points and projections, per team.
  const live = {};
  for (const m of box.schedule || []) {
    if (m.matchupPeriodId !== week) continue;
    for (const side of [m.home, m.away]) {
      if (!side || !side.rosterForCurrentScoringPeriod) continue;
      live[side.teamId] = {
        pts: side.totalPointsLive != null ? side.totalPointsLive : side.totalPoints,
        proj: side.totalProjectedPointsLive != null ? Math.round(side.totalProjectedPointsLive * 100) / 100 : null,
        winProb: side.winProbability != null ? side.winProbability : null,
        roster: side.rosterForCurrentScoringPeriod.entries.map(e => {
          const pe = e.playerPoolEntry || {}, p = pe.player || {};
          const projStat = (p.stats || []).find(x => x.statSourceId === 1 && x.scoringPeriodId === sp);
          return [e.playerId, p.fullName || '', p.defaultPositionId || 0, p.proTeamId || 0, e.lineupSlotId,
            Math.round((pe.appliedStatTotal || 0) * 100) / 100, projStat ? Math.round(projStat.appliedTotal * 100) / 100 : null];
        }),
      };
    }
  }
  return {
    v: 1, source: 'espn', id: base.id, season: Number(season), name: s.name || ('ESPN league ' + leagueId), size: s.size || teams.length,
    week, scoringPeriod: sp, finalWeek: st.finalScoringPeriod || 17,
    regWeeks: (s.scheduleSettings && s.scheduleSettings.matchupPeriodCount) || 14,
    playoffTeams: (s.scheduleSettings && s.scheduleSettings.playoffTeamCount) || 0,
    slots: (s.rosterSettings && s.rosterSettings.lineupSlotCounts) || {},
    teams, schedule, live,
  };
}
