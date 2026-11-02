// Wires it all together: loads data, remembers your choices, switches tabs and leagues.
const app = {
  me: null, players: null, playersSavedAt: null, schedule: null,
  leagueData: {},      // league_id -> { rosters, users, matchups }
  leagueId: null,
  tab: 'team',
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

  if (app.tab !== 'team') {
    const names = { waivers: 'Waiver Wire', trade: 'Trade Analyzer', standings: 'Standings & Recap' };
    view.innerHTML = renderComingSoon(names[app.tab]);
    return;
  }

  const week = currentWeek();
  try {
    if (!app.leagueData[league.league_id]) {
      view.innerHTML = '<p class="muted center">Loading ' + esc(league.name) + '…</p>';
      app.leagueData[league.league_id] = await loadLeague(league, week);
    }
    if (app.leagueId !== league.league_id) return; // you switched leagues while it loaded
    const d = app.leagueData[league.league_id];
    const t = analyzeMyTeam({
      league, rosters: d.rosters, users: d.users, matchups: d.matchups,
      players: app.players, week, userId: app.me.user.user_id,
      byes: byeTeams(app.schedule, week, app.players),
    });
    view.innerHTML = renderMyTeam(t, league);
  } catch (err) {
    view.innerHTML = renderError(err.message);
  }
}

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
