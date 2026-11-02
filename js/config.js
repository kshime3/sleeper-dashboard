// Every setting you might want to change lives here.
const CONFIG = {
  username: 'kshime4',          // your Sleeper username
  playerCacheHours: 24,         // re-download Sleeper's big player list at most this often (fallback only)
  playerSiteCacheHours: 2,      // re-check the small player list on our site (rebuilt hourly) this often
  scheduleCacheHours: 24,       // same for the NFL schedule (used for bye weeks)
  refreshAfterAwayMinutes: 5,   // reopening the app after this long in the background refreshes it
  liveRefreshSeconds: 60,       // during live games, My Team and Game Day update scores this often

  waivers: {
    trendingHours: 24,     // "trending" = most added across all Sleeper leagues in this many hours
    trendingLimit: 200,    // how many trending players to ask Sleeper for
    showCount: 30,         // how many free agents to list
    minGamesForPoints: 2,  // when sorting by points per game, ignore players with fewer games
    fillInsPerHole: 3,     // for a starter who's out/on bye, star this many free agents who could fill in
    weakIfRankBelow: 0.5,  // a position is "weak" if you rank in the bottom half of your league there
  },

  // Trade Analyzer: starting settings for the scoring method (you can change them on the tab).
  trade: {
    recentWeeks: 3,          // "recent" = the last this-many weeks
    recentWeight: 50,        // % of the blend that comes from recent weeks (rest = whole season)
    ageEffect: { dynasty: 100, keeper: 50, redraft: 0 },  // % strength of the age adjustment
    injuryEffect: 100,       // % strength of the injury cut
    peakAge: { QB: 30, RB: 25, WR: 27, TE: 27, K: 33 },   // no age adjustment for DEF
    // per year past peak: lose this much (at 100% age effect)
    agePenaltyPerYear: { QB: 0.04, RB: 0.10, WR: 0.06, TE: 0.06, K: 0.02 },
    youthBonusPerYear: 0.03, // per year younger than peak...
    youthBonusMax: 0.15,     // ...up to this much
    injuryCut: { Questionable: 0.05, Doubtful: 0.15, Out: 0.20, IR: 0.40, PUP: 0.40, Sus: 0.40, NA: 0.40, COV: 0.20, DNR: 0.40 },
    minGamesForReplacement: 3, // free agents need this many games to count as "replacement"
    ideas: {
      similarRange: 0.15,    // "similar value" = within 15%
      fairRange: 0.12,       // trade ideas: the two sides within 12% of each other
      poolSize: 12,          // look at each team's 12 most valuable players/picks
      perTeam: 2,            // at most 2 ideas per team (variety)
      showIdeas: 6,
      showSimilar: 8,
      minGamesForTrend: 4,   // hot/cold needs at least 4 games this season...
      trendPoints: 3,        // ...and recent average at least 3 pts/g above or below the season...
      trendShare: 0.3,       // ...and at least 30% above or below it
      fpMove: 10,            // dynasty: show ↑/↓ when FantasyPros value moved at least 10 this month
      minPieceShare: 0.25,   // in a 2-piece idea, each piece must be worth at least 25% of what you give
      twoPiecePenalty: 0.75, // prefer 1-for-1 ideas over 2-for-1 when they're about as good
    },
  },

  // Your notes about each league (matched by league name). Sleeper's own settings
  // don't always say this clearly, so we write it down.
  leagueNotes: {
    'MFFL': { format: 'keeper', short: 'MFFL', note: 'One keeper, costs a 6th-round pick every year' },
    'MFFL Dynasty': { format: 'dynasty', short: 'Dynasty' },
    'LocusLeague': { short: 'Locus' },
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
