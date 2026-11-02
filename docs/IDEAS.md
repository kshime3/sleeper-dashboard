# Ideas (parked for later)

Ideas we've talked about but haven't built yet. Newest at the top.

## Share with friends: "enter your Sleeper username" (discussed 2026-11-02)

Let friends use the same link with their own leagues.

**What it would look like**
- First visit: a welcome screen with one box, "Your Sleeper username", and a **Go** button. The app checks the name with Sleeper and loads that person's leagues.
- The name is remembered on that phone, so it opens straight to their team next time. A small "Switch user" link changes it.
- Shareable links: `kshime3.github.io/sleeper-dashboard/?user=theirname` opens directly for that person (handy to text to a friend).
- Everything else works as it does now, because it's all built from public Sleeper data: My Team, Game Day, Waivers, Trade (including trade ideas), Standings & Recap, and player details.

**What would need to change**
1. `CONFIG.username` stops being fixed: read it from the welcome box / `?user=` / the phone's saved choice.
2. League notes (keeper / dynasty / short names) are written for this owner's leagues only. For everyone else: detect the format from Sleeper's settings (it already marks dynasty and keeper leagues) and use the league name, shortened, as the short name.
3. The hourly GitHub build (`tools/build-data.js`) pre-computes points only for this owner's leagues. For other users either:
   - fall back to the slower direct Sleeper downloads (works today, about 3 MB the first time they open Waivers or Trade), or
   - (better) change the build to save trimmed raw stats for everyone (only the stat types leagues score), so the phone scores them with each league's own rules. Probably ~300 KB.
4. Saved data on the phone is per user (so switching users doesn't mix teams).

**Things to know**
- **Cost:** still free. Each friend's phone talks to Sleeper and ESPN's scoreboard directly, so there's no shared server and nothing to pay for. GitHub Pages' limits (about 100 GB of downloads a month) are far above what a group of friends would use.
- **Privacy:** no logins or passwords. It only shows what Sleeper already shows publicly for any username.
- **FantasyPros:** dynasty values would be seen by more people. Keep the credit and link to FantasyPros everywhere they appear (the condition the owner set).
- **ESPN leagues** (below) would stay just for the owner: they need the owner's private ESPN login cookies.

**Size:** about one session of work.

**Status:** parked (owner's choice, 2026-11-02). Future changes should keep this possible; CLAUDE.md has a working rule to check, and to tell the owner when something would make it harder.

## ESPN leagues (discussed 2026-11-02)

The owner has two teams in ESPN leagues and wants them in the dashboard next to the Sleeper leagues.

**Status:** waiting for the owner to send the two league IDs (the number after `leagueId=` in the ESPN website address). Both leagues are **private**.

**The catch with private leagues:** ESPN only lets outside apps read a private league with the owner's login cookies (`espn_s2` and `SWID`). A web page like ours can't send those cookies to ESPN, so we need one of:

- **(a) A small free relay** (e.g. a Cloudflare Worker, free account) that keeps the cookies secret, fetches the league from ESPN and passes it to the app.
  - ✅ Live scores on game day, same as Sleeper leagues.
  - ➖ One more free account and a short setup. The relay's address shouldn't be shared publicly (anyone with it could read those two leagues).
- **(b) The hourly GitHub robot** fetches the ESPN leagues using the cookies stored as GitHub "secrets", and publishes the result with the site.
  - ✅ Simplest; no new accounts.
  - ➖ Updates hourly at best (no live scores).
  - ➖ The site is public, so the ESPN rosters/scores would be readable by anyone who finds the data file.

(If a league were switched to **public** in ESPN's settings — League → Settings → Basic Settings → "Make League Viewable to Public" — the app could read it directly with no cookies, relay or robot.)

**Where ESPN leagues would show up (suggested first step):** My Team, Game Day, and Standings & Recap. Waivers and Trade need more ESPN data (free agents, player values in ESPN's player IDs) and could come later.

**Technical notes for later:**
- ESPN fantasy API: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/<season>/segments/0/leagues/<leagueId>?view=mTeam&view=mRoster&view=mMatchupScore&view=mSettings` (cookies `espn_s2`, `SWID` for private leagues).
- ESPN player IDs differ from Sleeper's: match by name + team + position (as we do for FantasyPros), or show ESPN's own names and stats in ESPN leagues.
- Needs `lm-api-reads.fantasy.espn.com` allowed in the cloud environment for testing.
- The cookies are like a password for the owner's ESPN account: never put them in the code or in a public file.
