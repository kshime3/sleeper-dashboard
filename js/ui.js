// Display: turns the worked-out data into what you see on screen.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtPts(n) { return (n == null || isNaN(n)) ? '–' : Number(n).toFixed(2); }
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h + (h === 1 ? ' hour ago' : ' hours ago');
}

function playerRow(r) {
  const p = r.player;
  const worst = r.flags.some(f => f.level === 'bad') ? 'bad' : (r.flags.length ? 'warn' : '');
  const tags = r.flags.map(f => '<span class="tag ' + f.level + '">' + esc(f.tag) + '</span>').join('');
  const slotClass = p && r.slot !== 'BN' && r.slot !== 'IR' && r.slot !== 'TAXI' ? r.slot : (p ? p.pos : '');
  return '<div class="row' + (worst ? ' flag-' + worst : '') + '">' +
    '<div class="slot ' + esc(slotClass) + '">' + esc(r.label || r.slot) + '</div>' +
    '<div>' + (p
      ? '<div class="pname">' + esc(p.name) + tags + '</div><div class="pmeta">' + esc(p.pos) + ' · ' + esc(p.team || 'no team') + (p.injury ? ' · ' + esc(p.injury) : '') + '</div>'
      : '<div class="pname">Empty' + tags + '</div><div class="pmeta">Nobody in this spot</div>') +
    '</div>' +
    '<div class="ppts">' + (p ? fmtPts(r.pts) : '') + '</div>' +
  '</div>';
}

function renderMyTeam(t, league) {
  if (t.notOnLeague) return '<div class="card">You don\'t have a team in this league.</div>';
  let html = '';

  // 1. Matchup / guillotine status
  if (t.guillotine) {
    const g = t.guillotine;
    html += '<div class="card"><h2>Week ' + t.week + ' · Guillotine</h2>';
    if (g.eliminated) {
      html += '<div class="pname">🪓 Your team has been eliminated.</div>' +
        '<div class="pmeta">' + g.aliveCount + ' of ' + g.totalTeams + ' teams still alive. Lowest so far this week: ' +
        esc(g.lowest ? g.lowest.name + ' (' + fmtPts(g.lowest.points) + ')' : '–') + '</div>';
    } else {
      const safe = g.cushion != null && g.cushion > 0;
      html += '<div class="score"><div class="side"><div class="name">' + esc(t.me.name) + '</div><div class="pmeta">Rank ' + g.rank + ' of ' + g.aliveCount + ' this week</div></div>' +
        '<div class="vs"></div><div class="side right"><div class="pts">' + fmtPts(t.me.points) + '</div></div></div>' +
        '<div class="pmeta" style="margin-top:6px">' + (g.cushion == null
          ? '<span class="trail">You are currently the lowest score — on the chopping block.</span>'
          : '<span class="' + (safe ? 'lead' : 'trail') + '">' + fmtPts(g.cushion) + ' points above the lowest team (' + esc(g.lowest.name) + ').</span>') + '</div>';
    }
    html += '</div>';
  } else {
    html += '<div class="card"><h2>Week ' + t.week + ' matchup</h2>';
    if (t.opp) {
      const lead = (t.me.points || 0) - (t.opp.points || 0);
      const cls = lead > 0 ? 'lead' : lead < 0 ? 'trail' : '';
      html += '<div class="score">' +
        '<div class="side"><div class="name">' + esc(t.me.name) + '</div><div class="pmeta">' + t.me.record.text + '</div><div class="pts ' + cls + '">' + fmtPts(t.me.points) + '</div></div>' +
        '<div class="vs">vs</div>' +
        '<div class="side right"><div class="name">' + esc(t.opp.name) + '</div><div class="pmeta">' + t.opp.record.text + '</div><div class="pts">' + fmtPts(t.opp.points) + '</div></div>' +
      '</div>';
    } else {
      html += '<div class="pname">' + esc(t.me.name) + ' <span class="pmeta">' + t.me.record.text + '</span></div><div class="pmeta">No matchup this week.</div>';
    }
    html += '</div>';
  }

  if (t.guillotine && t.guillotine.eliminated) return html;

  // 2. Lineup alerts
  html += '<div class="card"><h2>Lineup check</h2>';
  if (!t.alerts.length) {
    html += '<div class="all-good">✓ No empty, injured or bye-week starters.</div>';
  } else {
    for (const a of t.alerts) {
      html += '<div class="alert ' + a.level + '">' + (a.level === 'bad' ? '⛔ ' : '⚠️ ') + esc(a.text) +
        (a.swaps.length ? '<div class="swap">Bench option' + (a.swaps.length > 1 ? 's' : '') + ': ' + esc(a.swaps.join(', ')) + '</div>' : '') +
      '</div>';
    }
  }
  if (!t.byesKnown) html += '<div class="pmeta small" style="margin-top:6px">Bye weeks unavailable right now (couldn\'t load the NFL schedule).</div>';
  html += '</div>';

  // 3. Starters
  html += '<div class="card"><h2>Starters</h2>' + t.starters.map(playerRow).join('') + '</div>';

  // 4. Bench, IR, taxi
  const benchFlags = t.bench.filter(r => r.flags.length).length;
  html += '<div class="card"><details open><summary>Bench (' + t.bench.length + ')' + (benchFlags ? ' · ' + benchFlags + ' hurt/bye' : '') + '</summary>' +
    t.bench.map(playerRow).join('') + '</details></div>';
  if (t.reserve.length) html += '<div class="card"><details><summary>Injured reserve (' + t.reserve.length + ')</summary>' + t.reserve.map(playerRow).join('') + '</details></div>';
  if (t.taxi.length) html += '<div class="card"><details><summary>Taxi squad (' + t.taxi.length + ')</summary>' + t.taxi.map(playerRow).join('') + '</details></div>';
  return html;
}

