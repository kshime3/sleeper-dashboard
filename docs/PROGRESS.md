# Progress

## 2026-11-02
- Plan agreed: one page, four tabs (My Team, Waivers, Trade, Standings & Recap), built one at a time. Hosting on GitHub Pages like Chained Dice.
- Built **My Team**: league picker (finds all 2026 leagues for kshime4, remembers your last pick), week matchup with scores and records, lineup check (empty spots, injuries, byes, players without a team) with bench swap ideas, starters/bench/IR/taxi lists. Guillotine league shows rank vs. the lowest team, or that you're eliminated. Questionable tags are hidden once a player has already scored that week.
- Player list trimmed from ~15 MB to ~160 KB and saved on the phone for 24 hours.
- Tested in a phone-sized browser against all 4 real leagues: no errors.
- Bye weeks confirmed working (week 8 byes: HOU, NO, NYG, SF). Code pushed to github.com/kshime3/sleeper-dashboard.

- Owner turned on GitHub Pages: live at https://kshime3.github.io/sleeper-dashboard/ and working on their phone.
- Built **Waiver Wire**: weak spots (your rank at each position by starters' points per game; bottom half = red), this week's holes, FAAB left; free agents filtered by position or "My needs", sorted by trending adds or points per game; ⭐ on free agents who beat your weakest starter at a weak position, or who are among the best 3 fill-ins for a starter who's out/on bye. Points use each league's own scoring. Tested in all 4 leagues, no errors.

- Owner: keep bye/injured free agents in the waiver list with tags.
- Built **Trade Analyzer**: pick a trade partner, tap players on each side; side-by-side cards (season points, last 3 weeks, position, age, injury) with a verdict and value bar. Method: value = (blend of season and last-3-week pts/g − best free agent at that position with 3+ games) × age adjustment × injury cut. Sliders per league (recent weight, age effect: dynasty 100%/keeper 50%/redraft 0%, injury cut), saved on the phone; "why?" shows the math for each player. Tested in all 4 leagues, no errors.
- Known limits: rookies/players hurt all season show value 0 (no stats yet); no dynasty draft picks.

- Added position filter chips to the trade player lists (owner asked). Owner confirmed redraft values look right.
- Owner wants dynasty values from the FantasyPros monthly "Dynasty Trade Value Chart" article (use the current month's if published, else last month's). Waiting on www.fantasypros.com being allowed in the cloud environment to see the page format.

- Built **FantasyPros dynasty values**: daily GitHub Action finds this month's article (falls back to last month's; November 2026 not up yet, so October), saves 299 player values (all matched) plus 2027/2028 rookie pick values. MFFL Dynasty trades now use them (superflex for QBs, "All other" value marked est. for unlisted players), with credit and link; switch in "How values work" turns it off. Other leagues unchanged.
- Fixed: two-way players (Travis Hunter, listed DB) were missing from the player list (saved list renamed sd_players_v2; old copy removed).

- Owner ran the Action by hand: green check.
- Added **draft picks** to dynasty trades (FantasyPros pick values, superflex column): each team's picks for the next 3 seasons, with Sleeper's traded picks applied. Next year's picks use a slot projected from current standings (worst record = 1.01); later years use the round average; 2029 reuses 2028 values (est.). "Picks" filter chip.

- Built **Standings & Weekly Recap** (last of the 4 features): standings with W-L, PF, PA, streak, your team highlighted, dashed playoff cutoff line (guillotine: survivors ranked by points, chopped teams greyed). Recap for any week (defaults to last week; current week marked in progress): top/lowest score, biggest blowout, closest game, player of the week, best bench performance, most points left on the bench (guillotine: chopped team and closest call). Copy button (and Android Share button) produce plain text for the league chat. Tested in all 4 leagues, no errors.

