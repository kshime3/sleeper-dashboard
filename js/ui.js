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
  return '<div class="row' + (worst ? ' flag-' + worst : '') + '"' + (p && p.pos !== '?' ? ' data-pid="' + esc(p.id) + '"' : '') + '>' +
    '<div class="slot ' + esc(slotClass) + '">' + esc(r.label || r.slot) + '</div>' +
    '<div>' + (p
      ? '<div class="pname">' + esc(p.name) + tags + '</div><div class="pmeta">' + esc(p.pos) + ' · ' + esc(p.team || 'no team') + (p.injury ? ' · ' + esc(p.injury) : '') + '</div>' +
        (r.game ? '<div class="gline ' + r.game.state + '">' + (r.game.state === 'in' ? '🟢 ' : r.game.state === 'post' ? '' : '🕐 ') + esc(gameText(r.game)) + '</div>' : '')
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
      html += '<div class="alert ' + a.level + '">' + (a.level === 'bad' ? '⛔ ' : a.level === 'locked' ? '🔒 ' : '⚠️ ') + esc(a.text) +
        (a.swaps.length ? '<div class="swap">Bench option' + (a.swaps.length > 1 ? 's' : '') + ': ' + esc(a.swaps.join(', ')) + '</div>' : '') +
      '</div>';
    }
  }
  if (t.liveNote) html += '<div class="pmeta small" style="margin-top:6px">' + esc(t.liveNote) + '</div>';
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
    html += '<div class="row wrow' + (e.fits.length ? ' fits' : '') + (worst ? ' flag-bad' : '') + '" data-pid="' + esc(p.id) + '">' +
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
    (b.recentPpg != null ? ', recent ' + b.recentPpg.toFixed(1) +
      (b.recentPlayed < b.recentPossible ? ' — played ' + b.recentPlayed + ' of ' + b.recentPossible + ', so recent counts ' + Math.round(b.recentWeight * 100) + '% instead of ' + Math.round(b.fullWeight * 100) + '%' : '')
      : ', no recent games, so season only') + ')' +
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

function trendHtml(b) {
  return trendTags(b).map(t => '<span class="ttag ' + t.kind + '" title="' + esc(t.text) + '">' + esc(t.label) + '</span>').join('');
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
    (trendTags(b).length ? '<div>' + trendHtml(b) + '</div><div class="pmeta small">' + esc(trendTags(b).map(t => t.text).join('; ')) + '</div>' : '') +
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
  const verdictText = cmp.anyTeam && !cmp.get.rows.length
    ? (cmp.give.rows.length ? 'Now pick a trade idea below 👇' : 'Tap your players below to see trade ideas')
    : cmp.verdict.text;
  html += '<div class="verdict ' + cmp.verdict.cls + '">' + esc(verdictText) + '</div>';
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
    '<div><h3>You get</h3>' + (cmp.get.rows.map(tradeCard).join('') || '<div class="pmeta">' + (cmp.anyTeam ? 'Tap "Try it" on an idea, or pick a team above.' : 'Tap their players below.') + '</div>') + '</div></div>';
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
      '<div><div class="pname">' + (on ? '✓ ' : '') + esc(p.name) + tags + trendHtml(b) + '</div><div class="pmeta">' + (b.isPick
        ? (b.from ? 'From ' + esc(b.from) : 'Own pick') + (b.est ? ' · estimate' : '')
        : esc(p.team || 'no team') + (p.age ? ' · ' + p.age + ' yrs' : '') + ' · ' + b.blended.toFixed(1) + '/g') + '</div></div>' +
      '<div class="ppts">' + fmtValue(b) + '<div class="pmeta">value</div></div></button>';
  }).join('') + '</div>';
}