function renderComingSoon(name) {
  return '<div class="card center"><div class="pname">' + esc(name) + '</div><div class="pmeta">Coming next — we\'re building one section at a time.</div></div>';
}

function renderError(msg) {
  return '<div class="card error"><div class="pname">Something went wrong</div><div class="pmeta">' + esc(msg) +
    '</div><p><button class="btn" onclick="location.reload()">Try again</button></p></div>';
}

function fmtCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
}
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function renderWaivers(w, opts) {
  let html = '';
  // A remembered filter might not exist in this league (e.g. K, or "My needs" with no team).
  const valid = ['ALL'].concat(w.hasTeam ? ['NEEDS'] : [], w.positions);
  if (!valid.includes(opts.filter)) opts = Object.assign({}, opts, { filter: 'ALL' });

  // 1. Your weak spots
  html += '<div class="card"><h2>Your weak spots</h2>';
  if (!w.hasTeam) {
    html += '<div class="pmeta">You don\'t have players in this league, so there\'s nothing to compare. The list below still shows who\'s available.</div>';
  } else {
    html += '<div class="chips">' + w.strength.map(s =>
      '<span class="chip ' + (s.weak ? 'weak' : 'ok') + '" title="Your top ' + s.n + ' ' + s.pos + ' average ' + s.avg.toFixed(1) + ' pts/g (league ' + s.leagueAvg.toFixed(1) + ')">' +
      '<b>' + s.pos + '</b> ' + ordinal(s.rank) + ' of ' + s.teams + '</span>').join('') + '</div>';
    const weak = w.strength.filter(s => s.weak);
    html += '<div class="pmeta small" style="margin-top:6px">' + (weak.length
      ? 'Red = you rank in the bottom half of your league there (points per game of your starters at that position). Free agents who\'d beat your weakest starter there get a ⭐.'
      : 'You\'re in the top half of your league at every position.') + '</div>';
    for (const h of w.holes) {
      html += '<div class="alert bad">⛔ This week: ' + esc(h.label) + ' — ' + esc(h.who) + ' ' + esc(h.why) + '</div>';
    }
  }
  if (w.faab && w.hasTeam) html += '<div class="pmeta" style="margin-top:8px">💰 FAAB left: <b>$' + w.faab.left + '</b> of $' + w.faab.budget + '</div>';
  html += '</div>';

  // 2. Filters
  const chip = (val, label) => '<button class="fchip' + (opts.filter === val ? ' on' : '') + '" data-wfilter="' + val + '">' + label + '</button>';
  html += '<div class="filters">' + chip('ALL', 'All') + (w.hasTeam ? chip('NEEDS', '⭐ My needs') : '') + w.positions.map(p => chip(p, p)).join('') + '</div>';
  html += '<div class="seg">' +
    '<button data-wsort="trend" class="' + (opts.sort === 'trend' ? 'on' : '') + '">🔥 Trending adds</button>' +
    '<button data-wsort="ppg" class="' + (opts.sort === 'ppg' ? 'on' : '') + '">📊 Points per game</button></div>';

  // 3. The list
  const list = waiverList(w, opts.filter, opts.sort);
  html += '<div class="card">';
  if (!list.length) {
    html += '<div class="pmeta">' + (opts.filter === 'NEEDS'
      ? 'No free agent beats your current starters at your weak spots right now. Good news!'
      : 'Nobody matches. Try another filter' + (opts.sort === 'trend' ? ' or sort by points per game' : '') + '.') + '</div>';
  }
  for (const e of list) {
    const p = e.player;
    const worst = e.flags.some(f => f.level === 'bad') ? 'bad' : '';
    const tags = e.flags.map(f => '<span class="tag ' + f.level + '">' + esc(f.tag) + '</span>').join('');
    html += '<div class="row wrow' + (e.fits.length ? ' fits' : '') + (worst ? ' flag-bad' : '') + '">' +
      '<div class="slot ' + esc(p.pos) + '">' + esc(p.pos) + '</div>' +
      '<div><div class="pname">' + (e.fits.length ? '⭐ ' : '') + esc(p.name) + tags + '</div>' +
        '<div class="pmeta">' + esc(p.team) + ' · ' + (e.line.games ? e.line.ppg.toFixed(1) + ' pts/g in ' + e.line.games + ' g' : 'no games yet') +
        (e.lastWeek != null ? ' · last wk ' + e.lastWeek.toFixed(1) : '') + '</div>' +
        e.fits.map(f => '<div class="fit">' + esc(f) + '</div>').join('') +
      '</div>' +
      '<div class="ppts">' + (e.trend ? '<div>🔥' + fmtCount(e.trend) + '</div><div class="pmeta">adds</div>' : '') + '</div>' +
    '</div>';
  }
  html += '<div class="pmeta small" style="margin-top:8px">Points use this league\'s scoring. "Adds" = times added across all Sleeper leagues in the last ' + CONFIG.waivers.trendingHours + ' hours.</div>';
  html += '</div>';
  return html;
}
