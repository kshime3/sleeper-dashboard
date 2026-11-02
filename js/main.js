// Wires it all together: loads data, remembers your choices, switches tabs and leagues.
const app = {
  me: null, players: null, playersSavedAt: null, schedule: null,
  leagueData: {},      // league_id -> { rosters, users, matchups }
  leagueId: null,
  tab: ['team', 'gameday', 'waivers', 'trade', 'standings'].includes(Store.get('sd_tab')) ? Store.get('sd_tab') : 'team', // reopen on your last tab
  tradePos: 'ALL',
  ideaFilter: Object.assign({ size: 'any', pos: 'ANY', picks: 'any' }, Store.get('sd_idea_filter') || {}),
  uiKeep: {},          // league_id -> on-screen choices kept across refreshes
  loadedAt: 0,
  fp: null,            // FantasyPros dynasty values (data/dynasty-values.json)
  gdOpts: Object.assign({ includeBench: false }, Store.get('sd_gameday_opts') || {}),
  waiverOpts: Object.assign({ filter: 'ALL', sort: 'trend' }, Store.get('sd_waiver_opts') || {}),
};

const $ = sel => document.querySelector(sel);

function currentWeek() {
  const s = app.me.state;
  return s.season_type === 'regular' || s.season_type === 'post' ? (s.week || s.display_week || 0) : 0;
}

