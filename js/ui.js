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

// ---------- Trade Analyzer ----------
function recentText(b) {
  return b.recent.map(r => r.pts == null ? '–' : r.pts.toFixed(1)).join(' · ');
}

function whyText(b) {
  if (b.isPick) return b.why;
  if (b.fp) {
    const src = 'FantasyPros ' + app.fp.source.month;
    return b.fp.listed
      ? src + (b.fp.kind ? ' ' + b.fp.kind : '') + ' value: ' + b.value + (b.fp.chg ? ' (' + b.fp.chg + ' since last month)' : '')
      : 'Not on the ' + src + ' chart, so he gets their "All other ' + b.player.pos + 's" value: ' + b.value + ' (est.)';
  }
  return 'Blend ' + b.blended.toFixed(1) + '/g (season ' + b.season.ppg.toFixed(1) +
    (b.recentPpg != null ? ', recent ' + b.recentPpg.toFixed(1) : ', no recent games') + ')' +
    ' − best free agent ' + b.player.pos + ' (' + b.replWho + ') ' + b.repl.toFixed(1) +
    ' = ' + (b.over >= 0 ? '+' : '') + b.over.toFixed(1) + (b.over < 0 ? ' → counts as 0' : '') +
    (b.age.text ? ' · age ' + b.player.age + ': ' + b.age.text : '') +
    (b.inj.text ? ' · ' + b.player.injury + ': ' + b.inj.text : '') +
    ' → value ' + b.value.toFixed(1);
}

function fmtValue(b) {
  if (b.isPick) return b.value + (b.est ? ' est.' : '');
  if (b.fp) return b.value + (b.fp.listed ? '' : ' est.');
  return b.value.toFixed(1);
}

function tradeCard(b) {
  const p = b.player;
  if (b.isPick) {
    return '<div class="tcard"><div class="pname"><span class="slot inline PICK">PICK</span> ' + esc(p.name) + '</div>' +
      (b.from ? '<div class="pmeta">From ' + esc(b.from) + '</div>' : '') +
      '<details class="why"><summary>Value <b>' + fmtValue(b) + '</b> — why?</summary><div class="pmeta">' + esc(whyText(b)) + '</div></details></div>';
  }
  const tags = b.flags.map(f => '<span class="tag ' + f.level + '">' + esc(f.tag) + '</span>').join('');
  return '<div class="tcard">' +
    '<div class="pname"><span class="slot inline ' + esc(p.pos) + '">' + esc(p.pos) + '</span> ' + esc(p.name) + tags + '</div>' +
    '<div class="pmeta">' + esc(p.team || 'no team') + (p.age ? ' · age ' + p.age : '') + (p.injury ? ' · ' + esc(p.injury) : '') + '</div>' +
    '<div class="tstat"><span>Season</span><b>' + b.season.total.toFixed(1) + '</b> <span class="pmeta">(' + b.season.ppg.toFixed(1) + '/g, ' + b.season.games + ' g)</span></div>' +
    '<div class="tstat"><span>Wk ' + b.recent.map(r => r.week).join(', ') + '</span><b>' + recentText(b) + '</b></div>' +
    '<details class="why"><summary>Value <b>' + fmtValue(b) + '</b> — why?</summary><div class="pmeta">' + esc(whyText(b)) + '</div></details>' +
  '</div>';
}

