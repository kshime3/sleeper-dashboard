// Logic: League Standings and the auto-written Weekly Recap.

function standingsTable(ctx) {
  const { league, rosters, users, userId } = ctx;
  const guillotine = isGuillotine(league);
  const rows = rosters.map(r => {
    const rec = recordOf(r);
    const s = r.settings || {};
    const u = users.find(x => x.user_id === r.owner_id);
    return {
      roster_id: r.roster_id,
      name: teamName(users, r),
      owner: u ? u.display_name : '',
      record: rec.text, wins: rec.wins, losses: rec.losses, ties: s.ties || 0,
      pf: rec.pts,
      pa: (s.fpts_against || 0) + (s.fpts_against_decimal || 0) / 100,
      streak: (r.metadata && r.metadata.streak) || '',
      mine: isMine(r, userId),
      alive: (r.players || []).length > 0,
    };
  });
  if (guillotine) {
    // Guillotine: survivors first (by points scored), then the chopped teams.
    rows.sort((a, b) => (b.alive - a.alive) || (b.pf - a.pf));
  } else {
    // Sleeper's usual order: wins, then ties, then points for.
    rows.sort((a, b) => (b.wins - a.wins) || (b.ties - a.ties) || (b.pf - a.pf));
  }
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rows, guillotine, playoffTeams: guillotine ? 0 : (league.settings.playoff_teams || 0) };
}

// Everything interesting about one week's games.
function weeklyRecap(ctx) {
  const { league, rosters, users, matchups, players, week } = ctx;
  const guillotine = isGuillotine(league);
  const nameOf = rid => teamName(users, rosters.find(r => r.roster_id === rid) || { roster_id: rid });
  const pname = id => (players[id] && players[id].name) || ('Player #' + id);

  // Only teams that played (guillotine: teams still alive that week have players listed).
  const teams = matchups.filter(m => (m.starters || []).some(id => id && id !== '0') || m.points > 0)
    .map(m => ({ ...m, name: nameOf(m.roster_id) }));
  if (!teams.length) return { empty: true, week };

  const byScore = teams.slice().sort((a, b) => b.points - a.points);
  const recap = { week, guillotine, high: byScore[0], low: byScore[byScore.length - 1], games: [] };

  if (guillotine) {
    recap.chopped = recap.low;
    recap.survivedBy = byScore.length > 1 ? byScore[byScore.length - 2] : null; // closest call
  } else {
    const groups = {};
    for (const t of teams) if (t.matchup_id != null) (groups[t.matchup_id] = groups[t.matchup_id] || []).push(t);
    for (const id in groups) {
      const [a, b] = groups[id].sort((x, y) => y.points - x.points);
      if (!b) continue;
      recap.games.push({ winner: a, loser: b, margin: Math.round((a.points - b.points) * 100) / 100, tie: a.points === b.points });
    }
    const sorted = recap.games.slice().sort((x, y) => y.margin - x.margin);
    recap.blowout = sorted[0] || null;
    recap.closest = sorted[sorted.length - 1] || null;
  }

  // Best single starter, and best bench performance (points scored while NOT in the lineup).
  let topStarter = null, topBench = null, mostLeft = null;
  for (const t of teams) {
    const pts = t.players_points || {};
    const starters = new Set(t.starters || []);
    let benchTotal = 0;
    for (const id of t.players || []) {
      const p = pts[id] || 0;
      if (starters.has(id)) {
        if (!topStarter || p > topStarter.pts) topStarter = { id, name: pname(id), team: t.name, pts: p };
      } else {
        benchTotal += p;
        if (!topBench || p > topBench.pts) topBench = { id, name: pname(id), team: t.name, pts: p };
      }
    }
    if (!mostLeft || benchTotal > mostLeft.pts) mostLeft = { team: t.name, pts: Math.round(benchTotal * 100) / 100 };
  }
  recap.topStarter = topStarter;
  recap.topBench = topBench && topBench.pts > 0 ? topBench : null;
  recap.mostLeft = mostLeft && mostLeft.pts > 0 ? mostLeft : null;
  return recap;
}

// The recap as plain text, ready to paste into the league chat.
function recapText(league, r) {
  const f = n => Number(n).toFixed(2);
  const lines = ['📰 ' + league.name + ' — Week ' + r.week + ' Recap', ''];
  lines.push('🔥 Top score: ' + r.high.name + ' — ' + f(r.high.points));
  if (r.guillotine) {
    lines.push('🪓 Chopped: ' + r.chopped.name + ' — ' + f(r.chopped.points));
    if (r.survivedBy) lines.push('😅 Closest call: ' + r.survivedBy.name + ' survived by ' + f(r.survivedBy.points - r.chopped.points));
  } else {
    if (r.blowout) lines.push('💥 Biggest blowout: ' + r.blowout.winner.name + ' ' + f(r.blowout.winner.points) + ' – ' + f(r.blowout.loser.points) + ' over ' + r.blowout.loser.name + ' (by ' + f(r.blowout.margin) + ')');
    if (r.closest && r.closest !== r.blowout) lines.push('😬 Closest game: ' + r.closest.winner.name + ' ' + f(r.closest.winner.points) + ' – ' + f(r.closest.loser.points) + ' over ' + r.closest.loser.name + (r.closest.tie ? ' (tie!)' : ' (by ' + f(r.closest.margin) + ')'));
    lines.push('🧊 Lowest score: ' + r.low.name + ' — ' + f(r.low.points));
  }
  if (r.topStarter) lines.push('⭐ Player of the week: ' + r.topStarter.name + ' (' + r.topStarter.team + ') — ' + f(r.topStarter.pts));
  if (r.topBench) lines.push('🪑 Best bench performance: ' + r.topBench.name + ' scored ' + f(r.topBench.pts) + ' on ' + r.topBench.team + '\'s bench');
  if (r.mostLeft) lines.push('🤦 Most points left on the bench: ' + r.mostLeft.team + ' — ' + f(r.mostLeft.pts));
  if (r.games.length) {
    lines.push('', 'Results:');
    for (const g of r.games) lines.push('• ' + g.winner.name + ' ' + f(g.winner.points) + ' – ' + f(g.loser.points) + ' ' + g.loser.name);
  }
  return lines.join('\n');
}
