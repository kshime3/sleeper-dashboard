// Logic: the Waiver Wire — who's available in this league, who's hot, and who fixes your weak spots.

// Positions this league actually starts (e.g. no K/DEF in leagues without those slots).
function leaguePositions(league) {
  const set = new Set();
  for (const slot of league.roster_positions || []) {
    for (const p of CONFIG.slotEligibility[slot] || []) set.add(p);
  }
  return ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].filter(p => set.has(p));
}

// How strong is each team at each position? Compare the average points per game of each team's
// top N players there (N = how many dedicated lineup spots that position has, at least 1).
// For every team: average points per game of its top N players at each position
// (N = that position's dedicated lineup spots, at least 1), ranked across the league.
// Returns { pos -> [{ roster_id, avg, top, rank }] (best first) }.
function teamStrengths(league, rosters, players, points) {
  const alive = rosters.filter(r => (r.players || []).length);
  const out = {};
  for (const pos of leaguePositions(league)) {
    const n = Math.max(1, (league.roster_positions || []).filter(s => s === pos).length);
    out[pos] = alive.map(r => {
      const top = (r.players || [])
        .map(id => players[id])
        .filter(p => p && p.positions.includes(pos))
        .map(p => ({ player: p, ...points.season(p.id) }))
        .sort((a, b) => b.ppg - a.ppg)
        .slice(0, n);
      while (top.length < n) top.push({ player: null, ppg: 0 }); // an empty spot counts as 0
      return { roster_id: r.roster_id, n, avg: top.reduce((s, x) => s + x.ppg, 0) / n, top };
    }).sort((a, b) => b.avg - a.avg);
    out[pos].forEach((t, i) => { t.rank = i + 1; });
  }
  return out;
}

function positionStrength(ctx) {
  const { league, rosters, players, points, userId } = ctx;
  const mine = rosters.find(r => isMine(r, userId) && (r.players || []).length);
  if (!mine) return [];
  const all = teamStrengths(league, rosters, players, points);
  return Object.keys(all).map(pos => {
    const teams = all[pos];
    const me = teams.find(t => t.roster_id === mine.roster_id);
    return {
      pos, n: me.n, rank: me.rank, teams: teams.length, avg: me.avg,
      leagueAvg: teams.reduce((s, t) => s + t.avg, 0) / teams.length,
      weak: me.rank > teams.length * CONFIG.waivers.weakIfRankBelow,
      weakest: me.top[me.top.length - 1], // your worst "starting-level" player at this position
    };
  });
}

function analyzeWaivers(ctx) {
  const { league, rosters, players, points, trending, userId, byes, team } = ctx;
  const lastWeek = points.weeks[0];
  const positions = leaguePositions(league);
  const rostered = new Set();
  for (const r of rosters) for (const id of r.players || []) rostered.add(id);
  const mine = rosters.find(r => isMine(r, userId));
  const hasTeam = !!(mine && (mine.players || []).length);

  const strength = hasTeam ? positionStrength(ctx) : [];
  const byPos = Object.fromEntries(strength.map(s => [s.pos, s]));

  // This week's holes: starters who are out, on bye, or empty (from the My Team check).
  const holes = hasTeam && team && team.starters
    ? team.starters.filter(s => s.flags.some(f => f.level === 'bad')).map(s => ({
        slot: s.slot, label: s.label, who: s.player ? s.player.name : 'Empty spot',
        why: s.flags.map(f => f.text).join(', '),
      }))
    : [];

  const trendCount = {};
  for (const t of trending || []) trendCount[t.player_id] = t.count;

  const entries = [];
  for (const id in players) {
    const p = players[id];
    if (rostered.has(id) || !p.team || !positions.includes(p.pos)) continue;
    const line = points.season(id);
    const trend = trendCount[id] || 0;
    if (!trend && line.games < CONFIG.waivers.minGamesForPoints) continue;
    const flags = playerFlags(p, byes, false);
    const healthy = !flags.some(f => f.level === 'bad');
    const fits = [];
    for (const pos of p.positions) {
      const s = byPos[pos];
      if (s && s.weak && line.games >= CONFIG.waivers.minGamesForPoints && line.ppg > s.weakest.ppg) {
        fits.push('Upgrade at ' + pos + ': ' + line.ppg.toFixed(1) + ' pts/g vs ' +
          (s.weakest.player ? s.weakest.player.name + ' ' + s.weakest.ppg.toFixed(1) : 'empty spot'));
      }
    }
    entries.push({
      player: p, trend, line, flags, fits, healthy,
      lastWeek: lastWeek ? points.week(lastWeek, id) : null,
    });
  }

  // For each hole this week, star only the best few healthy fill-ins (by points per game).
  for (const h of holes) {
    entries
      .filter(e => e.healthy && canPlay(h.slot, e.player) && e.line.games >= CONFIG.waivers.minGamesForPoints && e.line.ppg > 0)
      .sort((a, b) => b.line.ppg - a.line.ppg)
      .slice(0, CONFIG.waivers.fillInsPerHole)
      .forEach(e => e.fits.push('Can fill ' + h.label + ' this week (' + h.who + ' ' + h.why + ')'));
  }

  let faab = null;
  if (league.settings.waiver_type === 2 && mine) {
    const budget = league.settings.waiver_budget || 0;
    faab = { left: budget - ((mine.settings || {}).waiver_budget_used || 0), budget };
  }

  return { positions, strength, holes, entries, faab, hasTeam };
}

// Pick what to show for the chosen filter ('ALL', 'NEEDS', or a position) and sort ('trend' or 'ppg').
function waiverList(w, filter, sort) {
  let list = w.entries;
  if (filter === 'NEEDS') list = list.filter(e => e.fits.length);
  else if (filter !== 'ALL') list = list.filter(e => e.player.positions.includes(filter));
  if (sort === 'trend') {
    // "My needs" keeps non-trending upgrades too (listed after the trending ones).
    if (filter !== 'NEEDS') list = list.filter(e => e.trend);
    list = list.slice().sort((a, b) => (b.trend - a.trend) || (b.line.ppg - a.line.ppg));
  } else {
    list = list.filter(e => e.line.games >= CONFIG.waivers.minGamesForPoints).slice().sort((a, b) => b.line.ppg - a.line.ppg);
  }
  return list.slice(0, CONFIG.waivers.showCount);
}