function tradeResult(cmp) {
  const total = (cmp.give.value + cmp.get.value) || 1;
  const getShare = Math.round(cmp.get.value / total * 100);
  let html = '<div class="card"><h2>Trade check</h2>';
  html += '<div class="verdict ' + cmp.verdict.cls + '">' + esc(cmp.verdict.text) + '</div>';
  if (cmp.give.rows.length && cmp.get.rows.length) {
    html += '<div class="tbar"><div style="width:' + getShare + '%"></div></div>' +
      '<div class="tbar-labels"><span>You get <b>' + cmp.get.value.toFixed(1) + '</b></span><span>You give <b>' + cmp.give.value.toFixed(1) + '</b></span></div>';
    html += '<div class="pmeta small">Season points: get ' + cmp.get.seasonPts.toFixed(1) + ' vs give ' + cmp.give.seasonPts.toFixed(1) + '.';
    if (cmp.spotsChange < 0) html += ' You\'d need to drop ' + (-cmp.spotsChange) + ' player' + (cmp.spotsChange < -1 ? 's' : '') + ' to make room.';
    if (cmp.spotsChange > 0) html += ' You\'d open ' + cmp.spotsChange + ' roster spot' + (cmp.spotsChange > 1 ? 's' : '') + ' for a free-agent pickup.';
    html += '</div>';
  }
  if (cmp.fp) html += '<div class="pmeta small credit">Values: <a href="' + esc(cmp.fp.source.url) + '" target="_blank" rel="noopener">FantasyPros Dynasty Trade Value Chart (' + esc(cmp.fp.source.month) + ')</a>. Values © FantasyPros.</div>';
  html += '<div class="tcols"><div><h3>You give</h3>' + (cmp.give.rows.map(tradeCard).join('') || '<div class="pmeta">Tap your players below.</div>') + '</div>' +
    '<div><h3>You get</h3>' + (cmp.get.rows.map(tradeCard).join('') || '<div class="pmeta">Tap their players below.</div>') + '</div></div>';
  return html + '</div>';
}

function pickList(title, ids, values, picked, side, pos) {
  const rows = ids.map(id => values[id])
    .filter(b => b && (pos === 'ALL' || b.player.positions.includes(pos)))
    .sort((a, b) => b.value - a.value);
  if (!rows.length) return '<div class="card"><h2>' + esc(title) + '</h2><div class="pmeta">No ' + esc(pos) + 's.</div></div>';
  return '<div class="card"><h2>' + esc(title) + '</h2>' + rows.map(b => {
    const p = b.player, on = picked.includes(p.id);
    const tags = b.flags.map(f => '<span class="tag ' + f.level + '">' + esc(f.tag) + '</span>').join('');
    return '<button class="row pick' + (on ? ' on' : '') + '" data-tpick="' + side + '" data-id="' + esc(p.id) + '">' +
      '<div class="slot ' + esc(p.pos) + '">' + esc(p.pos) + '</div>' +
      '<div><div class="pname">' + (on ? '✓ ' : '') + esc(p.name) + tags + '</div><div class="pmeta">' + (b.isPick
        ? (b.from ? 'From ' + esc(b.from) : 'Own pick') + (b.est ? ' · estimate' : '')
        : esc(p.team || 'no team') + (p.age ? ' · ' + p.age + ' yrs' : '') + ' · ' + b.blended.toFixed(1) + '/g') + '</div></div>' +
      '<div class="ppts">' + fmtValue(b) + '<div class="pmeta">value</div></div></button>';
  }).join('') + '</div>';
}

function renderTradeDynamic(t) {
  const positions = t.positions.concat(t.hasPicks ? ['PICK'] : []);
  const pos = ['ALL'].concat(positions).includes(t.pos) ? t.pos : 'ALL';
  const chip = (val, label) => '<button class="fchip' + (pos === val ? ' on' : '') + '" data-tpos="' + val + '">' + label + '</button>';
  return tradeResult(t.cmp) +
    '<div class="filters">' + chip('ALL', 'All') + positions.map(p => chip(p, p === 'PICK' ? 'Picks' : p)).join('') + '</div>' +
    pickList('Your players', t.myIds, t.values, t.state.give, 'give', pos) +
    pickList(t.oppName + '\'s players', t.oppIds, t.values, t.state.get, 'get', pos);
}

