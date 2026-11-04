// Logic: your ESPN leagues, read through your private relay (tools/espn-relay.js, a Cloudflare Worker),
// turned into the same shapes the app uses for Sleeper leagues (league, rosters, users, matchups),
// so My Team, Game Day, Standings, the jumbotron and the player panel work for them too.
// ESPN leagues are owner-only (they need the owner's ESPN login on the relay).

const ESPN_POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
// ESPN lineup slot id -> the app's slot name (Sleeper style). 20 = bench, 21 = IR.
const ESPN_SLOT = { 0: 'QB', 2: 'RB', 3: 'WRRB_FLEX', 4: 'WR', 5: 'REC_FLEX', 6: 'TE', 7: 'SUPER_FLEX', 16: 'DEF', 17: 'K', 23: 'FLEX', 20: 'BN', 21: 'IR' };
const ESPN_SLOT_ORDER = [0, 2, 3, 4, 5, 6, 23, 7, 16, 17];
const ESPN_TEAM = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND',
  12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI',
  23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

function isEspn(league) { return !!(league && league.source === 'espn'); }

// Download one ESPN league's compact summary from the relay.
function loadEspnSummary(espnId, season) {
  return cachedJSON(CONFIG.espn.relay + '/summary/' + season + '/' + espnId);
}

// A league object the rest of the app understands (shown in the league picker).
function espnLeagueObject(cfg, sum) {
  const slots = [];
  for (const id of ESPN_SLOT_ORDER) for (let i = 0; i < (sum.slots[id] || 0); i++) slots.push(ESPN_SLOT[id]);
  for (let i = 0; i < (sum.slots[20] || 0); i++) slots.push('BN');
  return {
    league_id: 'espn-' + cfg.id, source: 'espn', espnId: cfg.id, short: cfg.short,
    name: sum.name, season: String(sum.season), status: 'in_season', total_rosters: sum.size,
    roster_positions: slots, scoring_settings: {},
    settings: { type: cfg.format === 'dynasty' ? 2 : 0, playoff_teams: sum.playoffTeams, playoff_week_start: sum.regWeeks + 1 },
    espn: sum,
  };
}

// Match ESPN players to the app's (Sleeper) player list by name + position (+ team when needed),
// so they get injury tags, game status and the player panel. Unmatched players get a stand-in entry.
const normName = n => String(n || '').toLowerCase().replace(/[.'’]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/[^a-z]/g, '');
let espnIndex = null, espnIndexFor = null;
function espnPlayerId(row, players) {
  const [espnId, name, posId, proTeamId] = row;
  const pos = ESPN_POS[posId] || '';
  const team = ESPN_TEAM[proTeamId] || '';
  if (pos === 'DEF') return team && players[team] ? team : 'espn:' + espnId;
  if (espnIndexFor !== players) {
    espnIndex = {};
    for (const id in players) {
      const p = players[id];
      for (const ps of p.positions) (espnIndex[normName(p.name) + '|' + ps] = espnIndex[normName(p.name) + '|' + ps] || []).push(id);
    }
    espnIndexFor = players;
  }
  let ids = espnIndex[normName(name) + '|' + pos] || [];
  if (ids.length > 1) ids = ids.filter(id => players[id].team === team);
  if (ids.length === 1) return ids[0];
  // Nickname? (ESPN "Bam Knight" = Zonovan Knight) Try last name + position + team, if only one fits.
  if (!ids.length && team) {
    const last = normName(String(name).replace(/\b(Jr|Sr|II|III|IV|V)\.?$/i, '').trim().split(/\s+/).pop());
    const byLast = Object.keys(players).filter(id => players[id].team === team && players[id].positions.includes(pos) && normName(players[id].name).endsWith(last));
    if (byLast.length === 1) return byLast[0];
  }
  // Not found: add a stand-in so the name still shows.
  const sid = 'espn:' + espnId;
  if (!players[sid]) players[sid] = { id: sid, name, pos, team, injury: '', age: 0, exp: 0, rank: 9e9, positions: [pos] };
  return sid;
}

// Turn the summary into { rosters, users, matchups } like a Sleeper league.
// Your team's roster gets YOUR (Sleeper) user id as owner, so "is this mine?" works everywhere.
function adaptEspnLeague(league, sum, players, myUserId) {
  const users = [], rosters = [];
  for (const t of sum.teams) {
    const owner = t.mine ? myUserId : 'espn:' + t.owner;
    users.push({ user_id: owner, display_name: t.ownerName, metadata: { team_name: t.name } });
    const live = sum.live[t.id];
    const entries = live ? live.roster.map(r => ({ id: espnPlayerId(r, players), slot: r[4], pts: r[5], proj: r[6] })) : [];
    // Starters in the same order as the league's lineup slots
    const starters = [];
    const bySlot = {};
    for (const e of entries) if (e.slot !== 20 && e.slot !== 21) (bySlot[e.slot] = bySlot[e.slot] || []).push(e.id);
    for (const id of ESPN_SLOT_ORDER) for (let i = 0; i < (sum.slots[id] || 0); i++) starters.push((bySlot[id] || [])[i] || '0');
    const pf = t.pf || 0, pa = t.pa || 0;
    rosters.push({
      roster_id: t.id, owner_id: owner, players: entries.map(e => e.id), starters,
      reserve: entries.filter(e => e.slot === 21).map(e => e.id), taxi: null,
      settings: { wins: t.w, losses: t.l, ties: t.t, fpts: Math.floor(pf), fpts_decimal: Math.round((pf % 1) * 100), fpts_against: Math.floor(pa), fpts_against_decimal: Math.round((pa % 1) * 100) },
      metadata: { streak: t.streak },
      espn: { entries, proj: live ? live.proj : null, winProb: live ? live.winProb : null },
    });
  }
  return { rosters, users, matchups: espnMatchups(sum, rosters, sum.week) };
}

// One week's matchups (Sleeper style). This week has lineups and player points; past weeks only scores.
function espnMatchups(sum, rosters, week) {
  const out = [];
  let mid = 0;
  for (const g of sum.schedule) {
    if (g.w !== week) continue;
    mid++;
    for (const [rid, pts] of [[g.h, g.hp], [g.a, g.ap]]) {
      if (rid == null) continue;
      const r = rosters.find(x => x.roster_id === rid);
      const current = week === sum.week && r && r.espn.entries.length;
      out.push({
        roster_id: rid, matchup_id: g.a == null ? null : mid,
        points: current ? (sum.live[rid] ? sum.live[rid].pts : pts) : pts,
        starters: current ? r.starters : [], players: current ? r.players : [],
        players_points: current ? Object.fromEntries(r.espn.entries.map(e => [e.id, e.pts])) : {},
      });
    }
  }
  return out;
}