- Owner tested Standings & Recap. Polish list chosen (in this order): 1) faster loading + remember last tab + Guillotine last, 2) opens instantly/offline, 3) game status on lineup + live scores, 4) **Game Day tab** (all my players from every league on one screen, live), 5) player details on tap.
- Done polish 1: hourly GitHub build makes small data files (player list + each league's points), so opening the app downloads ~0.4 MB instead of ~3.2 MB; results identical either way (checked all tabs/leagues). App reopens on your last tab; Guillotine league listed last.
- Owner needs to switch GitHub Pages "Source" to "GitHub Actions" for the hourly build to publish.

- Owner switched Pages to GitHub Actions; Publish site run succeeded.
- Done polish 2 (opens instantly / offline): saved copies of all downloads; app draws saved data in ~0.15 s then updates live; works offline with a "📴 Offline" note; page files saved by a service worker (sw.js); refreshes by itself after 5+ min in the background; trade picks and recap week survive refreshes. Fixed a bug where the first-ever open also downloaded Sleeper's 15 MB player list.

- Owner tested polish 2 on the phone: works.
- Owner chose ESPN for game info (allowed site.api.espn.com).
- Done polish 3: each player shows his game (vs/@ opponent, kickoff day/time; live quarter, clock, score, 🏈 possession, 🔴 red zone; final W/L score). Lineup check: problems whose game already started/ended are greyed with 🔒 ("too late to swap" / "his game is over"); bench suggestions only include players whose game hasn't started. Live scores refresh every minute on My Team while games are on (tested with a faked live game; also falls back to Sleeper's schedule if ESPN is down).

- Done polish 4: **Game Day tab** (📺, 2nd tab; league picker hidden there). Score card per league (your score, opponent's, how many players each side still has to play; guillotine shows rank if alive). Every player you own listed once, grouped 🟢 Playing now / 🕐 Still to play / ✅ Done / 😴 Not playing (bench mode), with live game line and a tag per league (start/bench, points if he's in 2+ leagues). Starters / Starters + bench switch. Live updates every minute for all leagues. Tested with a faked live game.

- Done polish 5: **player details on tap** (My Team, Game Day, Waivers; Trade keeps tap-to-pick). Panel slides up: position, depth chart spot, team, number, age, years; injury status + body part + notes; this week's game (live); points in that league's scoring (season, per game, last 3 weeks); and in each of your leagues whether he's your starter/bench/IR, on another team (whose), or a free agent. Closes with ✕, tapping outside, or the phone's Back button. Player list now keeps injury details, depth chart and jersey number (saved list renamed sd_players_v3).
- All 5 chosen polish items are done.

- Owner's next two plans: 1) trade suggestions, 2) add the owner's two ESPN leagues (waiting on: public or private, league IDs, which tabs).
- Done plan 1: **Trade ideas** on the Trade tab. Pick your player(s) to give → 💡 card: up to 6 fair ideas (1- or 2-piece packages within 12%, no filler pieces) from any team, ranked by mutual need (fills your bottom-half position, ideally where they're top-third deep; gives them a position they're weak at; buy-low/sell-high bonus), each with reasons and "Try it" (loads it into the trade check, switching partner). Plus "Players with similar value" (±15%, ⭐ if it fills a weak spot). Hot/cold tags (last 3 weeks ≥30% and ≥3 pts/g above/below season) and, in dynasty, FantasyPros ↑/↓ (±10 this month). Settings in CONFIG.trade.ideas.

- Added **trade idea filters** (owner asked): Pieces (any / 1 only / 2 only), Position (ideas that include that position), Picks (dynasty only: any / no picks / picks only). Applied before choosing the top ideas; remembered (sd_idea_filter); picks/position filters ignored in leagues where they don't apply. Traded picks in ideas show whose they were.
- ESPN: owner's two ESPN leagues are **private** (needs espn_s2/SWID cookies → relay or hourly GitHub fetch; owner to follow up with league IDs later).

- Wrote docs/IDEAS.md: ESPN leagues plan (private leagues: relay vs hourly robot) and the "share with friends" idea (enter a Sleeper username).

- Owner: keep "share with friends" parked, but flag future decisions that affect it (added as a working rule in CLAUDE.md).