function renderTrade(t) {
  if (!t.hasTeam) return '<div class="card">You don\'t have players in this league, so there\'s nothing to trade.</div>';
  const s = t.settings;
  const slider = (key, label, val, help) =>
    '<label class="slider"><div><span>' + label + '</span><b data-tlabel="' + key + '">' + val + '%</b></div>' +
    '<input type="range" min="0" max="100" step="10" value="' + val + '" data-tset="' + key + '">' +
    '<div class="pmeta small">' + help + '</div></label>';
  return '<div class="card"><h2>Trade with</h2><select id="trade-opp">' +
      t.opponents.map(o => '<option value="' + o.roster_id + '"' + (o.roster_id === t.state.opp ? ' selected' : '') + '>' + esc(o.name) + '</option>').join('') +
    '</select>' + (t.state.give.length || t.state.get.length ? '<button class="link" data-treset="picks">Clear picks</button>' : '') + '</div>' +
    '<div id="trade-dyn">' + renderTradeDynamic(t) + '</div>' +
    '<div class="card"><details class="tsettings"><summary>How values work · adjust</summary>' +
      (t.fpAvailable
        ? '<label class="toggle"><input type="checkbox" data-tset="useFP"' + (s.useFP ? ' checked' : '') + '> Use FantasyPros dynasty values</label>' +
          '<p class="small">' + (s.useFP
            ? 'Values come from the <a href="' + esc(app.fp.source.url) + '" target="_blank" rel="noopener">FantasyPros Dynasty Trade Value Chart (' + esc(app.fp.source.month) + ')</a> (superflex values for QBs in this league). Players not on their chart get FantasyPros\' "All other" value, marked est. The chart is checked daily and switches to the new month\'s article once it\'s published. The sliders below only apply when this is off.'
            : 'Off: using the formula below instead.') + '</p>'
        : '') +
      '<p class="small">A player\'s <b>value</b> = how many more points per game he scores than the <b>best free agent at his position</b> in this league, adjusted for age and injury. Anyone no better than a free agent counts as 0. Points use this league\'s scoring.</p>' +
      slider('recentWeight', 'Recent weeks vs. season', s.recentWeight, 'How much of the points-per-game blend comes from the last ' + CONFIG.trade.recentWeeks + ' weeks (the rest is the whole season). 0% = season only, 100% = recent only.') +
      slider('ageEffect', 'Age matters', s.ageEffect, 'Young players get up to +15%; each year past peak age (QB 30, RB 25, WR/TE 27) costs RB 10%, WR/TE 6%, QB 4%. Starts at 100% in dynasty, 50% in keeper, 0% in redraft.') +
      slider('injuryEffect', 'Injury cut', s.injuryEffect, 'At 100%: Questionable −5%, Doubtful −15%, Out −20%, IR/PUP/Suspended −40%.') +
      '<button class="btn small-btn" data-treset="settings">Reset to defaults</button>' +
    '</details></div>';
}

