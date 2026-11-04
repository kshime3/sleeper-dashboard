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
      settings: { waiver_budget_used: league.espnFaab ? (league.espnFaab.spent[t.id] || 0) : 0, wins: t.w, losses: t.l, ties: t.t, fpts: Math.floor(pf), fpts_decimal: Math.round((pf % 1) * 100), fpts_against: Math.floor(pa), fpts_against_decimal: Math.round((pa % 1) * 100) },
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

// ---------- ESPN scoring ----------
// ESPN scores with numbered stat codes; the app has Sleeper's raw stats (named). This turns an ESPN
// stat code into the matching value from Sleeper's stats for the same game. Worked out by matching
// both sources player by player for week 8 of 2026 (see docs). Defense points/yards-allowed ranges
// differ between ESPN and Sleeper, so they're worked out from the raw totals.
const sumKeys = (s, keys) => keys.reduce((a, k) => a + (s[k] || 0), 0);
const inRange = (v, lo, hi) => (v != null && v >= lo && v <= hi ? 1 : 0);
// Sleeper leaves out zero stats: a defense that played but has no pts_allow pitched a shutout.
const ptsAllowed = s => (s.pts_allow != null ? s.pts_allow : (s.yds_allow != null || s.gp ? 0 : null));
const ESPN_STAT = {
  3: s => s.pass_yd, 4: s => s.pass_td, 19: s => s.pass_2pt, 20: s => s.pass_int,
  23: s => s.rush_att, 24: s => s.rush_yd, 25: s => s.rush_td, 26: s => s.rush_2pt,
  42: s => s.rec_yd, 43: s => s.rec_td, 44: s => s.rec_2pt, 53: s => s.rec, 58: s => s.rec_tgt,
  63: s => s.fum_rec_td, 68: s => s.fum, 72: s => s.fum_lost,
  // Kicking
  74: s => s.fgm_50p, 76: s => s.fgmiss_50p, 77: s => s.fgm_40_49, 79: s => s.fgmiss_40_49,
  80: s => sumKeys(s, ['fgm_0_19', 'fgm_20_29', 'fgm_30_39']), 82: s => sumKeys(s, ['fgmiss_0_19', 'fgmiss_20_29', 'fgmiss_30_39']),
  83: s => s.fgm, 85: s => s.fgmiss, 86: s => s.xpm, 88: s => s.xpmiss, 198: s => s.fgm_50_59, 201: s => s.fgm_60p,
  // Defense / special teams
  95: s => s.int, 96: s => s.fum_rec, 97: s => s.blk_kick, 98: s => s.safe, 99: s => s.sack, 106: s => s.ff,
  101: s => s.def_st_td, 103: s => s.def_td, // (Sleeper combines kick+punt return TDs, and INT+fumble return TDs)
  114: s => s.def_kr_yd, 115: s => s.def_pr_yd, 206: s => s.def_2pt,
  // Points allowed ranges (from the raw total)
  89: s => inRange(ptsAllowed(s), 0, 0), 90: s => inRange(ptsAllowed(s), 1, 6), 91: s => inRange(ptsAllowed(s), 7, 13),
  92: s => inRange(ptsAllowed(s), 14, 17), 121: s => inRange(ptsAllowed(s), 18, 21), 122: s => inRange(ptsAllowed(s), 22, 27),
  123: s => inRange(ptsAllowed(s), 28, 34), 124: s => inRange(ptsAllowed(s), 35, 45), 125: s => inRange(ptsAllowed(s), 46, 999),
  // Yards allowed ranges
  128: s => inRange(s.yds_allow, -999, 99), 129: s => inRange(s.yds_allow, 100, 199), 130: s => inRange(s.yds_allow, 200, 299),
  131: s => inRange(s.yds_allow, 300, 349), 132: s => inRange(s.yds_allow, 350, 399), 133: s => inRange(s.yds_allow, 400, 449),
  134: s => inRange(s.yds_allow, 450, 499), 135: s => inRange(s.yds_allow, 500, 549), 136: s => inRange(s.yds_allow, 550, 9999),
};
const ESPN_POS_SLOT = { QB: 0, RB: 2, WR: 4, TE: 6, DEF: 16, K: 17 };
const ESPN_DEF_ONLY = new Set([89, 90, 91, 92, 121, 122, 123, 124, 125, 128, 129, 130, 131, 132, 133, 134, 135, 136]);

// Season totals can't use per-game ranges, so for a DEF's season, use Sleeper's per-game range COUNTS,
// mapped to ESPN's nearest ranges (a close estimate; weekly DEF points are exact).
const ESPN_SEASON_DEF = {
  89: s => s.pts_allow_0, 90: s => s.pts_allow_1_6, 91: s => s.pts_allow_7_13,
  92: s => (s.pts_allow_14_20 || 0) / 2, 121: s => (s.pts_allow_14_20 || 0) / 2, // ESPN splits 14-17 / 18-21
  122: s => s.pts_allow_21_27, 123: s => s.pts_allow_28_34, 124: s => s.pts_allow_35p, 125: () => 0,
  128: s => s.yds_allow_0_100, 129: s => s.yds_allow_100_199, 130: s => s.yds_allow_200_299, 131: s => s.yds_allow_300_349,
  132: s => s.yds_allow_350_399, 133: s => s.yds_allow_400_449, 134: s => s.yds_allow_450_499, 135: s => s.yds_allow_500_549, 136: s => s.yds_allow_550p,
};

// Fantasy points for one player's stats (Sleeper format) under an ESPN league's scoring rules.
// season = true when stats are season totals (changes how defense ranges are counted).
function espnPoints(stats, rules, pos, season) {
  if (!stats || !rules) return 0;
  const slot = ESPN_POS_SLOT[pos];
  let pts = 0;
  for (const r of rules) {
    if (ESPN_DEF_ONLY.has(r.statId) && pos !== 'DEF') continue;
    const f = (season && pos === 'DEF' && ESPN_SEASON_DEF[r.statId]) || ESPN_STAT[r.statId];
    if (!f) continue;
    const v = f(stats);
    if (!v) continue;
    const per = r.pointsOverrides && r.pointsOverrides[slot] != null ? r.pointsOverrides[slot] : r.points;
    pts += v * per;
  }
  return Math.round(pts * 100) / 100;
}

// Scoring rules and FAAB for an ESPN league (two small downloads through the relay's raw route).
async function loadEspnExtras(league) {
  if (league.espnRules) return league;
  const base = CONFIG.espn.relay + '/league/' + league.season + '/' + league.espnId;
  const [set, tm] = await Promise.all([cachedJSON(base + '?view=mSettings'), cachedJSON(base + '?view=mTeam').catch(() => null)]);
  const st = set.settings || {};
  league.espnRules = (st.scoringSettings && st.scoringSettings.scoringItems) || [];
  const acq = st.acquisitionSettings || {};
  league.espnFaab = { using: !!acq.isUsingAcquisitionBudget, budget: acq.acquisitionBudget || 0, spent: {} };
  for (const t of (tm && tm.teams) || []) league.espnFaab.spent[t.id] = (t.transactionCounter && t.transactionCounter.acquisitionBudgetSpent) || 0;
  // FAAB in the same shape as Sleeper leagues, so the Waiver Wire's "FAAB left" works
  league.settings.waiver_type = league.espnFaab.using ? 2 : 0;
  league.settings.waiver_budget = league.espnFaab.budget;
  return league;
}

// Points for an ESPN league: Sleeper's raw stats scored with the league's ESPN rules.
function espnScorer(league) {
  return (stats, pos, season) => espnPoints(stats, league.espnRules, pos, season);
}
