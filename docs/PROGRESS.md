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

**Next:** owner tests; more ideas from the owner.
