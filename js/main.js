// Wires it all together: loads data, remembers your choices, switches tabs and leagues.
const app = {
  me: null, players: null, playersSavedAt: null, schedule: null,
  leagueData: {},      // league_id -> { rosters, users, matchups }
  leagueId: null,
  tab: 'team',
  tradePos: 'ALL',
  fp: null,            // FantasyPros dynasty values (data/dynasty-values.json)
  waiverOpts: Object.assign({ filter: 'ALL', sort: 'trend' }, Store.get('sd_waiver_opts') || {}),
};

const $ = sel => document.querySelector(sel);

function currentWeek() {
  const s = app.me.state;
  return s.season_type === 'regular' || s.season_type === 'post' ? (s.week || s.display_week || 0) : 0;
}

function setStatus() {
  const parts = [];
  if (app.playersSavedAt) parts.push('Player list saved ' + ago(app.playersSavedAt));
  parts.push('<a href="#" id="refresh-players">refresh player list</a>');
  $('#status').innerHTML = parts.join(' · ');
  $('#refresh-players').onclick = e => { e.preventDefault(); reloadAll(true); };
}

async function showLeague() {
  const league = app.me.leagues.find(l => l.league_id === app.leagueId);
  const view = $('#view');
  if (!league) { view.innerHTML = renderError('No leagues found for ' + CONFIG.username + '.'); return; }

  if (app.tab === 'standings') {
    view.innerHTML = renderComingSoon('Standings & Recap');
    return;
  }

  const week = currentWeek();
  const tab = app.tab;
  const stillHere = () => app.leagueId === league.league_id && app.tab === tab; // you may switch while it loads
  try {
    if (!app.leagueData[league.league_id]) {
      view.innerHTML = '<p class="muted center">Loading ' + esc(league.name) + '…</p>';
      app.leagueData[league.league_id] = await loadLeague(league, week);
    }
    if (!stillHere()) return;
    const d = app.leagueData[league.league_id];
    const byes = byeTeams(app.schedule, week, app.players);
    const team = analyzeMyTeam({
      league, rosters: d.rosters, users: d.users, matchups: d.matchups,
      players: app.players, week, userId: app.me.user.user_id, byes,
    });

    if (tab === 'team') { view.innerHTML = renderMyTeam(team, league); return; }

    if (tab === 'trade') {
      if (!d.tradeStats) {
        view.innerHTML = '<p class="muted center">Loading stats…</p>';
        const weeks = [];
        for (let w = week - 1; w >= 1 && weeks.length < CONFIG.trade.recentWeeks; w--) weeks.push(w);
        const [seasonStats, ...weekly] = await Promise.all([loadStats(app.me.season, 0)].concat(weeks.map(w => loadStats(app.me.season, w).catch(() => ({})))));
        d.tradeStats = { seasonStats, weekStats: weeks.map((w, i) => ({ week: w, stats: weekly[i] })) };
        app.fp = await loadDynastyValues();
        d.tradedPicks = leagueFormat(league) === 'dynasty'
          ? await getJSON(SLEEPER + '/league/' + league.league_id + '/traded_picks').catch(() => []) : [];
      }
      if (!stillHere()) return;
      d.byes = byes;
      view.innerHTML = renderTrade(buildTrade(league, d));
      return;
    }

    // Waiver Wire: needs season stats, last week's stats and trending adds (a few MB, once per visit).
    if (!d.waivers) {
      view.innerHTML = '<p class="muted center">Loading stats and trending players…</p>';
      const lastWeek = week > 1 ? week - 1 : 0;
      const [seasonStats, lastWeekStats, trending] = await Promise.all([
        loadStats(app.me.season, 0),
        lastWeek ? loadStats(app.me.season, lastWeek).catch(() => null) : null,
        loadTrending().catch(() => []),
      ]);
      d.waivers = analyzeWaivers({
        league, rosters: d.rosters, players: app.players, seasonStats, lastWeekStats, trending,
        userId: app.me.user.user_id, byes, team,
      });
    }
    if (!stillHere()) return;
    view.innerHTML = renderWaivers(d.waivers, app.waiverOpts);
  } catch (err) {
    if (stillHere()) view.innerHTML = renderError(err.message);
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
    seasonStats: d.tradeStats.seasonStats, weekStats: d.tradeStats.weekStats, byes: d.byes, fp: app.fp,
  }, settings);
  // Dynasty + FantasyPros: add each team's draft picks to its list.
  const fpOn = usesFP(league, settings, app.fp);
  const picks = fpOn ? draftPickValues({ league, rosters: d.rosters, users: d.users, tradedPicks: d.tradedPicks, fp: app.fp }) : {};
  Object.assign(values, picks);
  const picksOf = rosterId => Object.keys(picks).filter(id => picks[id].owner === rosterId)
    .sort((a, b) => picks[b].value - picks[a].value);
  const cmp = compareTrade(values, d.trade.give, d.trade.get);
  cmp.fp = usesFP(league, settings, app.fp) ? app.fp : null;
  return {
    hasTeam, settings, values, state: d.trade, pos: app.tradePos, positions: leaguePositions(league), opponents: others, oppName: opp.name,
    myIds: mine.players.concat(picksOf(mine.roster_id)), oppIds: opp.roster.players.concat(picksOf(opp.roster_id)),
    hasPicks: Object.keys(picks).length > 0,
    cmp, fpAvailable: !!app.fp && leagueFormat(league) === 'dynasty',
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
  sel.innerHTML = app.me.leagues.map(l =>
    '<option value="' + esc(l.league_id) + '">' + esc(l.name) + '</option>').join('');
  const remembered = Store.get('sd_league');
  app.leagueId = app.me.leagues.some(l => l.league_id === remembered) ? remembered : (app.me.leagues[0] || {}).league_id;
  sel.value = app.leagueId;
}

async function reloadAll(forcePlayers) {
  const btn = $('#refresh');
  btn.classList.add('spin');
  app.leagueData = {};
  try {
    const [me, pl] = await Promise.all([loadMe(CONFIG.username), loadPlayers(forcePlayers)]);
    app.me = me;
    app.players = pl.players;
    app.playersSavedAt = pl.savedAt;
    app.schedule = await loadSchedule(me.season);
    if (!me.leagues.length) { $('#view').innerHTML = renderError('No ' + me.season + ' leagues found for ' + CONFIG.username + '.'); return; }
    fillLeaguePicker();
    setStatus();
    await showLeague();
  } catch (err) {
    $('#view').innerHTML = renderError(err.message);
  } finally {
    btn.classList.remove('spin');
  }
}

$('#league-picker').addEventListener('change', e => {
  app.leagueId = e.target.value;
  Store.set('sd_league', app.leagueId);
  showLeague();
});

document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  app.tab = b.dataset.tab;
  if (app.me) showLeague();
  window.scrollTo(0, 0);
}));

$('#refresh').addEventListener('click', () => reloadAll(false));

reloadAll(false);