function ideaFilters(t) {
  const f = t.ideaFilter;
  const sel = (key, label, opts) => '<label class="ifilter"><span>' + label + '</span><select data-ifilter="' + key + '">' +
    opts.map(([v, txt]) => '<option value="' + v + '"' + (f[key] === v ? ' selected' : '') + '>' + txt + '</option>').join('') + '</select></label>';
  return '<div class="ifilters' + (t.hasPicks ? ' three' : '') + '">' +
    sel('size', 'Pieces', [['any', 'Any'], ['1', '1 only'], ['2', '2 only']]) +
    sel('pos', 'Position', [['ANY', 'Any']].concat(t.positions.map(p => [p, p]))) +
    (t.hasPicks ? sel('picks', 'Picks', [['any', 'Any'], ['none', 'No picks'], ['only', 'Picks only']]) : '') +
  '</div>';
}

function ideasCard(ideas, t) {
  if (!ideas) {
    return '<div class="card ideas"><h2>💡 Trade ideas</h2><div class="pmeta">Tap one or more of <b>your</b> players below to see players worth about the same, and fair trades that help both teams.</div></div>';
  }
  const val = b => fmtValue(b);
  const who = b => b.isPick
    ? '<span class="slot inline PICK">PICK</span> ' + esc(b.player.name) + (b.from ? ' <span class="pmeta">(' + esc(b.from) + '\'s)</span>' : '')
    : '<span class="slot inline ' + esc(b.player.pos) + '">' + esc(b.player.pos) + '</span> ' + esc(b.player.name);
  let html = '<div class="card ideas"><h2>💡 Trade ideas <span class="pmeta">· you give ' + ideas.V.toFixed(ideas.V % 1 ? 1 : 0) + ' in value</span></h2>' + ideaFilters(t);
  const filtered = t.ideaFilter.size !== 'any' || t.ideaFilter.pos !== 'ANY' || (t.hasPicks && t.ideaFilter.picks !== 'any');
  if (!ideas.ideas.length) {
    html += '<div class="pmeta">' + (filtered
      ? 'No fair trades match these filters. Try loosening them, or add/swap a player you\'re giving.'
      : 'No fair 1- or 2-piece packages found on other teams for this. Try adding or swapping a player.') + '</div>';
  }
  ideas.ideas.forEach((idea, i) => {
    html += '<div class="idea"><div class="idea-top"><div><div class="pmeta">From ' + esc(idea.team.name) + '</div>' +
      '<div class="pname">' + idea.pkg.map(who).join(' + ') + '</div>' +
      '<div class="pmeta">Value ' + idea.pkg.map(val).join(' + ') + (idea.pkg.length > 1 ? ' = ' + idea.value.toFixed(idea.value % 1 ? 1 : 0) : '') +
        ' · ' + (idea.value >= ideas.V ? '+' : '−') + Math.round(idea.off * 100) + '% vs yours</div></div>' +
      '<button class="btn small-btn" data-ttry="idea:' + i + '">Try it</button></div>' +
      (idea.reasons.length ? '<div class="reasons">' + [...new Set(idea.reasons)].map(r => '<span class="reason">' + esc(r) + '</span>').join('') + '</div>' : '') +
    '</div>';
  });
  if (ideas.similar.length) {
    html += '<details class="similar"><summary>Players with similar value (' + ideas.similar.length + ')</summary>';
    ideas.similar.forEach((x, i) => {
      html += '<div class="sim"><div>' + (x.fills ? '⭐ ' : '') + who(x.b) + trendHtml(x.b) + '<div class="pmeta">' + esc(x.team.name) + ' · value ' + val(x.b) + '</div></div>' +
        '<button class="btn alt small-btn" data-ttry="sim:' + i + '">Try</button></div>';
    });
    html += '<div class="pmeta small">⭐ = a position where you\'re in the bottom half of the league.</div></details>';
  }
  return html + '<div class="pmeta small" style="margin-top:8px">Ideas use the values on this tab and each team\'s weak and deep positions (points per game of their starters there). They\'re conversation starters, not guarantees.</div></div>';
}

