// Logic: player stats from Sleeper, and turning them into fantasy points using YOUR league's scoring.
// These downloads are a few MB, so they're kept only while the page is open (not saved on the phone).
const statsCache = {};

const STAT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
function statsUrl(season, week) {
  const pos = STAT_POSITIONS.map(p => 'position%5B%5D=' + p).join('&');
  return SLEEPER_EXTRA + '/stats/nfl/' + season + (week ? '/' + week : '') + '?season_type=regular&' + pos;
}

// Returns { player_id -> raw stats object }. week = 0 means the whole season so far.
async function loadStats(season, week) {
  const key = season + '_' + (week || 'season');
  if (!statsCache[key]) {
    statsCache[key] = getJSON(statsUrl(season, week)).then(rows => {
      const out = {};
      for (const r of rows || []) if (r && r.player_id && r.stats) out[r.player_id] = r.stats;
      return out;
    }).catch(err => { delete statsCache[key]; throw err; });
  }
  return statsCache[key];
}

// Fantasy points = each stat × what your league pays for it. Checked against Sleeper's own
// league scores for every rostered player in week 7 of 2026: all four leagues matched exactly.
function fantasyPoints(stats, scoring, pos) {
  if (!stats) return 0;
  let pts = 0;
  for (const k in scoring) {
    const v = stats[k];
    if (typeof v === 'number') pts += v * scoring[k];
  }
  // Position-only catch bonuses (e.g. TE premium) aren't separate stats, so add them here.
  const bonus = { TE: 'bonus_rec_te', RB: 'bonus_rec_rb', WR: 'bonus_rec_wr' }[pos];
  if (bonus && scoring[bonus] && typeof stats[bonus] !== 'number') pts += (stats.rec || 0) * scoring[bonus];
  return Math.round(pts * 100) / 100;
}

// Season summary for one player in one league: { total, games, ppg }
function seasonLine(seasonStats, id, scoring, pos) {
  const s = seasonStats[id];
  if (!s) return { total: 0, games: 0, ppg: 0 };
  const total = fantasyPoints(s, scoring, pos);
  const games = s.gp || 0;
  return { total, games, ppg: games ? Math.round(total / games * 10) / 10 : 0 };
}

// ---------- One league's points, from whichever source is available ----------
// points.season(id) -> { total, games, ppg }; points.week(w, id) -> points that week, or null if he didn't play.
// points.weeks = the recent weeks available (newest first).

// Slow way: from Sleeper's raw stats (a few MB). Used if the pre-built file isn't available.
function pointsFromRaw(seasonStats, weekStats, scoring, players) {
  const pos = id => (players[id] ? players[id].pos : '');
  return {
    weeks: weekStats.map(w => w.week),
    season: id => seasonLine(seasonStats, id, scoring, pos(id)),
    week(w, id) {
      const ws = weekStats.find(x => x.week === w);
      const s = ws && ws.stats && ws.stats[id];
      return s && s.gp ? fantasyPoints(s, scoring, pos(id)) : null;
    },
  };
}

// Fast way: from data/stats.json, worked out ahead of time on GitHub (tools/build-data.js).
// Each player: [season total, games, week A points, week B points, ...] (null = didn't play).
function pointsFromBuilt(table, weeks) {
  return {
    weeks,
    season(id) {
      const r = table[id];
      if (!r) return { total: 0, games: 0, ppg: 0 };
      return { total: r[0], games: r[1], ppg: r[1] ? Math.round(r[0] / r[1] * 10) / 10 : 0 };
    },
    week(w, id) {
      const r = table[id], i = weeks.indexOf(w);
      return r && i >= 0 && r[2 + i] != null ? r[2 + i] : null;
    },
  };
}

// The recent weeks we care about: the last few finished weeks before the current one.
function recentWeeks(week, count) {
  const out = [];
  for (let w = week - 1; w >= 1 && out.length < count; w--) out.push(w);
  return out;
}

let builtStatsPromise = null;
function loadBuiltStats() {
  if (!builtStatsPromise) {
    builtStatsPromise = fetch('data/stats.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null).catch(() => null);
  }
  return builtStatsPromise;
}

// Points for one league this visit (remembered per league).
const pointsCache = {};
async function loadPoints(league, season, week, players) {
  const id = league.league_id;
  if (!pointsCache[id]) {
    pointsCache[id] = (async () => {
      const weeks = recentWeeks(week, CONFIG.trade.recentWeeks);
      const built = await loadBuiltStats();
      if (built && String(built.season) === String(season) && built.week === week && built.leagues && built.leagues[id]) {
        return pointsFromBuilt(built.leagues[id], built.weeks);
      }
      const [seasonStats, ...weekly] = await Promise.all([loadStats(season, 0)]
        .concat(weeks.map(w => loadStats(season, w).catch(() => ({})))));
      return pointsFromRaw(seasonStats, weeks.map((w, i) => ({ week: w, stats: weekly[i] })), league.scoring_settings || {}, players);
    })().catch(err => { delete pointsCache[id]; throw err; });
  }
  return pointsCache[id];
}

// Lets tools/build-data.js (Node, on GitHub) reuse the exact same scoring code.
if (typeof module !== 'undefined') module.exports = { fantasyPoints };

// Forget downloaded stats (used by the ⟳ button so it really fetches fresh numbers).
function clearStatsCache() {
  for (const k in statsCache) delete statsCache[k];
  for (const k in pointsCache) delete pointsCache[k];
  builtStatsPromise = null;
}