function timeOf(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function setStatus(phase) {
  const parts = [];
  if (phase === 'saved') parts.push('Showing saved data' + (NET.oldest ? ' from ' + timeOf(NET.oldest) : '') + ' · updating…');
  else if (NET.offline) parts.push('📴 Offline — showing data saved' + (NET.oldest ? ' at ' + timeOf(NET.oldest) : ''));
  else parts.push('Updated ' + timeOf(app.loadedAt || Date.now()));
  if (app.playersSavedAt) parts.push('players ' + ago(app.playersSavedAt));
  parts.push('<a href="#" id="refresh-players">refresh player list</a>');
  $('#status').innerHTML = parts.join(' · ');
  $('#refresh-players').onclick = e => { e.preventDefault(); reloadAll(true); };
}

async function showLeague() {
  const league = app.me.leagues.find(l => l.league_id === app.leagueId);
  const view = $('#view');
  if (!league) { view.innerHTML = renderError('No leagues found for ' + CONFIG.username + '.'); return; }

  const week = currentWeek();
  const tab = app.tab;
  document.body.classList.toggle('no-picker', tab === 'gameday'); // Game Day covers every league
  if (tab === 'gameday') return showGameDay(week);
  const stillHere = () => app.leagueId === league.league_id && app.tab === tab; // you may switch while it loads
  try {
    if (!app.leagueData[league.league_id]) {
      if (NET.mode !== 'cache') view.innerHTML = '<p class="muted center">Loading ' + esc(league.name) + '…</p>';
      // Keep your trade picks and chosen recap week when the data refreshes.
      app.leagueData[league.league_id] = Object.assign(await loadLeague(league, week), app.uiKeep[league.league_id] || {});
    }
    if (!stillHere()) return;
    const d = app.leagueData[league.league_id];
    const byes = byeTeams(app.schedule, week, app.players);
    const team = analyzeMyTeam({
      league, rosters: d.rosters, users: d.users, matchups: d.matchups,
      players: app.players, week, userId: app.me.user.user_id, byes, games: app.games,
    });

    if (tab === 'team') {
      if (app.games && app.games.anyLive) team.liveNote = '🟢 Games live — scores update every minute' + (app.liveAt ? ' (last ' + timeOf(app.liveAt) + ')' : '');
      view.innerHTML = renderMyTeam(team, league);
      scheduleLive();
      return;
    }

    if (tab === 'standings') {
      const st = standingsTable({ league, rosters: d.rosters, users: d.users, userId: app.me.user.user_id });
      const weeks = [];
      for (let w = week; w >= 1; w--) weeks.push(w);
      if (!d.recapWeek) d.recapWeek = week > 1 ? week - 1 : week; // last week by default
      const rw = d.recapWeek;
      d.recapMatchups = d.recapMatchups || { [week]: d.matchups };
      if (!d.recapMatchups[rw] && rw > 0) {
        view.innerHTML = renderStandings(st, null, league, weeks, rw, week);
        d.recapMatchups[rw] = await getJSON(SLEEPER + '/league/' + league.league_id + '/matchups/' + rw);
        if (!stillHere()) return;
      }
      const recap = rw > 0 ? weeklyRecap({ league, rosters: d.rosters, users: d.users, matchups: d.recapMatchups[rw] || [], players: app.players, week: rw }) : { empty: true, week: rw };
      d.recapCache = { recap, league };
      view.innerHTML = renderStandings(st, recap, league, weeks, rw, week);
      return;
    }

    if (tab === 'trade') {
      if (!d.points || !d.tradeExtrasLoaded) {
        view.innerHTML = '<p class="muted center">Loading stats…</p>';
        d.points = await loadPoints(league, app.me.season, week, app.players);
        app.fp = await loadDynastyValues();
        d.tradedPicks = leagueFormat(league) === 'dynasty'
          ? await getJSON(SLEEPER + '/league/' + league.league_id + '/traded_picks').catch(() => []) : [];
        d.tradeExtrasLoaded = true;
      }
      if (!stillHere()) return;
      d.byes = byes;
      view.innerHTML = renderTrade(buildTrade(league, d));
      return;
    }

    // Waiver Wire: needs season stats, last week's stats and trending adds (a few MB, once per visit).
    if (!d.waivers) {
      view.innerHTML = '<p class="muted center">Loading stats and trending players…</p>';
      const [points, trending] = await Promise.all([
        loadPoints(league, app.me.season, week, app.players),
        loadTrending().catch(() => []),
      ]);
      d.points = points;
      d.waivers = analyzeWaivers({
        league, rosters: d.rosters, players: app.players, points, trending,
        userId: app.me.user.user_id, byes, team,
      });
    }
    if (!stillHere()) return;
    view.innerHTML = renderWaivers(d.waivers, app.waiverOpts);
  } catch (err) {
    // While drawing from saved copies, a missing copy just means "wait for the live data".
    if (stillHere() && NET.mode !== 'cache') view.innerHTML = renderError(err.message);
  }
}

// Waiver filter and sort buttons (no new downloads, just redraw).
$('#view').addEventListener('click', e => {
  const f = e.target.closest('[data-wfilter]'), srt = e.target.closest('[data-wsort]');
  if (!f && !srt) return;
  if (f) app.waiverOpts.filter = f.dataset.wfilter;
  if (srt) app.waiverOpts.sort = srt.dataset.wsort;
  Store.set('sd_waiver_opts', app.waiverOpts);
  const d = app.leagueData[app.leagueId];
  if (d && d.waivers) $('#view').innerHTML = renderWaivers(d.waivers, app.waiverOpts);
});

// ---------- Trade Analyzer state ----------
function tradeSettingsFor(league) {
  return Object.assign(defaultTradeSettings(league), Store.get('sd_trade_' + league.league_id) || {});
}

// The saved idea filters, minus any that don't apply in this league (no picks, or a position it doesn't use).
function ideaFilterFor(league, hasPicks) {
  const f = Object.assign({}, app.ideaFilter);
  if (!hasPicks) f.picks = 'any';
  if (f.pos !== 'ANY' && !leaguePositions(league).includes(f.pos)) f.pos = 'ANY';
  return f;
}

function buildTrade(league, d) {
  const userId = app.me.user.user_id;
  const mine = d.rosters.find(r => isMine(r, userId));
  const hasTeam = !!(mine && (mine.players || []).length);
  if (!hasTeam) return { hasTeam };
  const others = d.rosters.filter(r => r !== mine && (r.players || []).length)
    .map(r => ({ roster_id: r.roster_id, name: teamName(d.users, r), roster: r }));
  if (!d.trade || !others.some(o => o.roster_id === d.trade.opp)) d.trade = { opp: others[0].roster_id, give: [], get: [] };
  const opp = others.find(o => o.roster_id === d.trade.opp);
  const settings = tradeSettingsFor(league);
  const values = tradeValues({
    league, rosters: d.rosters, players: app.players,
    points: d.points, byes: d.byes, fp: app.fp,
  }, settings);
  // Dynasty + FantasyPros: add each team's draft picks to its list.
  const fpOn = usesFP(league, settings, app.fp);
  const picks = fpOn ? draftPickValues({ league, rosters: d.rosters, users: d.users, tradedPicks: d.tradedPicks, fp: app.fp }) : {};
  Object.assign(values, picks);
  const picksOf = rosterId => Object.keys(picks).filter(id => picks[id].owner === rosterId)
    .sort((a, b) => picks[b].value - picks[a].value);
  const cmp = compareTrade(values, d.trade.give, d.trade.get);
  cmp.fp = usesFP(league, settings, app.fp) ? app.fp : null;
  // Trade ideas for the players you picked to give (all teams, not just the one selected above).
  const ideas = d.trade.give.length ? tradeIdeas({
    values, mine, giveIds: d.trade.give, filter: ideaFilterFor(league, Object.keys(picks).length > 0),
    needs: teamNeeds(league, d.rosters, app.players, d.points),
    others: others.map(o => ({ roster_id: o.roster_id, name: o.name, ids: o.roster.players.concat(picksOf(o.roster_id)) })),
  }) : null;
  app.tradeIdeasNow = ideas;
  return {
    hasTeam, settings, values, state: d.trade, pos: app.tradePos, positions: leaguePositions(league), opponents: others, oppName: opp.name,
    myIds: mine.players.concat(picksOf(mine.roster_id)), oppIds: opp.roster.players.concat(picksOf(opp.roster_id)),
    hasPicks: Object.keys(picks).length > 0,
    cmp, ideas, ideaFilter: ideaFilterFor(league, Object.keys(picks).length > 0), fpAvailable: !!app.fp && leagueFormat(league) === 'dynasty',
  };
}

function currentLeague() { return app.me.leagues.find(l => l.league_id === app.leagueId); }

// Taps on players and "clear"/"reset" buttons
$('#view').addEventListener('click', e => {
  const d = app.leagueData[app.leagueId];
  if (app.tab !== 'trade' || !d || !d.trade) return;
  const pick = e.target.closest('[data-tpick]'), reset = e.target.closest('[data-treset]'), posChip = e.target.closest('[data-tpos]');
  if (posChip) {
    app.tradePos = posChip.dataset.tpos;
    $('#trade-dyn').innerHTML = renderTradeDynamic(buildTrade(currentLeague(), d));
    return;
  }
  const tryIt = e.target.closest('[data-ttry]');
  if (tryIt && app.tradeIdeasNow) {
    // "Try it": load this idea into the trade check (switches the trade partner if needed).
    const [kind, i] = tryIt.dataset.ttry.split(':');
    const idea = kind === 'idea' ? app.tradeIdeasNow.ideas[+i] : app.tradeIdeasNow.similar[+i];
    if (!idea) return;
    d.trade = { opp: idea.team.roster_id, give: d.trade.give.slice(), get: (idea.pkg || [idea.b]).map(b => b.player.id) };
    showLeague().then(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    return;
  }
  if (pick) {
    const list = pick.dataset.tpick === 'give' ? d.trade.give : d.trade.get;
    const i = list.indexOf(pick.dataset.id);
    if (i >= 0) list.splice(i, 1); else list.push(pick.dataset.id);
    $('#trade-dyn').innerHTML = renderTradeDynamic(buildTrade(currentLeague(), d));
    return;
  }
  if (reset) {
    if (reset.dataset.treset === 'picks') { d.trade.give = []; d.trade.get = []; }
    else Store.set('sd_trade_' + app.leagueId, null);
    showLeague();
  }
});

// Recap: pick a week, copy or share the text.
$('#view').addEventListener('change', e => {
  if (e.target.id !== 'recap-week') return;
  app.leagueData[app.leagueId].recapWeek = Number(e.target.value);
  showLeague();
});

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  // Fallback for older browsers
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
}

$('#view').addEventListener('click', e => {
  const b = e.target.closest('[data-recap]');
  if (!b) return;
  const d = app.leagueData[app.leagueId];
  const text = recapText(d.recapCache.league, d.recapCache.recap);
  const msg = $('#recap-msg');
  if (b.dataset.recap === 'share') {
    navigator.share({ text }).catch(() => {});
  } else {
    copyText(text)
      .then(() => { msg.textContent = '✓ Copied! Open your league chat in Sleeper and paste.'; })
      .catch(() => { msg.textContent = 'Couldn\'t copy automatically — open "Preview chat text", press and hold the text, and copy it.'; });
  }
});

// Trade idea filters (pieces / position / picks)
$('#view').addEventListener('change', e => {
  const key = e.target.dataset && e.target.dataset.ifilter;
  if (!key) return;
  app.ideaFilter[key] = e.target.value;
  Store.set('sd_idea_filter', app.ideaFilter);
  $('#trade-dyn').innerHTML = renderTradeDynamic(buildTrade(currentLeague(), app.leagueData[app.leagueId]));
});

// Changing the trade partner
$('#view').addEventListener('change', e => {
  if (e.target.id !== 'trade-opp') return;
  const d = app.leagueData[app.leagueId];
  d.trade = { opp: Number(e.target.value), give: d.trade.give, get: [] };
  showLeague();
});

// Sliders: update live while dragging, without redrawing the slider itself.
$('#view').addEventListener('input', e => {
  const key = e.target.dataset && e.target.dataset.tset;
  if (!key) return;
  const league = currentLeague(), d = app.leagueData[app.leagueId];
  const settings = tradeSettingsFor(league);
  if (e.target.type === 'checkbox') {
    settings[key] = e.target.checked;
    Store.set('sd_trade_' + league.league_id, settings);
    showLeague(); // redraw everything (the explanation text changes too)
    return;
  }
  settings[key] = Number(e.target.value);
  Store.set('sd_trade_' + league.league_id, settings);
  $('[data-tlabel="' + key + '"]').textContent = settings[key] + '%';
  $('#trade-dyn').innerHTML = renderTradeDynamic(buildTrade(league, d));
});

function fillLeaguePicker() {
  const sel = $('#league-picker');
  // Guillotine leagues go last (you're usually eliminated there; still handy for standings and recaps).
  app.me.leagues.sort((a, b) => isGuillotine(a) - isGuillotine(b));
  sel.innerHTML = app.me.leagues.map(l =>
    '<option value="' + esc(l.league_id) + '">' + esc(l.name) + '</option>').join('');
  const remembered = Store.get('sd_league');
  app.leagueId = app.me.leagues.some(l => l.league_id === remembered) ? remembered : (app.me.leagues[0] || {}).league_id;
  sel.value = app.leagueId;
}

// One full load. In 'cache' mode everything comes from saved copies (instant); errors stay quiet.
async function loadAll(forcePlayers, mode) {
  NET.mode = mode; NET.offline = false; NET.oldest = null;
  // Remember on-screen choices (trade picks, recap week) so a refresh doesn't wipe them.
  for (const id in app.leagueData) {
    const d = app.leagueData[id];
    app.uiKeep[id] = { trade: d.trade, recapWeek: d.recapWeek };
  }
  app.leagueData = {};
  clearStatsCache();
  // Wait for both to finish (even if one fails) so nothing from this pass keeps running into the next.
  const [meR, plR] = await Promise.allSettled([loadMe(CONFIG.username), loadPlayers(forcePlayers)]);
  if (meR.status === 'rejected') throw meR.reason;
  if (plR.status === 'rejected') throw plR.reason;
  const me = meR.value, pl = plR.value;
  app.me = me;
  app.players = pl.players;
  app.playersSavedAt = pl.savedAt;
  app.schedule = await loadSchedule(me.season);
  app.games = await loadGames(me.season, currentWeek());
  if (!me.leagues.length) throw new Error('No ' + me.season + ' leagues found for ' + CONFIG.username + '.');
  fillLeaguePicker();
  await showLeague();
}

async function reloadAll(forcePlayers) {
  const btn = $('#refresh');
  btn.classList.add('spin');
  try {
    // 1. Draw instantly from saved copies (only when opening the app; skipped if nothing saved yet).
    if (!app.me && !forcePlayers) {
      try { await loadAll(false, 'cache'); setStatus('saved'); } catch (e) { /* first visit: nothing saved */ }
    }
    // 2. Fresh data (or saved copies if there's no signal).
    await loadAll(forcePlayers, 'network');
    app.loadedAt = Date.now();
    setStatus();
  } catch (err) {
    if (!app.me) $('#view').innerHTML = renderError(err.message);
    else setStatus();
  } finally {
    NET.mode = 'network';
    btn.classList.remove('spin');
  }
}

// ---------- Game Day tab: every league at once ----------
async function loadAllLeagues(week) {
  await Promise.all(app.me.leagues.map(async league => {
    const id = league.league_id;
    if (!app.leagueData[id]) app.leagueData[id] = Object.assign(await loadLeague(league, week), app.uiKeep[id] || {});
  }));
}

async function showGameDay(week) {
  const view = $('#view');
  try {
    if (app.me.leagues.some(l => !app.leagueData[l.league_id])) {
      if (NET.mode !== 'cache') view.innerHTML = '<p class="muted center">Loading all your leagues…</p>';
      await loadAllLeagues(week);
    }
    if (app.tab !== 'gameday') return;
    const gd = analyzeGameDay({
      leagues: app.me.leagues, leagueData: app.leagueData, players: app.players, games: app.games,
      userId: app.me.user.user_id, includeBench: app.gdOpts.includeBench,
    });
    const note = app.games && app.games.anyLive ? '🟢 Games live — updates every minute' + (app.liveAt ? ' (last ' + timeOf(app.liveAt) + ')' : '') : '';
    view.innerHTML = renderGameDay(gd, app.gdOpts, note);
    scheduleLive();
  } catch (err) {
    if (app.tab === 'gameday' && NET.mode !== 'cache') view.innerHTML = renderError(err.message);
  }
}

$('#view').addEventListener('click', e => {
  const b = e.target.closest('[data-gdbench]');
  if (!b) return;
  app.gdOpts.includeBench = b.dataset.gdbench === '1';
  Store.set('sd_gameday_opts', app.gdOpts);
  showLeague();
});

// ---------- Player details panel ----------
// Tap a player on My Team, Game Day or Waivers. (On Trade, a tap picks players for the trade instead.)
let sheetPid = null;
async function openPlayer(id) {
  sheetPid = id;
  const sheet = $('#sheet'), body = $('#sheet-body');
  sheet.classList.remove('hidden');
  document.body.classList.add('sheet-open');
  if (!history.state || !history.state.sheet) history.pushState({ sheet: true }, ''); // phone Back button closes it
  const draw = (points, pointsLeague) => {
    if (sheetPid !== id) return;
    body.innerHTML = renderPlayerSheet(playerDetails({
      id, players: app.players, games: app.games, leagues: app.me.leagues, leagueData: app.leagueData,
      userId: app.me.user.user_id, points, pointsLeague,
    }));
  };
  draw(null, null);
  try {
    const week = currentWeek();
    await loadAllLeagues(week); // so "Your leagues" covers every league
    // Points use the league you're looking at (on Game Day: the first league where he's yours).
    let league = currentLeague();
    if (app.tab === 'gameday') {
      league = app.me.leagues.find(l => {
        const d = app.leagueData[l.league_id], r = d && d.rosters.find(x => isMine(x, app.me.user.user_id));
        return r && (r.players || []).includes(id);
      }) || league;
    }
    const points = await loadPoints(league, app.me.season, week, app.players);
    draw(points, league);
  } catch (e) {
    draw(null, null);
  }
}

function closePlayer(fromBack) {
  if ($('#sheet').classList.contains('hidden')) return;
  $('#sheet').classList.add('hidden');
  document.body.classList.remove('sheet-open');
  sheetPid = null;
  if (!fromBack && history.state && history.state.sheet) history.back();
}

$('#view').addEventListener('click', e => {
  if (app.tab === 'trade') return;
  const row = e.target.closest('[data-pid]');
  if (row && app.players[row.dataset.pid]) openPlayer(row.dataset.pid);
});
$('#sheet').addEventListener('click', e => { if (e.target.closest('[data-sheet-close]')) closePlayer(false); });
window.addEventListener('popstate', () => closePlayer(true));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayer(false); });

