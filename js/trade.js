// Logic: the Trade Analyzer — a simple, see-through "trade value" for each player.
//
//   value = (blended points per game − best free agent at his position) × age adjustment × injury adjustment
//
//   blended = recentWeight% × last-few-weeks average + the rest × season average (league scoring)

function leagueFormat(league) {
  const note = CONFIG.leagueNotes[league.name];
  if (note && note.format) return note.format;
  if (league.settings.type === 2) return 'dynasty';
  if (league.settings.type === 1) return 'keeper';
  return 'redraft';
}

function defaultTradeSettings(league) {
  const t = CONFIG.trade;
  return { recentWeight: t.recentWeight, ageEffect: t.ageEffect[leagueFormat(league)] || 0, injuryEffect: t.injuryEffect, useFP: true };
}

// FantasyPros dynasty values, saved into data/dynasty-values.json once a day by a GitHub Action
// (tools/update-dynasty.js). Same website as this page, so the phone can read it.
let dynastyPromise = null;
function loadDynastyValues() {
  if (!dynastyPromise) {
    dynastyPromise = fetch('data/dynasty-values.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null).catch(() => null);
  }
  return dynastyPromise;
}

// Does this league use FantasyPros values? (dynasty leagues, when the file loaded and the switch is on)
function usesFP(league, settings, fp) {
  return !!(fp && settings.useFP && leagueFormat(league) === 'dynasty');
}

// FantasyPros value for one player in this league: superflex value for QBs in superflex leagues,
// TE-premium value for TEs if the league pays extra for TE catches. Unlisted players get
// FantasyPros' own "All other QBs/RBs/WRs/TEs" value.
function fpValue(fp, league, p) {
  const sf = (league.roster_positions || []).includes('SUPER_FLEX');
  const tep = (league.scoring_settings || {}).bonus_rec_te > 0;
  const pick = row => (p.pos === 'QB' && sf && row.sf != null) ? row.sf : (p.pos === 'TE' && tep && row.tep != null) ? row.tep : row.v;
  const row = fp.players[p.id];
  if (row) {
    const parts = String(row.chg || '').split(' / ');
    const chg = parts.length > 1 && ((p.pos === 'QB' && sf) || (p.pos === 'TE' && tep)) ? parts[1] : parts[0];
    return { value: pick(row), listed: true, chg: chg && chg !== '-' ? chg : '', kind: (p.pos === 'QB' && sf) ? 'superflex' : (p.pos === 'TE' && tep) ? 'TE-premium' : '' };
  }
  const other = fp.others[p.pos];
  return { value: other ? pick(other) : 0, listed: false, chg: '', kind: '' };
}

function ageFactor(p, strength) {
  const t = CONFIG.trade, peak = t.peakAge[p.pos];
  if (!peak || !p.age || !strength) return { factor: 1, text: '' };
  const s = strength / 100;
  let change;
  if (p.age > peak) change = -(p.age - peak) * (t.agePenaltyPerYear[p.pos] || 0.05) * s;
  else change = Math.min(t.youthBonusMax, (peak - p.age) * t.youthBonusPerYear) * s;
  const factor = Math.max(0.3, 1 + change);
  return { factor, text: Math.round((factor - 1) * 100) ? (factor > 1 ? '+' : '−') + Math.abs(Math.round((factor - 1) * 100)) + '%' : '' };
}

function injuryFactor(p, strength) {
  const cut = (CONFIG.trade.injuryCut[p.injury] || 0) * strength / 100;
  return { factor: 1 - cut, text: cut ? '−' + Math.round(cut * 100) + '%' : '' };
}

// Work out every player's numbers in this league. weekStats = [{ week, stats }] newest first.
function tradeValues(ctx, settings) {
  const { league, rosters, players, seasonStats, weekStats, byes } = ctx;
  const scoring = league.scoring_settings || {};
  const w = settings.recentWeight / 100;

  const base = id => {
    const p = players[id];
    if (!p) return null;
    const season = seasonLine(seasonStats, id, scoring, p.pos);
    const recent = weekStats.map(ws => {
      const s = ws.stats && ws.stats[id];
      return { week: ws.week, pts: s && s.gp ? fantasyPoints(s, scoring, p.pos) : null };
    });
    const played = recent.filter(r => r.pts != null);
    const recentPpg = played.length ? played.reduce((a, r) => a + r.pts, 0) / played.length : null;
    // No recent games (hurt/benched)? Then use the season average for the recent part too.
    const blended = recentPpg == null ? season.ppg : (1 - w) * season.ppg + w * recentPpg;
    return { player: p, season, recent, recentPpg, blended, flags: playerFlags(p, byes, false) };
  };

  // Replacement level: the best free agent (by the same blend) at each position.
  const rostered = new Set();
  for (const r of rosters) for (const id of r.players || []) rostered.add(id);
  const repl = {}, replWho = {};
  for (const id in players) {
    const p = players[id];
    if (rostered.has(id) || !p.team) continue;
    const season = seasonStats[id];
    if (!season || (season.gp || 0) < CONFIG.trade.minGamesForReplacement) continue;
    if ((CONFIG.trade.injuryCut[p.injury] || 0) >= 0.4) continue; // long-term injured don't count
    const b = base(id);
    if (b && b.blended > (repl[p.pos] || 0)) { repl[p.pos] = b.blended; replWho[p.pos] = p.name; }
  }

  const fp = usesFP(league, settings, ctx.fp) ? ctx.fp : null;
  const values = {};
  for (const r of rosters) {
    for (const id of r.players || []) {
      const b = base(id);
      if (!b) continue;
      if (fp) {
        b.fp = fpValue(fp, league, b.player);
        b.value = b.fp.value;
        values[id] = b;
        continue;
      }
      const pos = b.player.pos;
      const over = b.blended - (repl[pos] || 0);
      const age = ageFactor(b.player, settings.ageEffect);
      const inj = injuryFactor(b.player, settings.injuryEffect);
      b.repl = repl[pos] || 0;
      b.replWho = replWho[pos] || 'nobody';
      b.over = over;
      b.age = age; b.inj = inj;
      b.value = Math.max(0, over) * age.factor * inj.factor;
      values[id] = b;
    }
  }
  return values;
}

function compareTrade(values, giveIds, getIds) {
  const side = ids => {
    const rows = ids.map(id => values[id]).filter(Boolean);
    return {
      rows,
      value: rows.reduce((a, r) => a + r.value, 0),
      seasonPts: rows.reduce((a, r) => a + r.season.total, 0),
      blended: rows.reduce((a, r) => a + r.blended, 0),
    };
  };
  const give = side(giveIds), get = side(getIds);
  const diff = get.value - give.value;
  const bigger = Math.max(give.value, get.value) || 1;
  const pct = diff / bigger * 100;
  let verdict;
  if (!giveIds.length || !getIds.length) verdict = { text: 'Pick at least one player on each side.', cls: '' };
  else if (Math.abs(pct) < 10) verdict = { text: 'Pretty even trade', cls: '' };
  else if (diff > 0) verdict = { text: Math.abs(pct) < 25 ? 'Leans your way' : 'Clearly wins for you', cls: 'lead' };
  else verdict = { text: Math.abs(pct) < 25 ? 'Leans their way' : 'Clearly wins for them', cls: 'trail' };
  return { give, get, diff, pct, verdict, spotsChange: giveIds.length - getIds.length };
}

// ---------- Draft picks (dynasty, FantasyPros values) ----------
// Every team starts with its own picks for the next 3 seasons; Sleeper's traded_picks list says
// who owns what now. Next year's picks are valued at a slot projected from current standings
// (worst record = 1.01); later years use the round average, since the order is unknown.

function roundName(n) { return n + (['th', 'st', 'nd', 'rd'][n] || 'th'); }

function projectedSlots(rosters) {
  const sorted = rosters.slice().sort((a, b) => {
    const A = recordOf(a), B = recordOf(b);
    return (A.wins - B.wins) || (A.pts - B.pts);
  });
  const slots = {};
  sorted.forEach((r, i) => { slots[r.roster_id] = i + 1; });
  return slots;
}

function pickRowName(round, slot, teams) {
  if (round === 1) return '1.' + String(slot).padStart(2, '0');
  const third = slot <= teams / 3 ? 'Early' : slot <= teams * 2 / 3 ? 'Mid' : 'Late';
  if (round === 2 || round === 3) return third + ' ' + roundName(round);
  if (round === 4) return (slot <= teams / 2 ? 'Early' : 'Late') + ' 4th';
  return 'Round 5+';
}

function average(rows) { return rows.length ? rows.reduce((a, r) => a + r, 0) / rows.length : 0; }

function draftPickValues(ctx) {
  const { league, rosters, users, tradedPicks, fp } = ctx;
  const out = {};
  if (!fp || !fp.picks || !fp.picks.length) return out;
  const sf = (league.roster_positions || []).includes('SUPER_FLEX');
  const pickVal = row => row ? (sf ? row.sf : row.v) : 0;
  const teams = rosters.length;
  const rounds = league.settings.draft_rounds || 4;
  const first = Number(league.season) + 1;
  const slots = projectedSlots(rosters);
  const tables = {};
  for (const t of fp.picks) tables[t.year] = t.rows;
  const lastYear = Math.max(...fp.picks.map(t => Number(t.year)));

  for (let season = first; season < first + 3; season++) {
    const exact = !!tables[season];
    const rows = tables[season] || tables[lastYear];
    for (const r of rosters) {
      for (let round = 1; round <= rounds; round++) {
        const trade = (tradedPicks || []).find(t => Number(t.season) === season && t.round === round && t.roster_id === r.roster_id);
        const owner = trade ? trade.owner_id : r.roster_id;
        let value, how;
        if (season === first && exact) {
          const name = pickRowName(round, slots[r.roster_id], teams);
          const row = rows.find(x => x.pick === name) || rows[rows.length - 1];
          value = pickVal(row);
          how = 'projected ' + name + ' (' + teamName(users, r) + ' has the ' + ordinal(teams + 1 - slots[r.roster_id]) + '-best record of ' + teams + ' right now)';
        } else {
          const re = round === 1 ? /^1\./ : new RegExp(roundName(round) + '$');
          const matches = rows.filter(x => re.test(x.pick));
          value = Math.round(matches.length ? average(matches.map(pickVal)) : pickVal(rows[rows.length - 1]));
          how = matches.length ? 'average ' + roundName(round) + '-round value (draft order unknown)' : 'FantasyPros "all others" pick value';
          if (!exact) how += ', using ' + lastYear + ' values';
        }
        const id = 'pick-' + season + '-' + round + '-' + r.roster_id;
        const own = owner === r.roster_id;
        out[id] = {
          isPick: true, owner, value, est: !exact, from: own ? '' : teamName(users, r),
          player: { id, name: season + ' ' + roundName(round), pos: 'PICK', team: '', positions: ['PICK'], age: 0, injury: '' },
          why: 'FantasyPros ' + fp.source.month + (sf ? ' superflex' : '') + ' pick value: ' + value + (exact ? '' : ' (est.)') + ' — ' + how,
          season: { total: 0, ppg: 0, games: 0 }, recent: [], flags: [], blended: 0,
        };
      }
    }
  }
  return out;
}
