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
