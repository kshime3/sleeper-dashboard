// Logic: everything the My Team tab needs, worked out from Sleeper data. No drawing here.

function teamName(users, roster) {
  const u = users.find(x => x.user_id === roster.owner_id);
  if (!u) return 'Team ' + roster.roster_id;
  return ((u.metadata && u.metadata.team_name) || u.display_name || ('Team ' + roster.roster_id)).trim();
}

function recordOf(roster) {
  const s = roster.settings || {};
  const pts = (s.fpts || 0) + (s.fpts_decimal || 0) / 100;
  const ties = s.ties ? '-' + s.ties : '';
  return { text: (s.wins || 0) + '-' + (s.losses || 0) + ties, wins: s.wins || 0, losses: s.losses || 0, pts };
}

function isMine(roster, userId) {
  return roster.owner_id === userId || (roster.co_owners || []).includes(userId);
}

function isGuillotine(league) {
  return league.settings && league.settings.type === 3;
}

// Problems with one player this week: [{ level: 'warn'|'bad', text }]
// gameOver = his game is finished (or he already scored), so a "Questionable" no longer matters.
function playerFlags(player, byes, gameOver) {
  const flags = [];
  if (!player) return flags;
  if (byes && player.team && byes.has(player.team)) flags.push({ level: 'bad', tag: 'BYE', text: 'on bye' });
  if (!player.team) flags.push({ level: 'bad', tag: 'FA', text: 'not on an NFL team' });
  const inj = CONFIG.injuries[player.injury];
  if (inj && !(gameOver && inj.level === 'warn')) {
    flags.push({ level: inj.level, tag: inj.tag, text: player.injury === 'Questionable' ? 'questionable' : player.injury });
  }
  return flags;
}

function canPlay(slot, player) {
  const ok = CONFIG.slotEligibility[slot];
  return !!(player && ok && player.positions.some(p => ok.includes(p)));
}

function analyzeMyTeam(ctx) {
  const { league, rosters, users, matchups, players, week, userId, byes, games } = ctx;
  const mine = rosters.find(r => isMine(r, userId));
  if (!mine) return { notOnLeague: true };

  const myMatch = matchups.find(m => m.roster_id === mine.roster_id) || null;
  const pts = (myMatch && myMatch.players_points) || {};
  const lookup = id => players[id] || (id && id !== '0' ? { id, name: 'Player #' + id, pos: '?', team: '', injury: '', positions: [] } : null);

  const slots = (league.roster_positions || []).filter(s => s !== 'BN' && s !== 'IR' && s !== 'TAXI');
  const starterIds = mine.starters || [];
  const starterSet = new Set(starterIds);
  const reserve = mine.reserve || [], taxi = mine.taxi || [];
  const benchIds = (mine.players || []).filter(id => !starterSet.has(id) && !reserve.includes(id) && !taxi.includes(id));

  const row = (id, slot) => {
    const p = lookup(id);
    const scored = pts[id];
    const game = gameFor(games, p);
    // Locked = his game has started, so Sleeper won't let you move him.
    const locked = !!game && game.state !== 'pre';
    const gameOver = (game && game.state === 'post') || scored > 0;
    return { id, slot, label: CONFIG.slotLabels[slot] || slot, player: p, pts: scored, game, locked, flags: playerFlags(p, byes, gameOver) };
  };

  const starters = slots.map((slot, i) => {
    const id = starterIds[i];
    const r = row(id, slot);
    if (!r.player) r.flags = [{ level: 'bad', tag: 'EMPTY', text: 'empty spot' }];
    return r;
  });
  const bench = benchIds.map(id => row(id, 'BN'));
  const benchSorted = bench.slice().sort((a, b) => (a.player ? a.player.rank : 9e9) - (b.player ? b.player.rank : 9e9));

  // For each problem starter you can still change, suggest bench players who could fill in
  // (healthy, playing this week, and whose game hasn't started yet).
  for (const s of starters) {
    if (!s.flags.length || s.locked) continue;
    s.swaps = benchSorted
      .filter(b => canPlay(s.slot, b.player) && !b.flags.some(f => f.level === 'bad') && !b.locked)
      .slice(0, 2)
      .map(b => b.player.name);
  }

  // Problems you can still fix come first; ones whose game already started are greyed (too late).
  const alerts = starters
    .filter(s => s.flags.length)
    .map(s => ({
      level: s.locked ? 'locked' : s.flags.some(f => f.level === 'bad') ? 'bad' : 'warn',
      text: s.label + ': ' + (s.player ? s.player.name + ' is ' : '') + s.flags.map(f => f.text).join(', ') +
        (s.locked ? (s.game.state === 'post' ? ' — his game is over' : ' — his game has started, too late to swap') : ''),
      swaps: s.swaps || [],
    }))
    .sort((a, b) => (a.level === 'locked') - (b.level === 'locked'));

  const result = {
    week,
    me: { name: teamName(users, mine), record: recordOf(mine), points: myMatch ? myMatch.points : null },
    starters, bench,
    reserve: reserve.map(id => row(id, 'IR')),
    taxi: taxi.map(id => row(id, 'TAXI')),
    alerts,
    byesKnown: !!byes,
    format: (CONFIG.leagueNotes[league.name] || {}).format || (league.settings.type === 2 ? 'dynasty' : null),
  };

  if (isGuillotine(league)) {
    const alive = rosters.filter(r => (r.players || []).length > 0);
    const eliminated = !(mine.players || []).length;
    const scores = alive.map(r => {
      const m = matchups.find(x => x.roster_id === r.roster_id);
      return { roster_id: r.roster_id, name: teamName(users, r), points: m ? m.points : 0 };
    }).sort((a, b) => b.points - a.points);
    const rank = scores.findIndex(s => s.roster_id === mine.roster_id) + 1;
    const last = scores[scores.length - 1];
    result.guillotine = {
      eliminated, aliveCount: alive.length, totalTeams: rosters.length, rank,
      lowest: last, scores,
      cushion: (!eliminated && last && last.roster_id !== mine.roster_id) ? (myMatch ? myMatch.points : 0) - last.points : null,
    };
    return result;
  }

  if (myMatch && myMatch.matchup_id != null) {
    const oppMatch = matchups.find(m => m.matchup_id === myMatch.matchup_id && m.roster_id !== mine.roster_id);
    if (oppMatch) {
      const oppRoster = rosters.find(r => r.roster_id === oppMatch.roster_id);
      result.opp = { name: teamName(users, oppRoster), record: recordOf(oppRoster), points: oppMatch.points };
    }
  }
  return result;
}