function renderTradeDynamic(t) {
  const positions = t.positions.concat(t.hasPicks ? ['PICK'] : []);
  const pos = ['ALL'].concat(positions).includes(t.pos) ? t.pos : 'ALL';
  const chip = (val, label) => '<button class="fchip' + (pos === val ? ' on' : '') + '" data-tpos="' + val + '">' + label + '</button>';
  return tradeResult(t.cmp) + ideasCard(t.ideas, t) +
    '<div class="filters">' + chip('ALL', 'All') + positions.map(p => chip(p, p === 'PICK' ? 'Picks' : p)).join('') + '</div>' +
    pickList('Your players', t.myIds, t.values, t.state.give, 'give', pos) +
    (t.oppName ? pickList(t.oppName + '\'s players', t.oppIds, t.values, t.state.get, 'get', pos) : '');
}

function renderTrade(t) {
  if (!t.hasTeam) return '<div class="card">You don\'t have players in this league, so there\'s nothing to trade.</div>';
  const s = t.settings;
  const slider = (key, label, val, help) =>
    '<label class="slider"><div><span>' + label + '</span><b data-tlabel="' + key + '">' + val + '%</b></div>' +
    '<input type="range" min="0" max="100" step="10" value="' + val + '" data-tset="' + key + '">' +
    '<div class="pmeta small">' + help + '</div></label>';
  return '<div class="card"><h2>Trade with</h2><select id="trade-opp">' +
      '<option value="any"' + (t.state.opp === 'any' ? ' selected' : '') + '>Any team (search the whole league)</option>' +
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
      slider('recentWeight', 'Recent weeks vs. season', s.recentWeight, 'How much of the points-per-game blend comes from the last ' + CONFIG.trade.recentWeeks + ' weeks (the rest is the whole season). 0% = season only, 100% = recent only. If he missed some of those games (byes don\'t count), recent counts less: played 1 of 3 = a third as much.') +
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

// ---------- Game Day ----------
function renderGameDay(gd, opts, liveNote) {
  const f = n => Number(n || 0).toFixed(2);
  let html = '<div class="boards">';
  for (const b of gd.scoreboards) {
    let right = '', cls = '';
    if (b.opp) {
      const diff = b.me.points - b.opp.points;
      cls = diff > 0 ? 'lead' : diff < 0 ? 'trail' : '';
      right = '<div class="bopp"><span class="pmeta">vs</span> ' + esc(b.opp.name) + ' <b>' + f(b.opp.points) + '</b><div class="pmeta">' + b.opp.left + ' still to play</div></div>';
    } else if (b.guillotine) {
      const g = b.guillotine;
      cls = g.rank === g.of ? 'trail' : '';
      right = '<div class="bopp">Rank <b>' + g.rank + '</b> of ' + g.of + '<div class="pmeta">lowest gets chopped</div></div>';
    }
    html += '<button class="board" data-goleague="' + esc(b.league.league_id) + '" aria-label="Open ' + esc(b.league.name) + ' on My Team">' +
      '<div class="bleague">' + esc(b.short) + '</div>' +
      '<div class="bme"><b class="' + cls + '">' + f(b.me.points) + '</b><div class="pmeta">' + b.me.left + ' still to play</div></div>' + right +
      '<div class="bgo">›</div></button>';
  }
  html += '</div>';
  if (!gd.scoreboards.length) html += '<div class="card">No active teams this week.</div>';

  html += '<div class="seg"><button data-gdbench="0" class="' + (opts.includeBench ? '' : 'on') + '">Starters</button>' +
    '<button data-gdbench="1" class="' + (opts.includeBench ? 'on' : '') + '">Starters + bench</button></div>';
  if (liveNote) html += '<div class="pmeta small center" style="margin:-4px 0 10px">' + esc(liveNote) + '</div>';

  for (const g of gd.groups) {
    if (!g.rows.length) continue;
    html += '<div class="card"><h2>' + g.title + ' (' + g.rows.length + ')</h2>';
    for (const e of g.rows) {
      const p = e.player;
      const tags = playerFlags(p, null, e.game && e.game.state === 'post')
        .map(fl => '<span class="tag ' + fl.level + '">' + esc(fl.tag) + '</span>').join('');
      const chips = e.leagues.map(l => '<span class="lchip' + (l.starting ? ' start' : '') + '">' + esc(l.short) +
        (l.starting ? '' : ' · bench') + (e.leagues.length > 1 && l.pts != null && (!e.game || e.game.state !== 'pre') ? ' <b>' + Number(l.pts).toFixed(1) + '</b>' : '') + '</span>').join('');
      const best = Math.max(...e.leagues.map(l => l.pts || 0));
      html += '<div class="row gdrow' + (e.startsSomewhere ? '' : ' benchonly') + '" data-pid="' + esc(p.id) + '">' +
        '<div class="slot ' + esc(p.pos) + '">' + esc(p.pos) + '</div>' +
        '<div><div class="pname">' + esc(p.name) + tags + '</div>' +
          (e.game ? '<div class="gline ' + e.game.state + '">' + esc(p.team) + ' ' + esc(gameText(e.game)) + '</div>' : '<div class="gline">' + esc(p.team || 'no team') + '</div>') +
          '<div class="lchips">' + chips + '</div></div>' +
        '<div class="ppts">' + (e.game && e.game.state !== 'pre' ? best.toFixed(1) : '') + '</div>' +
      '</div>';
    }
    html += '</div>';
  }
  return html;
}

// ---------- Player details panel ----------
function renderJourney(j) {
  if (!j) return '';
  let html = '<h3 class="sheet-h">His journey in ' + esc(j.league.name) + '</h3>';
  if (!j.events) {
    return html + '<div class="pmeta small">Every draft, trade, waiver claim and drop for him in this league, from its first season on Sleeper.</div>' +
      '<p><button class="btn small-btn" data-jload' + (j.loading ? ' disabled' : '') + '>' + esc(j.loading || 'Load history') + '</button></p>' +
      (j.error ? '<div class="pmeta trail">' + esc(j.error) + '</div>' : '');
  }
  const icon = { draft: '🎓', trade: '🔁', waiver: '📥', free_agent: '🆓', drop: '🗑️', commissioner: '🛠️' };
  if (!j.events.length) html += '<div class="pmeta">No drafts or moves for him in this league yet.</div>';
  html += '<div class="journey">' + j.events.map(ev =>
    '<div class="jstep"><div class="jicon">' + (icon[ev.kind] || '•') + '</div><div><div>' + esc(ev.text) + '</div>' +
    '<div class="pmeta small">' + esc(ev.date ? fmtDate(ev.date) : ev.season) + '</div></div></div>').join('');
  const o = j.now;
  const now = !o ? '' : o.status === 'free' ? 'Free agent' : o.status === 'taken' ? 'On ' + o.ownerName : 'On your team' + (o.status === 'starting' ? ' (starting)' : o.status === 'ir' ? ' (IR)' : ' (bench)');
  if (now) html += '<div class="jstep now"><div class="jicon">📍</div><div><b>Now:</b> ' + esc(now) + '</div></div>';
  return html + '</div>';
}

function renderPlayerSheet(pd) {
  if (!pd) return '<div class="pmeta">Player not found.</div>';
  const p = pd.player;
  const tags = playerFlags(p, null, false).map(f => '<span class="tag ' + f.level + '">' + esc(f.tag) + '</span>').join('');
  const facts = [p.pos + (p.depth ? ' (' + p.depth + ' on the depth chart)' : ''), p.team || 'No NFL team',
    p.number ? '#' + p.number : '', p.age ? 'Age ' + p.age : '', p.exp != null ? (p.exp === 0 ? 'Rookie' : p.exp + (p.exp === 1 ? ' year' : ' years') + ' in the NFL') : '']
    .filter(Boolean).map(esc).join(' · ');
  let html = '<div class="sheet-head"><div class="slot ' + esc(p.pos) + '">' + esc(p.pos) + '</div>' +
    '<div><div class="sheet-name">' + esc(p.name) + tags + '</div><div class="pmeta">' + facts + '</div></div>' +
    '<button class="icon-btn" data-sheet-close aria-label="Close">✕</button></div>';

  if (p.injury) {
    html += '<div class="alert ' + ((CONFIG.injuries[p.injury] || {}).level || 'warn') + '"><b>' + esc(p.injury) + '</b>' +
      (p.bodyPart ? ' — ' + esc(p.bodyPart) : '') + (p.injuryNotes ? '<div class="small">' + esc(p.injuryNotes) + '</div>' : '') + '</div>';
  }

  html += '<h3 class="sheet-h">This week</h3><div class="' + (pd.game ? 'gline ' + pd.game.state : 'pmeta') + ' sheet-game">' +
    (pd.game ? (pd.game.state === 'in' ? '🟢 ' : pd.game.state === 'pre' ? '🕐 ' : '') + esc(p.team + ' ' + gameText(pd.game)) : 'No game this week (bye)') + '</div>';

  if (pd.stats) {
    const s = pd.stats;
    html += '<h3 class="sheet-h">Points <span class="pmeta">(' + esc(s.leagueName) + ' scoring)</span></h3>' +
      '<div class="sheet-stats">' +
        '<div><b>' + s.season.total.toFixed(1) + '</b><span>season</span></div>' +
        '<div><b>' + s.season.ppg.toFixed(1) + '</b><span>per game (' + s.season.games + ' g)</span></div>' +
        s.recent.map(r => '<div><b>' + (r.pts == null ? '–' : r.pts.toFixed(1)) + '</b><span>week ' + r.week + '</span></div>').join('') +
      '</div>';
  }

  html += '<h3 class="sheet-h">Your leagues</h3>';
  for (const o of pd.ownership) {
    const what = o.status === 'starting' ? '<span class="lead">Your starter</span>'
      : o.status === 'bench' ? 'On your bench'
      : o.status === 'ir' ? 'On your IR'
      : o.status === 'free' ? '<span class="lead">Free agent — you could add him</span>'
      : 'On ' + esc(o.ownerName);
    html += '<div class="own"><span class="lchip' + (o.status === 'starting' || o.status === 'bench' || o.status === 'ir' ? ' start' : '') + '">' + esc(o.short) + '</span> ' + what +
      (o.pts != null && pd.game && pd.game.state !== 'pre' ? ' <span class="pmeta">· ' + Number(o.pts).toFixed(1) + ' pts this week</span>' : '') + '</div>';
  }
  html += renderJourney(pd.journey);
  return html;
}

// ---------- League history (bottom of Standings) ----------
function fmtDate(ms) {
  return ms ? new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function histPlayer(p) {
  return '<span class="hp" data-pid="' + esc(p.id) + '">' + (p.pos ? '<span class="slot inline ' + esc(p.pos) + '">' + esc(p.pos) + '</span> ' : '') + esc(p.name) + '</span>';
}

function renderHistoryList(h, st) {
  const list = filterHistory(h, st.view, Object.assign({}, st.f, { hind: st.hind }));
  const shown = list.slice(0, st.limit);
  let html = '';
  if (st.view === 'trades' && !st.hind) {
    html += '<div class="hind-cta"><div class="pmeta small">See which side came out ahead: points each team got from what it received, in its starting lineup, since the trade.</div>' +
      '<button class="btn small-btn" data-rload' + (st.recLoading ? ' disabled' : '') + '>' + esc(st.recLoading || '📈 Show how trades turned out') + '</button>' +
      (st.recError ? '<div class="pmeta trail">' + esc(st.recError) + '</div>' : '') + '</div>';
  }
  html += '<div class="pmeta small hcount">' + list.length + (st.view === 'trades' ? ' trade' : ' transaction') + (list.length === 1 ? '' : 's') + '</div>';
  if (!list.length) html += '<div class="pmeta">Nothing matches these filters.</div>';
  for (const x of shown) {
    // Sleeper files offseason moves under week 1; anything dated before September is offseason.
    const offseason = !x.week || (x.date && new Date(x.date) < new Date(Number(x.season), 8, 1));
    const when = fmtDate(x.date) + ' · ' + x.season + (offseason ? ' offseason' : ' wk ' + x.week);
    if (st.view === 'trades') {
      const me = app.me && app.me.user.user_id;
      const hs = st.hind && st.hind[x.id];
      const ptsFor = (sd, pid) => {
        if (!hs || !pid) return '';
        const s2 = hs.sides.find(z => z.rid === sd.team.rid);
        return s2 && s2.per[pid] != null ? ' <span class="hpts">' + s2.per[pid].toFixed(1) + ' pts</span>' : '';
      };
      const sideTotal = sd => {
        if (!hs) return '';
        const s2 = hs.sides.find(z => z.rid === sd.team.rid);
        const won = hs.verdict.winnerRid === sd.team.rid;
        return s2 ? ' <span class="htotal' + (won ? ' won' : '') + '">' + (won ? '🏅 ' : '') + s2.total.toFixed(1) + ' pts</span>' : '';
      };
      const side = sd => {
        const mine = sd.team.owner && sd.team.owner === me;
        const items = sd.players.map(p => '<div class="hrow">' + histPlayer(p) + ptsFor(sd, p.id) + '</div>')
          .concat(sd.picks.map(pk => '<div class="hrow"><span class="slot inline PICK">PICK</span> ' + esc(pk.label) +
            (pk.from ? '<div class="pmeta small hfrom">originally ' + esc(pk.from) + '\'s</div>' : '') +
            (pk.became
              ? '<div class="hbecame">→ became ' + (pk.became.id ? histPlayer(pk.became) : esc(pk.became.name)) + ' <span class="pmeta small">(pick ' + esc(pk.became.pick) +
                  (pk.became.by ? ', drafted by ' + esc(pk.became.by) : '') + ')</span>' + ptsFor(sd, pk.became.id) + '</div>'
              : pk.notYet ? '<div class="pmeta small hfrom">→ not drafted yet</div>' : '') + '</div>'))
          .concat(sd.faab ? ['<div class="hrow">💰 $' + sd.faab + ' FAAB</div>'] : []);
        return '<div class="hblock' + (mine ? ' mine' : '') + '"><div class="hhead">' + esc(sd.team.name) + (mine ? ' <span class="pmeta">(you)</span>' : '') + ' receives' + sideTotal(sd) + '</div>' +
          (items.join('') || '<div class="pmeta">nothing</div>') + '</div>';
      };
      html += '<div class="hitem"><div class="pmeta small">🔁 Trade · ' + esc(when) + '</div>' +
        (hs ? '<div class="hverdict ' + hs.verdict.kind + '">' + (hs.verdict.kind === 'early' ? '⏳ Too early to tell (' + hs.weeksSince + ' week' + (hs.weeksSince === 1 ? '' : 's') + ' played since)'
          : hs.verdict.kind === 'none' ? '⏳ Neither side has scored in a starting lineup yet'
          : hs.verdict.kind === 'even' ? '⚖️ Even so far (' + hs.diff.toFixed(1) + ' pts apart)'
          : '📈 So far: <b>' + esc((x.sides.find(z => z.team.rid === hs.verdict.winnerRid) || { team: { name: '?' } }).team.name) + ' +' + hs.diff.toFixed(1) + ' pts</b>') + '</div>' : '') +
        x.sides.map(side).join('<div class="hswap">⇅</div>') + '</div>';
    } else {
      const icon = x.type === 'waiver' ? (x.status === 'complete' ? '📥' : '❌') : x.type === 'free_agent' ? '🆓' : '🛠️';
      const what = x.type === 'waiver' ? (x.status === 'complete' ? 'Waiver claim' : 'Failed waiver bid') : x.type === 'free_agent' ? 'Free agent' : 'Commissioner';
      html += '<div class="hitem' + (x.status !== 'complete' ? ' failed' : '') + '"><div class="pmeta small">' + icon + ' ' + esc(what) + (x.bid != null && x.type === 'waiver' ? ' · $' + x.bid : '') + ' · ' + esc(when) + '</div>' +
        '<div class="hteam">' + esc(x.team.name) + '</div>' +
        (x.adds.length ? '<div class="hmove"><span class="lead">+ </span>' + x.adds.map(histPlayer).join('') + '</div>' : '') +
        (x.drops.length ? '<div class="hmove"><span class="trail">− </span>' + x.drops.map(histPlayer).join('') + '</div>' : '') + '</div>';
    }
  }
  if (list.length > shown.length) html += '<button class="btn alt small-btn hmore" data-hmore>Show more (' + (list.length - shown.length) + ' left)</button>';
  return html;
}

function renderHistory(st) {
  let html = '<div class="card" id="history"><h2>📜 League history</h2>';
  if (!st.hist) {
    return html + '<div class="pmeta">Every trade, waiver claim and free-agent move in this league, back to its first season on Sleeper.</div>' +
      '<p><button class="btn" data-hload' + (st.loading ? ' disabled' : '') + '>' + (st.loading ? esc(st.loading) : 'Load history') + '</button></p>' +
      (st.error ? '<div class="pmeta trail">' + esc(st.error) + '</div>' : '') + '</div>';
  }
  const h = st.hist;
  const f = st.f;
  const sel = (key, opts) => '<select data-hfilter="' + key + '">' + opts.map(([v, t]) => '<option value="' + esc(v) + '"' + (String(f[key]) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>';
  html += '<div class="pmeta small">' + h.seasons.length + ' seasons (' + h.first + '–' + h.last + ') · ' + h.trades.length + ' trades · ' + h.moves.filter(m => m.status === 'complete').length + ' transactions</div>' +
    '<div class="seg three"><button data-hview="trades" class="' + (st.view === 'trades' ? 'on' : '') + '">🔁 Trades</button>' +
    '<button data-hview="moves" class="' + (st.view === 'moves' ? 'on' : '') + '">📥 Moves</button>' +
    '<button data-hview="records" class="' + (st.view === 'records' ? 'on' : '') + '">🏅 Records</button></div>';
  if (st.view === 'records') return html + renderRecords(st) + '</div>';
  html += '<div class="hfilters">' +
      sel('season', [['all', 'All seasons']].concat(h.seasons.map(s => [s, s]))) +
      sel('team', [['all', 'All teams']].concat(Object.entries(h.managers).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => [id, n]))) +
      (st.view === 'moves' ? sel('type', [['all', 'All types'], ['waiver', 'Waiver claims'], ['free_agent', 'Free agents'], ['commissioner', 'Commissioner']]) : '') +
      (st.view === 'trades' && st.hind ? sel('sort', [['newest', 'Newest first'], ['lopsided', 'Most lopsided first']]) : '') +
      '<input type="search" data-hfilter="q" placeholder="Search a player…" value="' + esc(f.q) + '">' +
      (st.view === 'moves' ? '<label class="hcheck"><input type="checkbox" data-hfilter="failed"' + (f.failed ? ' checked' : '') + '> Show failed waiver bids</label>' : '') +
    '</div><div id="hist-list">' + renderHistoryList(h, st) + '</div>';
  return html + '</div>';
}

// ---------- League records (History card, 🏅 Records view) ----------
function renderRecords(st) {
  if (!st.records) {
    return '<div class="pmeta">Champions, all-time records and the best (and worst) games in league history.</div>' +
      '<p><button class="btn" data-rload' + (st.recLoading ? ' disabled' : '') + '>' + esc(st.recLoading || 'Load records') + '</button></p>' +
      (st.recError ? '<div class="pmeta trail">' + esc(st.recError) + '</div>' : '');
  }
  const r = st.records, me = app.me && app.me.user.user_id;
  const f2 = n => Number(n).toFixed(2), f1 = n => Number(n).toFixed(1);
  const when = g => g.season + ' wk ' + g.week + (g.playoff ? ' · playoffs' : '');
  const youCls = t => t && t.owner === me ? ' you' : '';
  const list = (title, rows) => '<h3 class="rec-h">' + title + '</h3><ol class="rec-list">' + rows.join('') + '</ol>';
  let html = '';

  // Champions
  html += '<h3 class="rec-h">🏆 Champions</h3><div class="champs">' + r.champions.map(c =>
    '<div class="champ' + youCls(c.champ) + '"><b>' + esc(c.season) + '</b><div>' +
    (c.champ ? '🏆 ' + esc(c.champ.name) + '<div class="pmeta small">beat ' + esc(c.runnerUp.name) + ' in the final</div>'
      : '<span class="pmeta">' + (c.inProgress ? 'In progress' : 'No playoff bracket') + '</span>') + '</div></div>').join('') + '</div>';

  // All-time managers
  html += '<h3 class="rec-h">📊 All-time</h3><div class="mgrs">' + r.managers.map((m, i) =>
    '<div class="mgr' + (m.owner === me ? ' you' : '') + '"><div class="mgr-top"><span class="mgr-rank">' + (i + 1) + '</span><b>' + esc(m.name) + '</b>' +
      (m.titles ? ' <span class="mgr-titles">' + '🏆'.repeat(Math.min(m.titles, 5)) + '</span>' : '') + '</div>' +
    '<div class="mgr-stats"><span><b>' + m.w + '-' + m.l + (m.t ? '-' + m.t : '') + '</b> (' + (m.pct * 100).toFixed(0) + '%)</span>' +
      '<span>Finals <b>' + m.finals + '</b></span><span>Playoffs <b>' + m.playoffs + '</b>/' + m.seasons + '</span>' +
      '<span><b>' + Math.round(m.pf).toLocaleString() + '</b> pts</span></div></div>').join('') +
    '</div><div class="pmeta small">Ranked by titles, then win %. Records are regular season; the current season counts so far.</div>';

  // Single games
  html += list('🔥 Highest scores', r.highest.map(g => '<li class="' + youCls(g.team) + '"><b>' + f2(g.pts) + '</b> ' + esc(g.team.name) + ' <span class="pmeta">' + esc(when(g)) + '</span></li>'));
  html += list('🧊 Lowest scores', r.lowest.map(g => '<li class="' + youCls(g.team) + '"><b>' + f2(g.pts) + '</b> ' + esc(g.team.name) + ' <span class="pmeta">' + esc(when(g)) + '</span></li>'));
  html += list('💥 Biggest blowouts', r.blowouts.map(g => '<li class="' + youCls(g.winner.team) + '"><b>+' + f2(g.margin) + '</b> ' + esc(g.winner.team.name) + ' ' + f2(g.winner.pts) + ' – ' + f2(g.loser.pts) + ' ' + esc(g.loser.team.name) + ' <span class="pmeta">' + esc(when(g)) + '</span></li>'));
  html += list('😬 Closest games', r.closest.map(g => '<li class="' + youCls(g.winner.team) + '"><b>' + f2(g.margin) + '</b> ' + esc(g.winner.team.name) + ' ' + f2(g.winner.pts) + ' – ' + f2(g.loser.pts) + ' ' + esc(g.loser.team.name) + ' <span class="pmeta">' + esc(when(g)) + '</span></li>'));
  html += list('⭐ Best player games', r.playerBest.map(g => '<li class="' + youCls(g.team) + '"><b>' + f2(g.pts) + '</b> ' + histPlayer(g.player) + ' <span class="pmeta">for ' + esc(g.team.name) + ' · ' + esc(when(g)) + '</span></li>'));

  // Seasons
  html += list('📈 Most points in a season', r.seasonPoints.map(x => '<li class="' + youCls(x.team) + '"><b>' + f1(x.pf) + '</b> ' + esc(x.team.name) + ' <span class="pmeta">' + esc(x.season) + ' · ' + x.w + '-' + x.l + '</span></li>'));
  html += list('🥇 Best regular-season records', r.seasonRecord.map(x => '<li class="' + youCls(x.team) + '"><b>' + x.w + '-' + x.l + (x.t ? '-' + x.t : '') + '</b> ' + esc(x.team.name) + ' <span class="pmeta">' + esc(x.season) + ' · ' + f1(x.pf) + ' pts</span></li>'));
  return html + '<div class="pmeta small" style="margin-top:10px">Team names are each manager\'s current name. Your rows are highlighted.</div>';
}
