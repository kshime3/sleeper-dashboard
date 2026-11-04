// Logic: the Game Day tab — all of your players from every league on one screen, with live games.

function leagueShortName(league) {
  if (league.short) return league.short;
  const note = CONFIG.leagueNotes[league.name];
  if (note && note.short) return note.short;
  if (isGuillotine(league)) return '🪓';
  return league.name.length <= 10 ? league.name : league.name.slice(0, 9) + '…';
}

// ctx: { leagues, leagueData (id -> { rosters, users, matchups }), players, games, userId, includeBench }
function analyzeGameDay(ctx) {
  const { leagues, leagueData, players, games, userId, includeBench } = ctx;
  const scoreboards = [];
  const byPlayer = {};
  const stillToPlay = (starters) => (starters || []).filter(id => {
    const g = gameFor(games, players[id]);
    return id && id !== '0' && (!g || g.state !== 'post');
  }).length;

  for (const league of leagues) {
    const d = leagueData[league.league_id];
    if (!d) continue;
    const mine = d.rosters.find(r => isMine(r, userId));
    if (!mine || !(mine.players || []).length) continue; // e.g. eliminated from the guillotine league
    const short = leagueShortName(league);
    const myMatch = d.matchups.find(m => m.roster_id === mine.roster_id);
    const pts = (myMatch && myMatch.players_points) || {};
    const starters = new Set(mine.starters || []);

    // Scoreboard for this league
    const board = { league, short, me: { name: teamName(d.users, mine), points: myMatch ? myMatch.points : 0, left: stillToPlay(mine.starters) } };
    if (isGuillotine(league)) {
      const alive = d.matchups.filter(m => d.rosters.some(r => r.roster_id === m.roster_id && (r.players || []).length));
      const sorted = alive.slice().sort((a, b) => b.points - a.points);
      board.guillotine = { rank: sorted.findIndex(m => m.roster_id === mine.roster_id) + 1, of: sorted.length, lowest: sorted[sorted.length - 1] };
    } else if (myMatch && myMatch.matchup_id != null) {
      const opp = d.matchups.find(m => m.matchup_id === myMatch.matchup_id && m.roster_id !== mine.roster_id);
      if (opp) {
        const oppRoster = d.rosters.find(r => r.roster_id === opp.roster_id);
        board.opp = { name: teamName(d.users, oppRoster), points: opp.points, left: stillToPlay(opp.starters) };
      }
    }
    scoreboards.push(board);

    // Your players in this league
    for (const id of mine.players || []) {
      const starting = starters.has(id);
      if (!starting && !includeBench) continue;
      const p = players[id];
      if (!p) continue;
      const entry = byPlayer[id] = byPlayer[id] || { player: p, game: gameFor(games, p), leagues: [] };
      entry.leagues.push({ short, starting, pts: pts[id] });
    }
  }

  // Group players by game state; within a group, earliest kickoff first, then position.
  const order = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 6 };
  const sortFn = (a, b) => ((a.game && a.game.kickoff) || 0) - ((b.game && b.game.kickoff) || 0) ||
    (order[a.player.pos] || 9) - (order[b.player.pos] || 9) || a.player.name.localeCompare(b.player.name);
  const all = Object.values(byPlayer);
  // A player counts as "starting" if he starts in at least one league.
  for (const e of all) e.startsSomewhere = e.leagues.some(l => l.starting);
  const groups = [
    { key: 'in', title: '🟢 Playing now', rows: all.filter(e => e.game && e.game.state === 'in').sort(sortFn) },
    { key: 'pre', title: '🕐 Still to play', rows: all.filter(e => (e.game && e.game.state === 'pre') || (!e.game && !games.source)).sort(sortFn) },
    { key: 'post', title: '✅ Done', rows: all.filter(e => e.game && e.game.state === 'post').sort(sortFn) },
    // No game this week (bye, or not on an NFL team) — only knowable when game info loaded.
    { key: 'none', title: '😴 Not playing this week', rows: all.filter(e => !e.game && games.source).sort(sortFn) },
  ];
  return { scoreboards, groups, count: all.length };
}