// ---------- Live scores on game day ----------
// While any NFL game is being played and you're looking at My Team, quietly re-download this
// league's scores and the NFL scoreboard every minute (paused while the app is in the background).
let liveTimer = null;
function scheduleLive() {
  clearTimeout(liveTimer);
  if (app.games && app.games.anyLive) liveTimer = setTimeout(refreshLive, CONFIG.liveRefreshSeconds * 1000);
}

async function refreshLive() {
  const tab = app.tab;
  if (document.hidden || (tab !== 'team' && tab !== 'gameday') || NET.mode !== 'network') return scheduleLive();
  // My Team: just this league. Game Day: every league you've loaded.
  const ids = tab === 'gameday' ? Object.keys(app.leagueData) : [app.leagueId];
  if (!ids.length || !app.leagueData[ids[0]]) return scheduleLive();
  try {
    const week = currentWeek();
    const [games, ...fresh] = await Promise.all([loadGames(app.me.season, week)].concat(ids.map(id => Promise.all([
      getJSON(SLEEPER + '/league/' + id + '/matchups/' + week),
      getJSON(SLEEPER + '/league/' + id + '/rosters'),
    ]))));
    app.games = games;
    ids.forEach((id, i) => {
      const d = app.leagueData[id];
      if (!d) return;
      d.matchups = fresh[i][0]; d.rosters = fresh[i][1];
      if (d.recapMatchups) d.recapMatchups[week] = d.matchups;
      d.waivers = null; // lineups may have changed
    });
    app.liveAt = Date.now();
    if (app.tab === tab) await showLeague();
    else scheduleLive();
  } catch (e) {
    scheduleLive(); // try again next minute
  }
}

// Coming back to the app after a while? Refresh automatically.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (app.me && hiddenAt && Date.now() - hiddenAt > CONFIG.refreshAfterAwayMinutes * 60000) reloadAll(false);
  else if (app.games && app.games.anyLive) { clearTimeout(liveTimer); refreshLive(); }
});

// Saves the page itself on the phone so it opens with no signal (sw.js).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

$('#league-picker').addEventListener('change', e => {
  app.leagueId = e.target.value;
  Store.set('sd_league', app.leagueId);
  showLeague();
});

document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  app.tab = b.dataset.tab;
  Store.set('sd_tab', app.tab);
  if (app.me) showLeague();
  window.scrollTo(0, 0);
}));

$('#refresh').addEventListener('click', () => reloadAll(false));

// Highlight the tab you were last on.
document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === app.tab));

reloadAll(false);
