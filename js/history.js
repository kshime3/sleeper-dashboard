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
  return { trades, moves, journeys, seasons, managers, first: seasons[seasons.length - 1], last: seasons[0] };
}

// Filters: { season: 'all' | '2024', team: 'all' | owner_id, q: 'text', type: 'all'|'waiver'|'free_agent'|'commissioner', failed: bool }
function filterHistory(h, view, f) {
  const q = (f.q || '').trim().toLowerCase();
  const names = list => list.map(p => p.name.toLowerCase());
  if (view === 'trades') {
    return h.trades.filter(t =>
      (f.season === 'all' || t.season === f.season) &&
      (f.team === 'all' || t.sides.some(s => s.team.owner === f.team)) &&
      (!q || t.sides.some(s => names(s.players).some(n => n.includes(q)) || s.picks.some(p => (p.label + ' ' + p.from + ' ' + (p.became ? p.became.name : '')).toLowerCase().includes(q)))));
  }
  return h.moves.filter(m =>
    (f.season === 'all' || m.season === f.season) &&
    (f.team === 'all' || m.team.owner === f.team) &&
    (f.type === 'all' || m.type === f.type) &&
    (f.failed || m.status === 'complete') &&
    (!q || names(m.adds).concat(names(m.drops)).some(n => n.includes(q))));
}