- Trade tab now starts on **"Any team (search the whole league)"** (owner's idea): pick your players → ideas from every team; their roster list is hidden until you Try an idea or choose a team; choosing "Any team" again clears the other side. Checked: no effect on the share-with-friends plan.

- Game Day score cards are now tappable (owner asked): tap → My Team for that league (› shown on each card).

- Owner tested tappable score cards: works. Explained the MFFL (keeper) trade value formula; owner chose to fix the "one big recent game" problem.
- Fixed: recent form now counts in proportion to games played in the last 3 weeks (byes don't count as missed). E.g. Tyler Warren (1 of 3 games) recent weight 50% → 17%, value 7.3 → 4.2. "why?" explains it. Still open (offered, not chosen yet): rest-of-season value (byes/playoff weeks), keeper value for MFFL (suggested for the offseason).

- Explored league history (owner asked): Sleeper links every past season; MFFL Dynasty has 8 seasons (2019–2026), 93 trades, ~1,800 transactions, all drafts.
- Built **League history** at the bottom of Standings (owner chose: trades + transactions first). "Load history" button; Trades / Transactions views; filters for season, team (by manager, across seasons), player search, transaction type, failed waiver bids; "Show more". First load ~4 s (152 small requests, 4 seasons at a time); after that finished seasons come from the phone (~0.3 s). Old/retired player names come from new data/names.json (built hourly, all players, friend-friendly). Fixed: tapping Load during the open-time refresh lost the result.

- Cleaned up trade display in League history (owner found it hard to read): one block per team ("[Team] receives"), items one per line, picks as "2024 1st-round pick" with "originally X's" underneath, ⇅ between sides, your side highlighted "(you)". Moves dated before September now say "offseason" (Sleeper files them under week 1).

- Added **player journey** to the player panel (owner asked): "His journey in [league]" — 🎓 drafted (draft + pick), 🔁 traded (from/to), 📥 waiver claim ($bid), 🆓 free-agent pickup, 🗑️ dropped, 🛠️ commissioner, then 📍 where he is now. Uses League history (now also downloads each season's drafts, saved for good); if history isn't loaded yet the panel shows a Load history button. Standings card and panel share the same loaded history.

- Traded draft picks in League history now show **what they became** (owner asked): "→ became WR Xavier Worthy (pick 1.06)", plus "drafted by X" if the pick changed hands again, or "→ not drafted yet". Matched via each draft's slot_to_roster_id (from /draft/<id>, saved for good) and its picks. MFFL Dynasty: all 200 traded picks accounted for (180 used, 20 future). Searching a player also finds trades of the pick that became him.

- More spacing in League history (owner asked): roomier rows, dashed dividers between items in a team's block, a line under each team header, thicker line between trades.

- Owner tested spacing: works. Built **League records** (🏅 Records, 3rd view in the League history card; "Load records"): 🏆 champions by year (winner of the bracket's 1st-place game, + runner-up), all-time list per manager (titles, W-L & win %, finals, playoff trips, points; your row highlighted), top 5 highest/lowest scores, biggest blowouts, closest games, best single-player games, most points in a season, best regular-season records. Uses each season's winners_bracket + every week's matchups (~130 requests first time, saved for good; ~11 s first load, ~3 s after). Checked: all-time W = L (510), 7 champions for 7 finished seasons.

- Owner tested records: works. Built **trades in hindsight** (Trades view of League history; "📈 Show how trades turned out" button, shares Records' weekly scores): for each team, points what it received scored in ITS starting lineup from the trade week on (stops when a player leaves, resumes if he returns; used picks count the player they became). Verdict per trade: winner + margin / even so far (<15 pts or <10%) / too early (<3 weeks) / no starting points yet; team totals and per-item points; "Most lopsided first" sort. Checked by hand: Kirk Cousins for Bear Goggles since Nov 2024 = 82.4 pts in 9 starts (matches). MFFL Dynasty: 93 trades → 67 clear winners, 7 even, 19 no points yet.

**Next:** owner tests; remaining history idea in docs/IDEAS.md (browse drafts); ESPN leagues when the owner follows up.
