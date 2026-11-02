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
- GitHub Pages shares one web address (kshime3.github.io) with Chained Dice, so phone storage is shared too: keep saved data small (the trimmed player list is ~160 KB) and prefix keys with `sd_`.

## Data sources

- `https://api.sleeper.app/v1/...` — official, free, no key: user, state, leagues, rosters, users, matchups, players, trending.
- `https://api.sleeper.com/schedule/nfl/regular/<season>` — unofficial; used only for bye weeks. The app works without it.

## Leagues (2026)

MFFL (keeper: one keeper, costs a 6th-round pick each year), 🪓 Guillotine MFFL (guillotine: lowest score each week is eliminated; owner already eliminated), LocusLeague (redraft), MFFL Dynasty (dynasty). Notes in `CONFIG.leagueNotes`.

## Session routine

- **Start:** read this file and `docs/PROGRESS.md`, summarize, propose the next step.
- **End:** update `docs/PROGRESS.md` (and this file's layout section if files changed).

## File layout

```
index.html            the page
manifest.webmanifest  name and icon for "Add to Home screen"
css/style.css         colors and layout (dark by default, light if the phone is in light mode)
img/icon.svg          the icon; icon-*.png are renders of it
js/config.js          ALL settings (username, cache times, league notes, lineup slots, injury tags)
js/sleeper.js         logic: Sleeper API calls, saved player list (refreshed at most daily), schedule/byes
js/myteam.js          logic: My Team (lineup, matchup, guillotine status, flags, bench swap ideas)
js/ui.js              display: draws each tab
js/main.js            wires it together: loading, league picker, tabs
docs/PROGRESS.md      dated session log and next step
```
