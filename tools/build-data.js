// Builds the small data files the phone downloads instead of Sleeper's big ones:
//   data/players.json  the player list, trimmed (~15 MB from Sleeper -> ~160 KB)
//   data/stats.json    each of your leagues' fantasy points: season + last 3 weeks (~3 MB of raw stats -> small)
// Runs on GitHub every hour (.github/workflows/publish.yml) before the site is published.
// Run by hand: node tools/build-data.js
// Uses the same code as the page (js/config.js, js/sleeper.js, js/stats.js), so the numbers match exactly.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
// Load the page's settings and code into this script.
const ctx = { console, module: undefined };
vm.createContext(ctx);
for (const f of ['js/config.js', 'js/sleeper.js', 'js/stats.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8') + '\n;this.CONFIG = typeof CONFIG !== "undefined" ? CONFIG : this.CONFIG;', ctx, { filename: f });
}
const { CONFIG, trimPlayers, fantasyPoints, recentWeeks, statsUrl } = ctx;

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + ' for ' + url);
  return res.json();
}

async function main() {
  const SLEEPER = 'https://api.sleeper.app/v1';
  const [state, user] = await Promise.all([getJSON(SLEEPER + '/state/nfl'), getJSON(SLEEPER + '/user/' + CONFIG.username)]);
  const season = state.league_season || state.season;
  const week = state.season_type === 'regular' || state.season_type === 'post' ? (state.week || 0) : 0;
  const leagues = await getJSON(SLEEPER + '/user/' + user.user_id + '/leagues/nfl/' + season);

  // 1. Player list
  const trimmed = trimPlayers(await getJSON(SLEEPER + '/players/nfl'));
  const builtAt = Date.now();
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/players.json'), JSON.stringify({ savedAt: builtAt, data: trimmed }));

  // 2. Points per league (season total, games, and each recent week)
  const weeks = recentWeeks(week, CONFIG.trade.recentWeeks);
  const toMap = rows => Object.fromEntries((rows || []).filter(r => r && r.player_id && r.stats).map(r => [r.player_id, r.stats]));
  const seasonStats = toMap(await getJSON(statsUrl(season, 0)));
  const weekStats = [];
  for (const w of weeks) weekStats.push(toMap(await getJSON(statsUrl(season, w))));

  const out = { season, week, weeks, builtAt, leagues: {} };
  for (const lg of leagues) {
    const scoring = lg.scoring_settings || {};
    const table = {};
    for (const id in seasonStats) {
      const pos = trimmed[id] ? trimmed[id][1] : '';
      if (!pos) continue;
      const s = seasonStats[id];
      if (!s.gp) continue;
      const row = [fantasyPoints(s, scoring, pos), s.gp];
      for (const ws of weekStats) row.push(ws[id] && ws[id].gp ? fantasyPoints(ws[id], scoring, pos) : null);
      table[id] = row;
    }
    out.leagues[lg.league_id] = table;
  }
  fs.writeFileSync(path.join(root, 'data/stats.json'), JSON.stringify(out));
  const kb = f => Math.round(fs.statSync(path.join(root, f)).size / 1024) + ' KB';
  console.log('Built week ' + week + ' (' + season + '): players.json ' + kb('data/players.json') + ', stats.json ' + kb('data/stats.json') + ' for ' + leagues.length + ' leagues.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
