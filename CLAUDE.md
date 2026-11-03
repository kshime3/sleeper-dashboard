# Sleeper Dashboard

A mobile-friendly fantasy football dashboard for the owner's Sleeper leagues (username `kshime4`). One web page, no server: it pulls live data from the free public Sleeper API every time it opens. Hosted free on GitHub Pages.

The owner is not very technical. Same working style as their Chained Dice project.

## Working rules

- Plain HTML, CSS and JavaScript. No frameworks or build tools unless the owner approves.
- Runs by opening `index.html`; hosted on GitHub Pages.
- One feature at a time. After each, give exact phone test steps, then wait for feedback.
- Commit after each working milestone with a clear message.
- Logic (working things out from Sleeper data) lives in separate JS files from display code.
- Every setting you might tune lives in `js/config.js`.
- Explain things in plain language. Ask before big decisions.
- **Cache-busting:** index.html loads every CSS/JS file with `?v=YYYYMMDDx`. When changing css/ or js/, bump that tag everywhere in index.html (one sed).
- **Keep "share with friends" possible** (parked plan in `docs/IDEAS.md`: friends enter their own Sleeper username). Before any change, check whether it would make that harder, e.g. new hard-coded owner details (username, league names/IDs), phone storage not keyed per user, or data built only for the owner's leagues. Prefer the friend-friendly way when it costs little; if it doesn't, tell the owner the trade-off before building, and note it in `docs/IDEAS.md`. (Already owner-only today: `CONFIG.username`, `CONFIG.leagueNotes`, `tools/build-data.js` points for the owner's leagues; ESPN leagues will stay owner-only.)
- GitHub Pages shares one web address (kshime3.github.io) with Chained Dice, so phone storage is shared too: keep saved data small (the trimmed player list is ~200 KB) and prefix keys with `sd_`.

## Data sources

- `https://api.sleeper.app/v1/...` — official, free, no key: user, state, leagues, rosters, users, matchups, players, trending.
- `https://api.sleeper.com/schedule/nfl/regular/<season>` — unofficial; used only for bye weeks. The app works without it.
- `https://api.sleeper.com/stats/nfl/<season>[/<week>]?season_type=regular&position[]=...` — unofficial raw stats (~2 MB season, ~0.7 MB a week). Kept in memory only. Fantasy points = each stat × the league's `scoring_settings` value (verified exact vs. league matchup scores, week 7 2026, all 4 leagues).

- **FantasyPros Dynasty Trade Value Chart** (monthly article, e.g. `fantasypros.com/2026/10/fantasy-football-rankings-dynasty-trade-value-chart-october-2026-update/`). Player values are in 4 Datawrapper charts (`datawrapper.dwcdn.net/<id>/<ver>/dataset.csv`, tab-separated; old versions forward to new ones); rookie pick values are tables in the article. `tools/update-dynasty.js` (run daily by `.github/workflows/dynasty-values.yml`) tries this month's article, then last month's, matches names to Sleeper IDs and writes `data/dynasty-values.json` only if it changed. Used for dynasty leagues in the Trade tab (superflex values for QBs in SF leagues; TE-premium values if `bonus_rec_te`). Owner OK'd storing it in the public repo **as long as FantasyPros is credited** (credit + link shown wherever values appear). Running it locally here needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

- **Pre-built data (faster loading):** GitHub Pages is published by `.github/workflows/publish.yml` (Pages source = GitHub Actions), which first runs `tools/build-data.js`: trimmed player list (`data/players.json`, ~160 KB) and each league's points (`data/stats.json`: per player [season total, games, last 3 weeks]). Both reuse the page's own code (config/sleeper/stats.js via `vm`). The page uses them when present and matching the current week, else falls back to Sleeper's big downloads. These files are gitignored; build locally with the proxy env vars above to test.

- **Saved copies / offline:** every download goes through `cachedJSON` (js/sleeper.js), which also stores it in Cache Storage (`sd-data-v1`, not localStorage). On open, `reloadAll` draws once from saved copies (`NET.mode = 'cache'`, instant), then loads live and redraws; with no signal the saved copy is used and the status says Offline. Anything started in the cache pass must finish before the live pass (allSettled), or it will run in network mode.

- **League history:** `/league/<id>` (previous_league_id chain), `/league/<id>/users|rosters|drafts|transactions/<round 0-18>` `/draft/<id>/picks` and `/draft/<id>` (its `slot_to_roster_id` — not in the league's drafts list — says which slot was whose, so a traded pick {season, round, original roster_id} → slot → the player picked) per season. MFFL Dynasty: 8 seasons (2019–2026), 93 trades, 1,834 transactions. History state lives in `app.history[leagueId]` (not leagueData) so refreshes don't lose it. Playwright may report each request twice once the service worker is active; count real fetches in the page instead.
- **ESPN scoreboard** `site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=<w>&dates=<season>` — unofficial, free, CORS allowed. Team code fix: ESPN WSH = Sleeper WAS. ESPN returns 403 to headless browsers: Playwright tests must set a phone userAgent AND `extraHTTPHeaders: {'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"'}`. Failures are quiet (don't mark the app Offline).
- **Live scores:** while any game is live and My Team or Game Day is open, `refreshLive` (main.js) re-downloads matchups/rosters (this league, or every league on Game Day) + the scoreboard every `CONFIG.liveRefreshSeconds`; paused in the background.

## Leagues (2026)

MFFL (keeper: one keeper, costs a 6th-round pick each year), 🪓 Guillotine MFFL (guillotine: lowest score each week is eliminated; owner already eliminated), LocusLeague (redraft), MFFL Dynasty (dynasty). Notes in `CONFIG.leagueNotes`.

## Session routine

- **Start:** read this file and `docs/PROGRESS.md`, summarize, propose the next step.
- **End:** update `docs/PROGRESS.md`, `docs/IDEAS.md` (and this file's layout section if files changed).

## File layout

```
index.html            the page
manifest.webmanifest  name and icon for "Add to Home screen"
css/style.css         colors and layout (dark by default, light if the phone is in light mode)
img/icon.svg          the icon; icon-*.png are renders of it
js/config.js          ALL settings (username, cache times, league notes, lineup slots, injury tags)
js/sleeper.js         logic: Sleeper API calls, saved player list (refreshed at most daily), schedule/byes
js/stats.js           logic: season/weekly stats and league-scored fantasy points
js/games.js           logic: this week's NFL games (ESPN scoreboard: kickoff, quarter/clock, score; Sleeper schedule as backup)
js/myteam.js          logic: My Team (lineup, matchup, guillotine status, flags, bench swap ideas)
js/waivers.js         logic: teamStrengths (every team's rank at each position, shared with Trade) and Waiver Wire (free agents, trending adds, weak spots, upgrade stars, FAAB)
js/trade.js           logic: Trade Analyzer (value = blended pts/g − best free agent at the position, × age × injury; settings per league; FantasyPros values + picks in dynasty) and Trade ideas (similar value; fair 1-/2-piece packages ranked by mutual need via teamNeeds; hot/cold tags; reverse "what you could offer" via offerIdeas)
js/standings.js       logic: Standings (guillotine: survivors first) and Weekly Recap (top/low score, blowout, closest, player of the week, best bench, most left on bench) + chat text
js/history.js         logic: League history (follows previous_league_id back through every season; trades + transactions + player journeys + what traded picks became; finished seasons saved on the phone for good) and League records (champions from winners_bracket p=1, all-time per manager, single-game and season records from every week's matchups) and trades in hindsight (starting-lineup points for the receiving team since the trade)
js/gameday.js         logic: Game Day tab (score card per league, every player you own once, grouped Playing now / Still to play / Done / Not playing)
js/player.js          logic: player details panel (who owns him in each league, points, game, injury, his journey in this league from League history)
js/ui.js              display: draws each tab
js/main.js            wires it together: two-pass loading (saved copies, then live), league picker, tabs, refresh on return
sw.js                 service worker: saves the page's own files so it opens offline
docs/PROGRESS.md      dated session log and next step
docs/IDEAS.md         parked ideas (ESPN leagues, sharing with friends)
data/dynasty-values.json   FantasyPros dynasty values (written by the updater, don't edit by hand)
tools/update-dynasty.js    the updater (Node, no installs needed)
.github/workflows/dynasty-values.yml   runs the updater daily on GitHub
tools/build-data.js        builds data/players.json + data/stats.json + data/names.json (retired players' names, for League history; not in git; built on GitHub)
.github/workflows/publish.yml          publishes the site hourly + on every push, after build-data
```
