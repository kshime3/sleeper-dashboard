// Logic: League history — every trade and transaction across all past seasons of a league.
// Sleeper links each season to the one before (previous_league_id). Finished seasons never change,
// so their downloads are kept on the phone for good; only the current season is re-checked.

// Use the saved copy if there is one (finished seasons), otherwise download (and save) it.
async function savedFirstJSON(url) {
  if (NET.mode !== 'cache') {
    const hit = await savedCopy(url);
    if (hit) return hit.json();
  }
  return cachedJSON(url);
}

// Run async jobs a few at a time (be polite to Sleeper; ~150 small requests on first load).
async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

// Names for players who aren't in the current player list (retired, etc.), built hourly on GitHub.
let oldNamesPromise = null;
function loadOldNames() {
  if (!oldNamesPromise) oldNamesPromise = cachedJSON('data/names.json', { cache: 'no-cache' }).catch(() => ({}));
  return oldNamesPromise;
}

// Download every season of this league: { seasons: [{ season, league, users, rosters, txns }] } newest first.
async function loadHistory(league, onProgress) {
  const chain = [];
  let id = league.league_id, info = league;
  while (id && id !== '0' && chain.length < CONFIG.history.maxSeasons) {
    if (!info) info = await savedFirstJSON(SLEEPER + '/league/' + id);
    chain.push(info);
    id = info.previous_league_id;
    info = null;
  }
  // Several seasons at once (each one ~20 small requests), newest first in the result.
  let done = 0;
  const seasons = await inBatches(chain, CONFIG.history.seasonsAtOnce, async lg => {
    const finished = lg.status === 'complete';
    const get = finished ? savedFirstJSON : getJSON;
    const base = SLEEPER + '/league/' + lg.league_id;
    const rounds = [];
    for (let r = 0; r <= CONFIG.history.maxRounds; r++) rounds.push(r);
    const [users, rosters, ...lists] = await Promise.all([get(base + '/users'), get(base + '/rosters')]
      .concat(rounds.map(r => get(base + '/transactions/' + r).catch(() => []))));
    done++;
    if (onProgress) onProgress(done, chain.length, lg.season);
    return { season: lg.season, league: lg, users, rosters, txns: [].concat(...lists) };
  });
  return { seasons, names: await loadOldNames() };
}

// Turn raw history into simple rows the screen can filter and show.
// managers: { owner_id -> label } using each manager's current team name when they're still in the league.
function buildHistory(hist, current, players) {
  const latest = hist.seasons[0];
  const currentName = {};
  for (const r of latest.rosters) if (r.owner_id) currentName[r.owner_id] = teamName(latest.users, r);
  const managers = {};
  const pname = id => {
    const p = players[id];
    if (p) return { name: p.name, pos: p.pos };
    const n = hist.names && hist.names[id];
    if (n) return { name: n[0], pos: n[1] };
    return { name: /^[A-Z]{2,3}$/.test(id) ? id + ' D/ST' : 'Player #' + id, pos: '' };
  };
  const trades = [], moves = [];

  for (const s of hist.seasons) {
    const ownerOf = {}, label = {};
    for (const r of s.rosters) {
      ownerOf[r.roster_id] = r.owner_id;
      const name = (r.owner_id && currentName[r.owner_id]) || teamName(s.users, r);
      label[r.roster_id] = name;
      if (r.owner_id) managers[r.owner_id] = managers[r.owner_id] || name;
    }
    const team = rid => ({ rid, owner: ownerOf[rid] || '', name: label[rid] || 'Team ' + rid });
    // A draft pick: "2024 1st-round pick", plus whose pick it originally was (if not the receiver's own).
    const pickInfo = p => ({
      label: p.season + ' ' + roundName(p.round) + '-round pick',
      from: p.roster_id !== p.owner_id ? (label[p.roster_id] || 'Team ' + p.roster_id) : '',
    });

    for (const t of s.txns) {
      if (!t || !t.type) continue;
      const base = { id: t.transaction_id, season: s.season, week: t.leg, date: t.status_updated || t.created, status: t.status };
      if (t.type === 'trade') {
        if (t.status !== 'complete') continue;
        const sides = (t.roster_ids || []).map(rid => ({
          team: team(rid),
          players: Object.keys(t.adds || {}).filter(pid => t.adds[pid] === rid).map(pid => ({ id: pid, ...pname(pid) })),
          picks: (t.draft_picks || []).filter(p => p.owner_id === rid).map(pickInfo),
          faab: (t.waiver_budget || []).filter(w => w.receiver === rid).reduce((a, w) => a + (w.amount || 0), 0),
        }));
        trades.push({ ...base, sides });
      } else {
        const rid = (t.roster_ids || [])[0];
        moves.push({
          ...base, type: t.type, team: team(rid),
          adds: Object.keys(t.adds || {}).map(pid => ({ id: pid, ...pname(pid) })),
          drops: Object.keys(t.drops || {}).map(pid => ({ id: pid, ...pname(pid) })),
          bid: t.settings && t.settings.waiver_bid != null ? t.settings.waiver_bid : null,
        });
      }
    }
  }
  const newest = (a, b) => (b.date || 0) - (a.date || 0);
  trades.sort(newest); moves.sort(newest);
  const seasons = hist.seasons.map(s => s.season);
  return { trades, moves, seasons, managers, first: seasons[seasons.length - 1], last: seasons[0] };
}

// Filters: { season: 'all' | '2024', team: 'all' | owner_id, q: 'text', type: 'all'|'waiver'|'free_agent'|'commissioner', failed: bool }
function filterHistory(h, view, f) {
  const q = (f.q || '').trim().toLowerCase();
  const names = list => list.map(p => p.name.toLowerCase());
  if (view === 'trades') {
    return h.trades.filter(t =>
      (f.season === 'all' || t.season === f.season) &&
      (f.team === 'all' || t.sides.some(s => s.team.owner === f.team)) &&
      (!q || t.sides.some(s => names(s.players).some(n => n.includes(q)) || s.picks.some(p => (p.label + ' ' + p.from).toLowerCase().includes(q)))));
  }
  return h.moves.filter(m =>
    (f.season === 'all' || m.season === f.season) &&
    (f.team === 'all' || m.team.owner === f.team) &&
    (f.type === 'all' || m.type === f.type) &&
    (f.failed || m.status === 'complete') &&
    (!q || names(m.adds).concat(names(m.drops)).some(n => n.includes(q))));
}
