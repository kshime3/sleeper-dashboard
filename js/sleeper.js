// Logic: talking to the free Sleeper API, plus saving big downloads on the phone.
const SLEEPER = 'https://api.sleeper.app/v1';
const SLEEPER_EXTRA = 'https://api.sleeper.com'; // unofficial extras (NFL schedule)

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Sleeper answered ' + res.status + ' for ' + url);
  return res.json();
}

// Small wrapper around the phone's storage. Never crashes if storage is blocked or full.
const Store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } },
};

function isFresh(saved, hours) {
  return saved && saved.savedAt && (Date.now() - saved.savedAt) < hours * 3600e3;
}

// ---------- Player list (big: ~15 MB from Sleeper, ~170 KB after trimming) ----------
const PLAYER_KEY = 'sd_players_v1';
const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// Keep only fantasy-relevant players and only the fields we use, so it fits in phone storage.
function trimPlayers(raw) {
  const out = {};
  for (const id in raw) {
    const p = raw[id];
    if (!FANTASY_POSITIONS.includes(p.position)) continue;
    if (!p.active && !p.team) continue;
    const name = p.position === 'DEF'
      ? (p.first_name + ' ' + p.last_name)
      : (p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim());
    const fp = (p.fantasy_positions && p.fantasy_positions.length > 1) ? p.fantasy_positions : 0;
    out[id] = [name, p.position, p.team || '', p.injury_status || '', p.age || 0, p.years_exp || 0, p.search_rank || 9999999, fp];
  }
  return out;
}

function expandPlayers(trimmed) {
  const players = {};
  for (const id in trimmed) {
    const [name, pos, team, injury, age, exp, rank, fp] = trimmed[id];
    players[id] = { id, name, pos, team, injury, age, exp, rank, positions: fp || [pos] };
  }
  return players;
}

async function loadPlayers(force) {
  const saved = Store.get(PLAYER_KEY);
  if (!force && isFresh(saved, CONFIG.playerCacheHours)) {
    return { players: expandPlayers(saved.data), savedAt: saved.savedAt };
  }
  try {
    const trimmed = trimPlayers(await getJSON(SLEEPER + '/players/nfl'));
    const savedAt = Date.now();
    Store.set(PLAYER_KEY, { savedAt, data: trimmed });
    return { players: expandPlayers(trimmed), savedAt };
  } catch (err) {
    if (saved) return { players: expandPlayers(saved.data), savedAt: saved.savedAt, stale: true };
    throw err;
  }
}

// ---------- NFL schedule (for bye weeks). Optional: the app works without it. ----------
// Returns { week -> Set of teams that play that week }, or null if unavailable.
async function loadSchedule(season) {
  const key = 'sd_schedule_' + season;
  let saved = Store.get(key);
  if (!isFresh(saved, CONFIG.scheduleCacheHours)) {
    try {
      const games = await getJSON(SLEEPER_EXTRA + '/schedule/nfl/regular/' + season);
      const byWeek = {};
      for (const g of games) {
        if (!g || !g.week) continue;
        (byWeek[g.week] = byWeek[g.week] || []).push(g.home, g.away);
      }
      saved = { savedAt: Date.now(), byWeek };
      Store.set(key, saved);
    } catch (err) {
      if (!saved) return null;
    }
  }
  const result = {};
  for (const w in saved.byWeek) result[w] = new Set(saved.byWeek[w]);
  return result;
}

// Teams on bye in a week = all NFL teams minus the ones with a game.
function byeTeams(schedule, week, players) {
  if (!schedule || !schedule[week] || schedule[week].size === 0) return null;
  const all = new Set();
  for (const id in players) if (players[id].pos === 'DEF') all.add(players[id].team || id);
  const byes = new Set();
  for (const t of all) if (!schedule[week].has(t)) byes.add(t);
  return byes;
}

// ---------- You, your leagues, and one league's details ----------
async function loadMe(username) {
  const [user, state] = await Promise.all([
    getJSON(SLEEPER + '/user/' + encodeURIComponent(username)),
    getJSON(SLEEPER + '/state/nfl'),
  ]);
  if (!user || !user.user_id) throw new Error('Could not find the Sleeper user "' + username + '".');
  let season = state.league_season || state.season;
  let leagues = await getJSON(SLEEPER + '/user/' + user.user_id + '/leagues/nfl/' + season);
  if (!leagues.length && state.previous_season) {
    season = state.previous_season;
    leagues = await getJSON(SLEEPER + '/user/' + user.user_id + '/leagues/nfl/' + season);
  }
  return { user, state, season, leagues };
}

async function loadLeague(league, week) {
  const id = league.league_id;
  const [rosters, users, matchups] = await Promise.all([
    getJSON(SLEEPER + '/league/' + id + '/rosters'),
    getJSON(SLEEPER + '/league/' + id + '/users'),
    week > 0 ? getJSON(SLEEPER + '/league/' + id + '/matchups/' + week) : Promise.resolve([]),
  ]);
  return { rosters, users, matchups: matchups || [] };
}
