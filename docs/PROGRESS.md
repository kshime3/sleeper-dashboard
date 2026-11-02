# Progress

## 2026-11-02
- Plan agreed: one page, four tabs (My Team, Waivers, Trade, Standings & Recap), built one at a time. Hosting on GitHub Pages like Chained Dice.
- Built **My Team**: league picker (finds all 2026 leagues for kshime4, remembers your last pick), week matchup with scores and records, lineup check (empty spots, injuries, byes, players without a team) with bench swap ideas, starters/bench/IR/taxi lists. Guillotine league shows rank vs. the lowest team, or that you're eliminated. Questionable tags are hidden once a player has already scored that week.
- Player list trimmed from ~15 MB to ~160 KB and saved on the phone for 24 hours.
- Tested in a phone-sized browser against all 4 real leagues: no errors.
- Bye weeks confirmed working (week 8 byes: HOU, NO, NYG, SF). Code pushed to github.com/kshime3/sleeper-dashboard.

- Owner turned on GitHub Pages: live at https://kshime3.github.io/sleeper-dashboard/ and working on their phone.
- Built **Waiver Wire**: weak spots (your rank at each position by starters' points per game; bottom half = red), this week's holes, FAAB left; free agents filtered by position or "My needs", sorted by trending adds or points per game; ⭐ on free agents who beat your weakest starter at a weak position, or who are among the best 3 fill-ins for a starter who's out/on bye. Points use each league's own scoring. Tested in all 4 leagues, no errors.

**Next:** owner tests Waiver Wire on the phone, then build Trade Analyzer (propose a scoring method first).
