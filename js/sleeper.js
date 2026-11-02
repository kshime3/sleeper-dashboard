// Logic: talking to the free Sleeper API, plus saving big downloads on the phone.
const SLEEPER = 'https://api.sleeper.app/v1';
const SLEEPER_EXTRA = 'https://api.sleeper.com'; // unofficial extras (NFL schedule)

// ---------- Saved copies of downloads (open instantly, work offline) ----------
// Every download is also saved on the phone (browser "cache storage", separate from Chained Dice's
// saves). When the app opens it first draws everything from these saved copies (NET.mode = 'cache'),
// then downloads fresh data and redraws (NET.mode = 'network'). With no signal, the saved copy is used.
const NET = { mode: 'network', offline: false, oldest: null };
const DATA_CACHE = 'sd-data-v1';
const MAX_SAVED_CHARS = 4e6; // don't save Sleeper's huge raw player list (it has its own trimmed copy)

function noteSavedAt(res) {
  const t = Number(res.headers.get('x-saved-at')) || null;
  if (t && (!NET.oldest || t < NET.oldest)) NET.oldest = t;
}

async function savedCopy(url) {
  if (typeof caches === 'undefined') return null;
  try { return await (await caches.open(DATA_CACHE)).match(url); } catch (e) { return null; }
}

// extra.quiet: a failed download of this (e.g. ESPN) shouldn't make the whole app say "Offline".
async function cachedJSON(url, opts, extra) {
  if (NET.mode === 'cache') {
    const hit = await savedCopy(url);
    if (!hit) throw new Error('No saved copy yet');
    noteSavedAt(hit);
    return hit.json();
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (networkError) {
    // No signal: use the saved copy if there is one.
    const hit = await savedCopy(url);
    if (!hit) throw new Error('No internet connection, and nothing saved yet.');
    if (!(extra && extra.quiet)) { NET.offline = true; noteSavedAt(hit); }
    return hit.json();
  }
  if (!res.ok) throw new Error('Sleeper answered ' + res.status + ' for ' + url);
  const text = await res.text();
  if (typeof caches !== 'undefined' && text.length < MAX_SAVED_CHARS) {
    caches.open(DATA_CACHE).then(c => c.put(url, new Response(text, {
      headers: { 'content-type': 'application/json', 'x-saved-at': String(Date.now()) },
    }))).catch(() => {});
  }
  return JSON.parse(text);
}

function getJSON(url) { return cachedJSON(url); }

// Small wrapper around the phone's storage. Never crashes if storage is blocked or full.
const Store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } },
};

function isFresh(saved, hours) {
  return saved && saved.savedAt && (Date.now() - saved.savedAt) < hours * 3600e3;
}

// ---------- Player list (big: ~15 MB from Sleeper, ~170 KB after trimming) ----------
const PLAYER_KEY = 'sd_players_v2'; // v2: includes two-way players
const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// Keep only fantasy-relevant players and only the fields we use, so it fits in phone storage.
function trimPlayers(raw) {
  const out = {};
  for (const id in raw) {
    const p = raw[id];
    // Two-way players (e.g. Travis Hunter: listed DB, plays WR) count under their fantasy position.
    const pos = FANTASY_POSITIONS.includes(p.position) ? p.position
      : (p.fantasy_positions || []).find(x => FANTASY_POSITIONS.includes(x));
    if (!pos) continue;
    if (!p.active && !p.team) continue;
    const name = pos === 'DEF'
      ? (p.first_name + ' ' + p.last_name)
      : (p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim());
    const fpos = (p.fantasy_positions || []).filter(x => FANTASY_POSITIONS.includes(x));
    const fp = fpos.length > 1 ? fpos : 0;
    out[id] = [name, pos, p.team || '', p.injury_status || '', p.age || 0, p.years_exp || 0, p.search_rank || 9999999, fp];
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
  const mode = NET.mode;
  try { localStorage.removeItem('sd_players_v1'); } catch (e) { /* old saved copy, no longer used */ }
  const saved = Store.get(PLAYER_KEY);
  // The small copy on our own site is rebuilt every hour, so it's worth checking more often.
  const hours = saved && saved.source === 'site' ? CONFIG.playerSiteCacheHours : CONFIG.playerCacheHours;
  if (!force && isFresh(saved, hours)) {
    return { players: expandPlayers(saved.data), savedAt: saved.builtAt || saved.savedAt };
  }
  try {
    let source = 'site', trimmed, savedAt;
    // Fast: the ~160 KB copy built on GitHub (tools/build-data.js). Slow fallback: Sleeper's full ~15 MB list.
    const site = await cachedJSON('data/players.json', { cache: 'no-cache' }).catch(() => null);
    if (site && site.data && Object.keys(site.data).length > 1000) {
      trimmed = site.data; savedAt = site.savedAt;
    } else {
      // Only fall back to the 15 MB download during a live load, never while drawing saved copies.
      if (mode === 'cache') throw new Error('No saved player list yet');
      source = 'sleeper';
      trimmed = trimPlayers(await getJSON(SLEEPER + '/players/nfl'));
      savedAt = Date.now();
    }
    // savedAt = when this phone last checked (decides when to look again); builtAt = how old the list is.
    Store.set(PLAYER_KEY, { savedAt: Date.now(), builtAt: savedAt, source, data: trimmed });
    return { players: expandPlayers(trimmed), savedAt };
  } catch (err) {
    if (saved) return { players: expandPlayers(saved.data), savedAt: saved.builtAt || saved.savedAt, stale: true };
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

// Players being added the most across ALL Sleeper leagues recently. [{ player_id, count }]
let trendingPromise = null;
function clearTrending() { trendingPromise = null; }
function loadTrending() {
  if (!trendingPromise) {
    trendingPromise = getJSON(SLEEPER + '/players/nfl/trending/add?lookback_hours=' + CONFIG.waivers.trendingHours + '&limit=' + CONFIG.waivers.trendingLimit)
      .catch(err => { trendingPromise = null; throw err; });
  }
  return trendingPromise;
}

// Lets tools/build-data.js (Node, on GitHub) reuse the same trimming code.
if (typeof module !== 'undefined') module.exports = { trimPlayers };