// ---------- Standings & Weekly Recap ----------
function renderStandings(st, recap, league, weeks, recapWeek, currentWk) {
  let html = '<div class="card"><h2>' + (st.guillotine ? 'Survivors' : 'Standings') + '</h2>' +
    '<table class="stand"><thead><tr><th>#</th><th>Team</th>' + (st.guillotine ? '' : '<th>W-L</th>') + '<th>PF</th>' + (st.guillotine ? '' : '<th>PA</th>') + '</tr></thead><tbody>';
  st.rows.forEach((r, i) => {
    const cut = st.guillotine ? (r.alive && st.rows[i + 1] && !st.rows[i + 1].alive) : (st.playoffTeams && i + 1 === st.playoffTeams);
    html += '<tr class="' + (r.mine ? 'me ' : '') + (st.guillotine && !r.alive ? 'out ' : '') + (cut ? 'cutline' : '') + '">' +
      '<td>' + (st.guillotine && !r.alive ? '🪓' : r.rank) + '</td>' +
      '<td><div class="tname">' + esc(r.name) + '</div><div class="pmeta">' + esc(r.owner) + (r.streak && !st.guillotine ? ' · ' + esc(r.streak) : '') + '</div></td>' +
      (st.guillotine ? '' : '<td class="num">' + esc(r.record) + '</td>') +
      '<td class="num">' + r.pf.toFixed(1) + '</td>' +
      (st.guillotine ? '' : '<td class="num">' + r.pa.toFixed(1) + '</td>') + '</tr>';
  });
  html += '</tbody></table>';
  if (st.playoffTeams) html += '<div class="pmeta small" style="margin-top:6px">Line = playoff cutoff (top ' + st.playoffTeams + '). Ties broken by points for.</div>';
  if (st.guillotine) html += '<div class="pmeta small" style="margin-top:6px">Survivors ranked by total points; 🪓 = eliminated.</div>';
  html += '</div>';

  // Weekly recap
  html += '<div class="card"><h2>Weekly recap</h2>' +
    '<select id="recap-week">' + weeks.map(w => '<option value="' + w + '"' + (w === recapWeek ? ' selected' : '') + '>Week ' + w + (w === currentWk ? ' (in progress)' : '') + '</option>').join('') + '</select>';
  if (!recap) {
    html += '<p class="muted center">Loading…</p>';
  } else if (recap.empty) {
    html += '<p class="pmeta">No games found for week ' + recap.week + '.</p>';
  } else {
    const f = n => Number(n).toFixed(2);
    const item = (icon, title, body) => '<div class="ritem"><div class="ricon">' + icon + '</div><div><div class="rtitle">' + title + '</div><div>' + body + '</div></div></div>';
    html += '<div class="recap">';
    html += item('🔥', 'Top score', esc(recap.high.name) + ' — <b>' + f(recap.high.points) + '</b>');
    if (recap.guillotine) {
      html += item('🪓', 'Chopped', esc(recap.chopped.name) + ' — <b>' + f(recap.chopped.points) + '</b>');
      if (recap.survivedBy) html += item('😅', 'Closest call', esc(recap.survivedBy.name) + ' survived by <b>' + f(recap.survivedBy.points - recap.chopped.points) + '</b>');
    } else {
      const game = g => esc(g.winner.name) + ' <b>' + f(g.winner.points) + '</b> – <b>' + f(g.loser.points) + '</b> ' + esc(g.loser.name);
      if (recap.blowout) html += item('💥', 'Biggest blowout', game(recap.blowout) + ' <span class="pmeta">(by ' + f(recap.blowout.margin) + ')</span>');
      if (recap.closest && recap.closest !== recap.blowout) html += item('😬', 'Closest game', game(recap.closest) + ' <span class="pmeta">(' + (recap.closest.tie ? 'tie' : 'by ' + f(recap.closest.margin)) + ')</span>');
      html += item('🧊', 'Lowest score', esc(recap.low.name) + ' — <b>' + f(recap.low.points) + '</b>');
    }
    if (recap.topStarter) html += item('⭐', 'Player of the week', esc(recap.topStarter.name) + ' <span class="pmeta">(' + esc(recap.topStarter.team) + ')</span> — <b>' + f(recap.topStarter.pts) + '</b>');
    if (recap.topBench) html += item('🪑', 'Best bench performance', esc(recap.topBench.name) + ' scored <b>' + f(recap.topBench.pts) + '</b> on ' + esc(recap.topBench.team) + '\'s bench');
    if (recap.mostLeft) html += item('🤦', 'Most points left on the bench', esc(recap.mostLeft.team) + ' — <b>' + f(recap.mostLeft.pts) + '</b>');
    html += '</div>';
    if (recap.week === currentWk) html += '<div class="alert warn">⚠️ This week isn\'t finished yet — numbers may change.</div>';
    html += '<details class="ptext"><summary>Preview chat text</summary><pre id="recap-text">' + esc(recapText(league, recap)) + '</pre></details>' +
      '<div class="rbtns"><button class="btn" data-recap="copy">📋 Copy recap</button>' +
      (navigator.share ? '<button class="btn alt" data-recap="share">📤 Share…</button>' : '') + '</div>' +
      '<div id="recap-msg" class="pmeta small center"></div>';
  }
  return html + '</div>';
}
