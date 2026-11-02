// Logic: everything for the player details panel (opens when you tap a player).

// ctx: { id, players, games, leagues, leagueData, userId, pointsLeague, points }
function playerDetails(ctx) {
  const { id, players, games, leagues, leagueData, userId, pointsLeague, points } = ctx;
  const p = players[id];
  if (!p) return null;

  // Who has him in each of your leagues?
  const ownership = [];
  for (const league of leagues) {
    const d = leagueData[league.league_id];
    if (!d) continue;
    const owner = d.rosters.find(r => (r.players || []).includes(id));
    const mine = owner && isMine(owner, userId);
    const match = owner && d.matchups.find(m => m.roster_id === owner.roster_id);
    ownership.push({
      league, short: leagueShortName(league),
      status: !owner ? 'free' : mine ? ((owner.starters || []).includes(id) ? 'starting' : (owner.reserve || []).includes(id) ? 'ir' : 'bench') : 'taken',
      ownerName: owner && !mine ? teamName(d.users, owner) : '',
      pts: match && match.players_points ? match.players_points[id] : undefined,
    });
  }

  let stats = null;
  if (points) {
    const season = points.season(id);
    stats = {
      leagueName: pointsLeague ? pointsLeague.name : '',
      season,
      recent: points.weeks.map(w => ({ week: w, pts: points.week(w, id) })),
    };
  }
  return { player: p, game: gameFor(games, p), ownership, stats };
}
