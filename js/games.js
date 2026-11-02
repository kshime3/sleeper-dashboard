// Logic: this week's NFL games — kickoff time, live quarter/clock and score — for each team.
// Main source: ESPN's free public scoreboard (unofficial, no login). Backup: Sleeper's schedule
// (only the day and upcoming / live / final, no times or clock).

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const ESPN_TEAM_FIX = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' }; // ESPN's team codes that differ from Sleeper's

function fromEspn(events) {
  const byTeam = {};
  for (const e of events || []) {
    const c = e.competitions && e.competitions[0];
    if (!c) continue;
    const st = c.status || e.status || {};
    const type = st.type || {};
    const state = type.state === 'in' ? 'in' : type.state === 'post' ? 'post' : 'pre';
    const teams = (c.competitors || []).map(t => ({
      code: ESPN_TEAM_FIX[t.team.abbreviation] || t.team.abbreviation,
      espnId: t.team.id || t.id,
      home: t.homeAway === 'home',
      score: t.score != null && t.score !== '' ? Number(t.score) : null,
    }));
    const sit = c.situation || {};
    for (const me of teams) {
      const opp = teams.find(t => t !== me);
      if (!opp) continue;
      byTeam[me.code] = {
        team: me.code, opp: opp.code, home: me.home, state,
        kickoff: e.date ? Date.parse(e.date) : null,
        period: st.period || 0, clock: st.displayClock || '',
        halftime: type.name === 'STATUS_HALFTIME',
        detail: type.shortDetail || '',
        score: state === 'pre' ? null : [me.score, opp.score],
        possession: state === 'in' && sit.possession != null && String(sit.possession) === String(me.espnId),
        redZone: state === 'in' && !!sit.isRedZone && String(sit.possession) === String(me.espnId),
      };
    }
  }
  return byTeam;
}

function fromSleeper(games, week) {
  const byTeam = {};
  for (const g of games || []) {
    if (!g || g.week !== week) continue;
    const state = g.status === 'complete' ? 'post' : g.status === 'in_game' ? 'in' : 'pre';
    // Sleeper gives only the date ("2026-11-08"); read it as a local date (no time).
    const [y, m, d] = String(g.date || '').split('-').map(Number);
    const day = y ? new Date(y, m - 1, d).getTime() : null;
    for (const [me, opp, home] of [[g.home, g.away, true], [g.away, g.home, false]]) {
      byTeam[me] = { team: me, opp, home, state, kickoff: null, day, period: 0, clock: '', halftime: false, detail: '', score: null };
    }
  }
  return byTeam;
}

// { byTeam: { 'SEA': game, ... }, source: 'espn' | 'sleeper' | null, anyLive, allDone }
async function loadGames(season, week) {
  let byTeam = null, source = null;
  if (week > 0) {
    try {
      const data = await cachedJSON(ESPN_SCOREBOARD + '?seasontype=2&week=' + week + '&dates=' + season, undefined, { quiet: true });
      byTeam = fromEspn(data.events);
      if (Object.keys(byTeam).length) source = 'espn';
    } catch (e) { /* fall back to Sleeper */ }
    if (!source) {
      try {
        byTeam = fromSleeper(await getJSON(SLEEPER_EXTRA + '/schedule/nfl/regular/' + season), week);
        if (Object.keys(byTeam).length) source = 'sleeper';
      } catch (e) { /* no game info: the app still works */ }
    }
  }
  byTeam = byTeam || {};
  const all = Object.values(byTeam);
  return {
    byTeam, source,
    anyLive: all.some(g => g.state === 'in'),
    allDone: all.length > 0 && all.every(g => g.state === 'post'),
  };
}

function gameFor(games, player) {
  return games && player && player.team ? games.byTeam[player.team] || null : null;
}

// Short text for a player's game, e.g. "@ SEA · Sun 1:00 PM", "vs SEA · Q3 4:12 · 14–10", "@ SEA · Final W 24–17"
function gameText(g) {
  if (!g) return '';
  const where = (g.home ? 'vs ' : '@ ') + g.opp;
  if (g.state === 'pre') {
    if (g.kickoff) {
      const d = new Date(g.kickoff);
      return where + ' · ' + d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return where + (g.day ? ' · ' + new Date(g.day).toLocaleDateString([], { weekday: 'short' }) : '');
  }
  const sc = g.score && g.score[0] != null ? ' · ' + g.score[0] + '–' + g.score[1] : '';
  if (g.state === 'in') {
    const when = g.halftime ? 'Half' : (g.period ? (g.period > 4 ? 'OT' : 'Q' + g.period) + (g.clock ? ' ' + g.clock : '') : 'Live');
    return where + ' · ' + when + sc + (g.redZone ? ' · 🔴 red zone' : g.possession ? ' · 🏈' : '');
  }
  const result = g.score && g.score[0] != null ? (g.score[0] > g.score[1] ? ' W' : g.score[0] < g.score[1] ? ' L' : ' T') : '';
  return where + ' · Final' + result + (sc ? ' ' + sc.slice(3) : '');
}
