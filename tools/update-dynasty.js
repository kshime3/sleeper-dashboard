// Updates data/dynasty-values.json from the FantasyPros monthly Dynasty Trade Value Chart.
// Runs on GitHub's computers once a day (see .github/workflows/dynasty-values.yml), or by hand:
//   node tools/update-dynasty.js            (writes the file only if the values changed)
//   node tools/update-dynasty.js 2026-11-15 (pretend today is that date, for testing)
//
// How it finds the article: it tries this month's article first (e.g. "...-november-2026-update/"),
// and if that isn't published yet, last month's. The player values live in 4 Datawrapper charts
// (QB, RB, WR, TE) embedded in the article; the rookie pick values are tables in the article itself.
// Players are matched to Sleeper IDs by name and position (team breaks ties).
// Values © FantasyPros — credited in the app with a link to the article.

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'dynasty-values.json');
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const UA = { 'User-Agent': 'Mozilla/5.0 (sleeper-dashboard monthly updater; personal use)' };

async function get(url) {
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  return { ok: res.ok, status: res.status, url: res.url, text: res.ok ? await res.text() : '' };
}

function articleUrls(year, monthIndex) {
  const slug = 'fantasy-football-rankings-dynasty-trade-value-chart-' + MONTHS[monthIndex] + '-' + year + '-update/';
  const mm = n => String(n + 1).padStart(2, '0');
  // Usually published in its own month, but sometimes a day or two early (in the month before).
  const prev = monthIndex === 0 ? { y: year - 1, m: 11 } : { y: year, m: monthIndex - 1 };
  return [
    'https://www.fantasypros.com/' + year + '/' + mm(monthIndex) + '/' + slug,
    'https://www.fantasypros.com/' + prev.y + '/' + mm(prev.m) + '/' + slug,
  ];
}

async function findArticle(today) {
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  const tries = [{ y, m }, m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }];
  for (const t of tries) {
    for (const url of articleUrls(t.y, t.m)) {
      const r = await get(url);
      console.log(r.status, url);
      if (r.ok && r.text.includes('datawrapper')) {
        return { url, html: r.text, month: MONTHS[t.m][0].toUpperCase() + MONTHS[t.m].slice(1) + ' ' + t.y };
      }
    }
  }
  throw new Error('Could not find this month\'s or last month\'s FantasyPros dynasty trade value article.');
}

const decode = s => s.replace(/<[^>]+>/g, '').replace(/&#0?38;|&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’')
  .replace(/&#8211;|&ndash;/g, '–').replace(/&nbsp;/g, ' ').replace(/&#039;|&#39;/g, "'").trim();

// The 4 position charts: each <h3> heading is followed by a Datawrapper iframe.
function chartLinks(html) {
  const out = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>|<iframe[^>]*src="(https:\/\/datawrapper\.dwcdn\.net\/[^"]+)"/g;
  let heading = '', m;
  while ((m = re.exec(html))) {
    if (m[1] != null) { heading = decode(m[1]); continue; }
    const pos = /quarterback/i.test(heading) ? 'QB' : /running back/i.test(heading) ? 'RB'
      : /wide receiver/i.test(heading) ? 'WR' : /tight end/i.test(heading) ? 'TE' : null;
    if (pos) out.push({ pos, url: m[2].endsWith('/') ? m[2] : m[2] + '/' });
  }
  return out;
}

// Datawrapper charts get republished (…/1/ forwards to …/2/); follow that to the newest data.
async function chartData(url) {
  for (let hops = 0; hops < 5; hops++) {
    const page = await get(url);
    const fwd = page.text.match(/http-equiv="REFRESH" content="0; url=([^"]+)"/i);
    if (fwd && page.text.length < 2000) { url = fwd[1]; continue; }
    break;
  }
  const csv = await get(url + 'dataset.csv');
  if (!csv.ok) throw new Error('Chart data missing: ' + url);
  const lines = csv.text.trim().split(/\r?\n/).map(l => l.split('\t'));
  const head = lines.shift();
  return lines.map(cols => Object.fromEntries(head.map((h, i) => [h.trim(), (cols[i] || '').trim()])));
}

// Rookie draft pick tables ("2027 Dynasty Rookie Draft Pick Values": Pick | 1QB | SF).
function pickTables(html) {
  const out = [];
  const re = /(20\d\d) Dynasty Rookie Draft Pick Values[\s\S]*?(<table[\s\S]*?<\/table>)/g;
  let m;
  while ((m = re.exec(html))) {
    const rows = [...m[2].matchAll(/<tr[\s\S]*?<\/tr>/g)].map(r => [...r[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map(c => decode(c[0])));
    out.push({ year: m[1], rows: rows.slice(1).filter(r => r.length >= 3).map(r => ({ pick: r[0], v: +r[1] || 0, sf: +r[2] || 0 })) });
  }
  return out;
}

const norm = n => n.toLowerCase().replace(/[.'’]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/[^a-z]/g, '');
const TEAM_FIX = { JAC: 'JAX', WSH: 'WAS', LA: 'LAR' };

async function main() {
  const today = process.argv[2] ? new Date(process.argv[2] + 'T12:00:00Z') : new Date();
  const article = await findArticle(today);
  const charts = chartLinks(article.html);
  if (charts.length < 4) throw new Error('Expected 4 position charts, found ' + charts.length);

  const sleeper = await (await fetch('https://api.sleeper.app/v1/players/nfl')).json();
  const index = {};
  for (const id in sleeper) {
    const p = sleeper[id];
    if (!p.active && !p.team) continue;
    for (const pos of new Set([p.position].concat(p.fantasy_positions || []))) {
      (index[norm(p.full_name || '') + '|' + pos] = index[norm(p.full_name || '') + '|' + pos] || []).push({ id, team: p.team });
    }
  }

  const players = {}, others = {}, unmatched = [];
  for (const c of charts) {
    for (const r of await chartData(c.url)) {
      const value = +r['Trade Value'] || 0;
      const sf = r['SF Value'] ? +r['SF Value'] : undefined;
      const tep = r['TEP Value'] ? +r['TEP Value'] : undefined;
      if (/^all other/i.test(r.Name)) { others[c.pos] = { v: value, sf, tep }; continue; }
      let found = index[norm(r.Name) + '|' + c.pos] || [];
      if (found.length > 1) found = found.filter(f => f.team === (TEAM_FIX[r.Team] || r.Team));
      if (found.length !== 1) { unmatched.push(r.Name + ' (' + c.pos + ', ' + r.Team + ')'); continue; }
      players[found[0].id] = { n: r.Name, pos: c.pos, v: value, sf, tep, chg: r['Value Change'] || '' };
    }
  }
  const count = Object.keys(players).length;
  if (count < 150) throw new Error('Only matched ' + count + ' players — the page layout may have changed.');

  const data = {
    source: { name: 'FantasyPros Dynasty Trade Value Chart', month: article.month, url: article.url, credit: 'Values © FantasyPros' },
    players, others, picks: pickTables(article.html), unmatched,
  };
  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const next = JSON.stringify(data, null, 0) + '\n';
  if (old === next) { console.log('No change (' + article.month + ', ' + count + ' players).'); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, next);
  console.log('Updated: ' + article.month + ', ' + count + ' players matched, ' + unmatched.length + ' unmatched' + (unmatched.length ? ': ' + unmatched.join(', ') : '') + '.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
