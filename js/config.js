// Every setting you might want to change lives here.
const CONFIG = {
  username: 'kshime4',          // your Sleeper username
  playerCacheHours: 24,         // re-download the big player list at most this often
  scheduleCacheHours: 24,       // same for the NFL schedule (used for bye weeks)

  waivers: {
    trendingHours: 24,     // "trending" = most added across all Sleeper leagues in this many hours
    trendingLimit: 200,    // how many trending players to ask Sleeper for
    showCount: 30,         // how many free agents to list
    minGamesForPoints: 2,  // when sorting by points per game, ignore players with fewer games
    fillInsPerHole: 3,     // for a starter who's out/on bye, star this many free agents who could fill in
    weakIfRankBelow: 0.5,  // a position is "weak" if you rank in the bottom half of your league there
  },

  // Your notes about each league (matched by league name). Sleeper's own settings
  // don't always say this clearly, so we write it down.
  leagueNotes: {
    'MFFL': { format: 'keeper', note: 'One keeper, costs a 6th-round pick every year' },
    'MFFL Dynasty': { format: 'dynasty' },
  },

  // Which positions can play in each lineup slot.
  slotEligibility: {
    QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'],
    FLEX: ['RB', 'WR', 'TE'],
    WRRB_FLEX: ['RB', 'WR'],
    REC_FLEX: ['WR', 'TE'],
    SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  },
  slotLabels: { SUPER_FLEX: 'SF', WRRB_FLEX: 'W/R', REC_FLEX: 'W/T', FLEX: 'FLEX' },

  // Injury words from Sleeper -> short tag and how serious it is.
  //   'warn' = yellow (might not play), 'bad' = red (won't play)
  injuries: {
    Questionable: { tag: 'Q', level: 'warn' },
    Doubtful: { tag: 'D', level: 'bad' },
    Out: { tag: 'OUT', level: 'bad' },
    IR: { tag: 'IR', level: 'bad' },
    PUP: { tag: 'PUP', level: 'bad' },
    Sus: { tag: 'SUS', level: 'bad' },
    NA: { tag: 'NA', level: 'bad' },
    COV: { tag: 'COV', level: 'bad' },
    DNR: { tag: 'DNR', level: 'bad' },
  },
};
