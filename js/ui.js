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
