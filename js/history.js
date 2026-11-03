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
    const [users, rosters, draftList, ...lists] = await Promise.all([get(base + '/users'), get(base + '/rosters'), get(base + '/drafts').catch(() => [])]
      .concat(rounds.map(r => get(base + '/transactions/' + r).catch(() => []))));
    // That season's drafts and their picks (finished drafts never change, so saved for good).
    // (The draft's own page says which slot belonged to which team: slot_to_roster_id.)
    const drafts = await Promise.all((draftList || []).filter(dr => dr.status === 'complete').map(async dr => {
      const [picks, detail] = await Promise.all([
        savedFirstJSON(SLEEPER + '/draft/' + dr.draft_id + '/picks').catch(() => []),
        savedFirstJSON(SLEEPER + '/draft/' + dr.draft_id).catch(() => null),
      ]);
      return { draft: Object.assign({}, dr, detail && detail.slot_to_roster_id ? { slot_to_roster_id: detail.slot_to_roster_id } : {}), picks };
    }));
    done++;
    if (onProgress) onProgress(done, chain.length, lg.season);
    return { season: lg.season, league: lg, users, rosters, drafts, txns: [].concat(...lists) };
  });
  return { seasons, names: await loadOldNames() };
}

// Turn raw history into simple rows the screen can filter and show.
// managers: { owner_id -> label } using each manager's current team name when they're still in the league.
function buildHistory(hist, current, players) {
  const latest = hist.seasons[0];
  const currentName = {};
  const latestLabel = {};
  for (const r of latest.rosters) {
    if (r.owner_id) currentName[r.owner_id] = teamName(latest.users, r);
    latestLabel[r.roster_id] = teamName(latest.users, r);
  }
  const managers = {};
  const pname = id => {
    const p = players[id];
    if (p) return { name: p.name, pos: p.pos };
    const n = hist.names && hist.names[id];
    if (n) return { name: n[0], pos: n[1] };
    return { name: /^[A-Z]{2,3}$/.test(id) ? id + ' D/ST' : 'Player #' + id, pos: '' };
  };
  // What did each draft pick turn into? For each season's rookie draft (or its only draft):
  // the slot each team owned, and who was picked in each round/slot.
  const draftBySeason = {};
  for (const s of hist.seasons) {
    for (const { draft, picks } of s.drafts || []) {
      const rounds = (draft.settings && draft.settings.rounds) || 0;
      const prev = draftBySeason[draft.season];
      if (prev && rounds >= 10) continue; // prefer the rookie draft over a startup draft
      const slotOf = {};
      for (const slot in draft.slot_to_roster_id || {}) if (slot) slotOf[draft.slot_to_roster_id[slot]] = Number(slot);
      const bySlot = {};
      for (const pk of picks || []) bySlot[pk.round + '-' + pk.draft_slot] = pk;
      draftBySeason[draft.season] = { slotOf, bySlot };
    }
  }

  const trades = [], moves = [];
  const seasonInfo = []; // per season: league, rosters, team(roster_id) — used by League records
  const journeys = {}; // player_id -> [{ date, season, kind, text }] (for the player panel)
  const step = (pid, ev) => (journeys[pid] = journeys[pid] || []).push(ev);

  for (const s of hist.seasons) {
    const ownerOf = {}, label = {};
    for (const r of s.rosters) {
      ownerOf[r.roster_id] = r.owner_id;
      const name = (r.owner_id && currentName[r.owner_id]) || teamName(s.users, r);
      label[r.roster_id] = name;
      if (r.owner_id) managers[r.owner_id] = managers[r.owner_id] || name;
    }
    const team = rid => ({ rid, owner: ownerOf[rid] || '', name: label[rid] || 'Team ' + rid });
    seasonInfo.push({ season: s.season, league: s.league, rosters: s.rosters, team });
    // A draft pick: "2024 1st-round pick", plus whose pick it originally was (if not the receiver's own).
    const pickInfo = p => {
      const info = {
        label: p.season + ' ' + roundName(p.round) + '-round pick',
        from: p.roster_id !== p.owner_id ? (label[p.roster_id] || 'Team ' + p.roster_id) : '',
        became: null, notYet: false,
      };
      const dr = draftBySeason[p.season];
      if (!dr) { info.notYet = Number(p.season) >= Number(hist.seasons[0].season); return info; }
      const slot = dr.slotOf[p.roster_id];
      const made = slot && dr.bySlot[p.round + '-' + slot];
      if (made) {
        info.became = {
          id: made.player_id, ...(made.player_id ? pname(made.player_id) : { name: 'no player picked', pos: '' }),
          pick: p.round + '.' + String(slot).padStart(2, '0'),
          by: made.roster_id !== p.owner_id ? (latestLabel[made.roster_id] || 'Team ' + made.roster_id) : '',
        };
      }
      return info;
    };

    // Drafts: "Drafted by X — 2023 rookie draft, pick 1.03"
    for (const { draft, picks } of s.drafts || []) {
      const rounds = (draft.settings && draft.settings.rounds) || 0;
      const kind = rounds >= 10 ? (leagueFormat(current) === 'dynasty' ? 'startup draft' : 'draft') : 'rookie draft';
      for (const pk of picks || []) {
        if (!pk.player_id) continue;
        const slot = pk.round + '.' + String(pk.draft_slot || '').padStart(2, '0');
        step(pk.player_id, { date: draft.start_time || 0, season: s.season, kind: 'draft',
          text: 'Drafted by ' + team(pk.roster_id).name + ' — ' + s.season + ' ' + kind + ', pick ' + slot });
      }
    }

    for (const t of s.txns) {
      if (!t || !t.type) continue;
      const base = { id: t.transaction_id, season: s.season, week: t.leg, date: t.status_updated || t.created, status: t.status };
      // Player journeys (completed moves only)
      if (t.status === 'complete') {
        const ev = (pid, kind, text) => step(pid, { date: base.date, season: s.season, kind, text });
        for (const pid of Object.keys(t.adds || {})) {
          const to = team(t.adds[pid]).name, from = t.drops && t.drops[pid] != null ? team(t.drops[pid]).name : '';
          if (t.type === 'trade') ev(pid, 'trade', 'Traded to ' + to + (from ? ' (from ' + from + ')' : ''));
          else if (t.type === 'waiver') ev(pid, 'waiver', 'Claimed off waivers by ' + to + (t.settings && t.settings.waiver_bid ? ' ($' + t.settings.waiver_bid + ')' : ''));
          else if (t.type === 'free_agent') ev(pid, 'free_agent', 'Picked up by ' + to + ' as a free agent');
          else ev(pid, 'commissioner', 'Moved to ' + to + ' by the commissioner');
        }
        for (const pid of Object.keys(t.drops || {})) {
          if (t.adds && t.adds[pid] != null) continue; // a trade or move, already listed
          ev(pid, 'drop', 'Dropped by ' + team(t.drops[pid]).name);
        }
      }
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
  for (const pid in journeys) journeys[pid].sort((a, b) => (a.date || 0) - (b.date || 0));
  return { trades, moves, journeys, seasons, managers, seasonInfo, pname, first: seasons[seasons.length - 1], last: seasons[0] };
}

// Filters: { season: 'all' | '2024', team: 'all' | owner_id, q: 'text', type: 'all'|'waiver'|'free_agent'|'commissioner', failed: bool }
function filterHistory(h, view, f) {
  const q = (f.q || '').trim().toLowerCase();
  const names = list => list.map(p => p.name.toLowerCase());
  if (view === 'trades') {
    const list = h.trades.filter(t =>
      (f.season === 'all' || t.season === f.season) &&
      (f.team === 'all' || t.sides.some(s => s.team.owner === f.team)) &&
      (!q || t.sides.some(s => names(s.players).some(n => n.includes(q)) || s.picks.some(p => (p.label + ' ' + p.from + ' ' + (p.became ? p.became.name : '')).toLowerCase().includes(q)))));
    // "Most lopsided first" (needs trades in hindsight)
    if (f.sort === 'lopsided' && f.hind) list.sort((a, b) => ((f.hind[b.id] || {}).diff || 0) - ((f.hind[a.id] || {}).diff || 0));
    return list;
  }
  return h.moves.filter(m =>
    (f.season === 'all' || m.season === f.season) &&
    (f.team === 'all' || m.team.owner === f.team) &&
    (f.type === 'all' || m.type === f.type) &&
    (f.failed || m.status === 'complete') &&
    (!q || names(m.adds).concat(names(m.drops)).some(n => n.includes(q))));
}

// ---------- League records ----------
// Needs each season's playoff bracket and every week's scores (~17 small requests a season,
// saved on the phone for good once a season is over). currentWeek: games before it count.
async function loadRecords(h, currentWeek, onProgress) {
  let done = 0;
  const perSeason = await inBatches(h.seasonInfo, CONFIG.history.seasonsAtOnce, async si => {
    const lg = si.league, finished = lg.status === 'complete';
    const get = finished ? savedFirstJSON : getJSON;
    const base = SLEEPER + '/league/' + lg.league_id;
    const last = finished ? (lg.settings.last_scored_leg || 17) : Math.max(0, currentWeek - 1);
    const weeks = [];
    for (let w = 1; w <= last; w++) weeks.push(w);
    const [bracket, ...weekly] = await Promise.all([get(base + '/winners_bracket').catch(() => [])]
      .concat(weeks.map(w => get(base + '/matchups/' + w).catch(() => []))));
    done++;
    if (onProgress) onProgress(done, h.seasonInfo.length);
    return { si, finished, bracket: bracket || [], weeks: weeks.map((w, i) => ({ week: w, matchups: weekly[i] || [] })) };
  });
  h.weekly = perSeason; // kept for "trades in hindsight"
  return buildRecords(h, perSeason);
}

function buildRecords(h, perSeason) {
  const top = CONFIG.history.recordsTop;
  const champions = [], games = [], playerGames = [], seasonTotals = [];
  const mgr = {}; // owner_id -> all-time totals
  const M = (owner, name) => (mgr[owner] = mgr[owner] || { owner, name: h.managers[owner] || name, seasons: 0, w: 0, l: 0, t: 0, pf: 0, pa: 0, titles: 0, finals: 0, playoffs: 0 });

  for (const { si, finished, bracket, weeks } of perSeason) {
    const lg = si.league;
    const playoffStart = lg.settings.playoff_week_start || 99;
    // Champion: the winner of the 1st-place game in the winners bracket.
    const final = bracket.find(m => m.p === 1 && m.w);
    if (final) champions.push({ season: si.season, champ: si.team(final.w), runnerUp: si.team(final.l) });
    else champions.push({ season: si.season, champ: null, inProgress: !finished });
    const inPlayoffs = new Set();
    for (const m of bracket) { if (m.t1) inPlayoffs.add(m.t1); if (m.t2) inPlayoffs.add(m.t2); }

    // Regular-season totals per manager (from each season's final standings)
    for (const r of si.rosters) {
      if (!r.owner_id || !(r.players || []).length && finished === false) continue;
      const st = r.settings || {}, t = si.team(r.roster_id), m = M(r.owner_id, t.name);
      const pf = (st.fpts || 0) + (st.fpts_decimal || 0) / 100, pa = (st.fpts_against || 0) + (st.fpts_against_decimal || 0) / 100;
      m.seasons++; m.w += st.wins || 0; m.l += st.losses || 0; m.t += st.ties || 0; m.pf += pf; m.pa += pa;
      if (inPlayoffs.has(r.roster_id)) m.playoffs++;
      if (final && final.w === r.roster_id) m.titles++;
      if (final && (final.w === r.roster_id || final.l === r.roster_id)) m.finals++;
      if (finished) seasonTotals.push({ season: si.season, team: t, pf, w: st.wins || 0, l: st.losses || 0, t: st.ties || 0 });
    }

    // Every game, for single-game records
    for (const { week, matchups } of weeks) {
      const playoff = week >= playoffStart;
      const byMatch = {};
      for (const m of matchups) {
        if (!m || !m.points) continue;
        const t = si.team(m.roster_id);
        // Best single-player game (starters only)
        const pts = m.players_points || {};
        for (const pid of m.starters || []) {
          if (pid && pid !== '0' && pts[pid] != null) playerGames.push({ season: si.season, week, playoff, team: t, pid, pts: pts[pid] });
        }
        if (playoff && m.matchup_id == null) continue; // not in a playoff game that week
        games.push({ season: si.season, week, playoff, team: t, pts: m.points });
        if (m.matchup_id != null) (byMatch[m.matchup_id] = byMatch[m.matchup_id] || []).push({ team: t, pts: m.points });
      }
      for (const id in byMatch) {
        const [a, b] = byMatch[id].sort((x, y) => y.pts - x.pts);
        if (b) games.push({ season: si.season, week, playoff, h2h: true, winner: a, loser: b, margin: Math.round((a.pts - b.pts) * 100) / 100 });
      }
    }
  }

  const scores = games.filter(g => !g.h2h), h2h = games.filter(g => g.h2h);
  const byDesc = k => (a, b) => b[k] - a[k], byAsc = k => (a, b) => a[k] - b[k];
  playerGames.sort(byDesc('pts'));
  const managers = Object.values(mgr).map(m => Object.assign(m, { pct: (m.w + m.t / 2) / Math.max(1, m.w + m.l + m.t) }))
    .sort((a, b) => (b.titles - a.titles) || (b.pct - a.pct));
  return {
    champions,
    managers,
    highest: scores.slice().sort(byDesc('pts')).slice(0, top),
    lowest: scores.slice().sort(byAsc('pts')).slice(0, top),
    blowouts: h2h.slice().sort(byDesc('margin')).slice(0, top),
    closest: h2h.filter(g => g.margin > 0).sort(byAsc('margin')).slice(0, top),
    playerBest: playerGames.slice(0, top).map(g => Object.assign(g, { player: Object.assign({ id: g.pid }, h.pname(g.pid)) })),
    seasonPoints: seasonTotals.slice().sort(byDesc('pf')).slice(0, top),
    seasonRecord: seasonTotals.slice().sort((a, b) => (b.w - a.w) || (b.pf - a.pf)).slice(0, top),
    seasonsCount: perSeason.length,
  };
}

// ---------- Trades in hindsight ----------
// For each team in a trade: points the players it received scored in ITS starting lineup,
// every week from the trade on (stops if he leaves, starts again if he comes back).
// A used draft pick counts the player it became, the same way. Bench points don't count.
function tradeHindsight(h) {
  // Every played week, oldest first: { key, byRid: { roster_id: { starters: Set, pts } } }
  const weeks = [];
  for (const { si, weeks: ws } of h.weekly || []) {
    for (const { week, matchups } of ws) {
      const byRid = {};
      for (const m of matchups || []) {
        if (!m) continue;
        byRid[m.roster_id] = { starters: new Set(m.starters || []), pts: m.players_points || {} };
      }
      weeks.push({ season: Number(si.season), week, byRid });
    }
  }
  weeks.sort((a, b) => (a.season - b.season) || (a.week - b.week));
  const cfg = CONFIG.history.hindsight;
  const out = {};
  for (const t of h.trades) {
    const season = Number(t.season);
    const offseason = t.date && new Date(t.date) < new Date(season, 8, 1);
    const from = { season, week: offseason ? 1 : (t.week || 1) };
    const after = weeks.filter(w => w.season > from.season || (w.season === from.season && w.week >= from.week));
    const sides = t.sides.map(sd => {
      const rid = sd.team.rid;
      const items = sd.players.map(p => p.id).concat(sd.picks.filter(pk => pk.became && pk.became.id).map(pk => pk.became.id));
      const per = {};
      for (const pid of items) per[pid] = 0;
      for (const w of after) {
        const r = w.byRid[rid];
        if (!r) continue;
        for (const pid of items) if (r.starters.has(pid) && r.pts[pid] != null) per[pid] += r.pts[pid];
      }
      const total = Object.values(per).reduce((a, b) => a + b, 0);
      return { rid, per, total: Math.round(total * 10) / 10 };
    });
    const sorted = sides.slice().sort((a, b) => b.total - a.total);
    const diff = sides.length > 1 ? Math.round((sorted[0].total - sorted[1].total) * 10) / 10 : 0;
    const weeksSince = after.length;
    let verdict;
    if (weeksSince < cfg.minWeeks) verdict = { kind: 'early', winnerRid: null };
    else if (sorted[0].total < 1) verdict = { kind: 'none', winnerRid: null };
    else if (diff < cfg.evenPoints || diff < sorted[0].total * cfg.evenShare) verdict = { kind: 'even', winnerRid: null };
    else verdict = { kind: 'win', winnerRid: sorted[0].rid };
    out[t.id] = { sides, diff, weeksSince, verdict };
  }
  return out;
}
