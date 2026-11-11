// Coverage history: one JSON line per measured commit, and a single HTML page drawn from them.
//   tsx coverage/history.ts append --history <file.jsonl> --coverage coverage-report/coverage.json --sha <sha> ...
//   tsx coverage/history.ts render --history <file.jsonl> --out <file.html>
// CI runs both on every push to main (.github/workflows/qa-coverage-history.yml).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { CoverageReport, Ratio } from './core';

export interface HistoryRow {
  date: string;
  sha: string;
  label: string;
  tests: number | null;
  testsFailed: boolean;
  operations: Ratio;
  statuses: Ratio;
  parameters: Ratio;
  requestBodies: Ratio;
}

/** "Merge pull request #3 from x/y\n\nTitle" becomes "#3 Title"; otherwise the first line. */
export function labelFromCommitMessage(message: string): string {
  const lines = message.split('\n').map((l) => l.trim()).filter(Boolean);
  const merge = /^Merge pull request #(\d+)/.exec(lines[0] ?? '');
  if (merge) return `#${merge[1]} ${lines[1] ?? 'merged'}`;
  return lines[0] ?? '(no message)';
}

export function readHistory(file: string): HistoryRow[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as HistoryRow);
}

/** Adds the row, replacing an earlier measurement of the same commit, and keeps the file in date order. */
export function upsert(rows: HistoryRow[], row: HistoryRow): HistoryRow[] {
  return [...rows.filter((r) => r.sha !== row.sha), row].sort((a, b) => a.date.localeCompare(b.date));
}

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The page. `fragment` leaves out the document wrapper, for hosts that add their own.
 * Colors are the validated categorical palette also used by the PR report's sibling page.
 */
export function renderPage(rows: HistoryRow[], opts: { repo?: string; fragment?: boolean; generatedAt: string }): string {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const span = (pick: (r: HistoryRow) => string) => (first && last ? `${pick(first)} → ${pick(last)}` : 'n/a');
  const ofTotal = (k: 'operations' | 'statuses' | 'parameters' | 'requestBodies') =>
    first && last ? `${first[k].covered} → ${last[k].covered} of ${last[k].total}` : 'n/a';

  const head = `<title>GAD Coverage Evolution</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap">
<style>
  /* Layout: one column, start-to-end figures, then the chart, then the same data as a table. */
  :root {
    --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
    --grid: #e1e0d9; --axis: #c3c2b7; --up: #006300; --down: #d03b3b;
    --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100;
    --display: "Space Grotesk", "Segoe UI", system-ui, sans-serif;
    --body: Inter, "Segoe UI", system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
      --grid: #2c2c2a; --axis: #383835; --up: #0ca30c; --down: #e66767;
      --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --up: #0ca30c; --down: #e66767;
    --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; color-scheme: dark;
  }
  body {
    margin: 0; background: var(--page); color: var(--ink); font: 15px/1.55 var(--body);
    padding-block: 32px 56px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
  main { max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }
  h1 { font: 600 28px/1.2 var(--display); margin: 0; text-wrap: balance; }
  h2 { font: 600 17px/1.3 var(--display); margin: 0 0 10px; }
  p { margin: 0; max-width: 68ch; }
  a { color: inherit; }
  .lede { color: var(--ink-2); margin-top: 8px; }
  .headline { display: flex; flex-wrap: wrap; gap: 8px 32px; }
  .headline div { min-width: 0; }
  .headline b { font: 600 22px/1.2 var(--display); font-variant-numeric: tabular-nums; display: block; }
  .headline span { color: var(--ink-2); font-size: 13px; }
  .panel { background: var(--surface); border: 1px solid var(--grid); border-radius: 8px; padding: 16px; min-width: 0; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--ink-2); margin-bottom: 8px; }
  .legend i { display: inline-block; width: 14px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 6px; }
  .scroll { overflow-x: auto; }
  #chartwrap { position: relative; min-width: 620px; }
  svg { display: block; width: 100%; height: auto; }
  svg text { font: 12px var(--body); fill: var(--muted); font-variant-numeric: tabular-nums; }
  svg text.endlabel { fill: var(--ink); font-weight: 500; }
  #tip {
    position: absolute; pointer-events: none; background: var(--surface); color: var(--ink);
    border: 1px solid var(--axis); border-radius: 6px; padding: 8px 10px; font-size: 12.5px; line-height: 1.5;
    box-shadow: 0 4px 14px rgba(0,0,0,.18); min-width: 200px; max-width: 320px; font-variant-numeric: tabular-nums;
  }
  #tip strong { display: block; margin-bottom: 2px; }
  #tip .row { display: flex; justify-content: space-between; gap: 16px; }
  #tip .row i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; white-space: nowrap; }
  td.what { white-space: normal; min-width: 220px; }
  thead th { color: var(--ink-2); font-weight: 600; font-size: 12.5px; }
  td small, .muted { color: var(--muted); }
  .up { color: var(--up); } .down { color: var(--down); }
  .failed { color: var(--down); font-weight: 600; }
</style>`;

  const body = `<main>
  <header>
    <h1>GAD API spec coverage over time</h1>
    <p class="lede">Share of the OpenAPI spec exercised by the <code>qa/</code> Playwright suite, measured on each commit to <code>main</code>. ${rows.length} measurement${rows.length === 1 ? '' : 's'}; page generated ${esc(opts.generatedAt)}.</p>
  </header>

  <section class="headline" aria-label="First and latest measurement">
    <div><b>${esc(span((r) => (r.tests === null ? '?' : String(r.tests))))}</b><span>tests</span></div>
    <div><b>${esc(ofTotal('operations'))}</b><span>operations</span></div>
    <div><b>${esc(ofTotal('statuses'))}</b><span>status codes</span></div>
    <div><b>${esc(ofTotal('parameters'))}</b><span>parameters</span></div>
    <div><b>${esc(ofTotal('requestBodies'))}</b><span>request bodies</span></div>
  </section>

  <section class="panel">
    <h2>Percent of the spec covered</h2>
    <div class="legend" id="legend"></div>
    <div class="scroll"><div id="chartwrap"><svg id="chart" viewBox="0 0 800 360" role="img" aria-label="Line chart of coverage percentage per measured commit for operations, status codes, parameters and request bodies. The same numbers are in the table below."></svg><div id="tip" hidden></div></div></div>
  </section>

  <section class="panel">
    <h2>Every measurement, newest first</h2>
    <div class="scroll"><table>
      <thead><tr><th>Date</th><th>Commit</th><th>Tests</th><th>Operations</th><th>Status codes</th><th>Parameters</th><th>Request bodies</th><th>Change</th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>
  </section>
</main>

<script>
  const rows = ${JSON.stringify(rows).replace(/</g, '\\u003c')};
  const repo = ${JSON.stringify(opts.repo ?? '')};
  const series = [
    { key: 'operations',    name: 'Operations',     color: 'var(--s1)' },
    { key: 'statuses',      name: 'Status codes',   color: 'var(--s2)' },
    { key: 'parameters',    name: 'Parameters',     color: 'var(--s3)' },
    { key: 'requestBodies', name: 'Request bodies', color: 'var(--s4)' },
  ];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const day = (iso) => iso.slice(0, 10);
  const cellText = (r) => r.covered + ' / ' + r.total + ' <small>(' + r.percent.toFixed(1) + '%)</small>';

  // ---- table, newest first; deltas compare covered/total with the previous measurement ----
  document.getElementById('rows').innerHTML = rows.map((r, i) => {
    const prev = rows[i - 1];
    const cell = (k) => {
      let d = '';
      if (prev) {
        const diff = r[k].covered / r[k].total - prev[k].covered / prev[k].total;
        const pp = Math.abs(diff * 100);
        if (diff !== 0) d = ' <span class="' + (diff > 0 ? 'up' : 'down') + '">' + (diff > 0 ? '+' : '−') + (pp < 0.05 ? '<0.1' : pp.toFixed(1)) + '</span>';
      }
      return '<td>' + cellText(r[k]) + d + '</td>';
    };
    const sha = repo ? '<a href="https://github.com/' + repo + '/commit/' + r.sha + '"><code>' + r.sha.slice(0, 7) + '</code></a>' : '<code>' + r.sha.slice(0, 7) + '</code>';
    const tests = (r.tests === null ? '<span class="muted">n/a</span>' : r.tests) + (r.testsFailed ? ' <span class="failed">failed</span>' : '');
    return '<tr><th scope="row">' + day(r.date) + '</th><td>' + sha + '</td><td>' + tests + '</td>' + series.map((s) => cell(s.key)).join('') + '<td class="what">' + esc(r.label) + '</td></tr>';
  }).reverse().join('');

  // ---- legend ----
  document.getElementById('legend').innerHTML = series.map((s) => '<span><i style="background:' + s.color + '"></i>' + s.name + '</span>').join('');

  // ---- chart: one y axis (percent), measurements evenly spaced in order ----
  const W = 800, H = 360, M = { l: 44, r: 150, t: 16, b: 34 };
  const peak = Math.max(0, ...rows.flatMap((r) => series.map((s) => r[s.key].percent)));
  const YMAX = Math.min(100, Math.max(30, Math.ceil((peak + 3) / 10) * 10));
  const n = rows.length;
  const x = (i) => (n === 1 ? (M.l + W - M.r) / 2 : M.l + (i * (W - M.l - M.r)) / (n - 1));
  const y = (v) => M.t + (1 - v / YMAX) * (H - M.t - M.b);
  let svg = '';
  for (let v = 0; v <= YMAX; v += YMAX > 50 ? 20 : 10) {
    svg += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + (v === 0 ? 'var(--axis)' : 'var(--grid)') + '" stroke-width="1"/>';
    svg += '<text x="' + (M.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '%</text>';
  }
  // at most ~7 x labels, always including the first and the last measurement
  const every = Math.max(1, Math.ceil(n / 7));
  rows.forEach((r, i) => {
    if (i % every === 0 || i === n - 1) {
      if (i !== n - 1 && n - 1 - i < every / 2) return;
      svg += '<text x="' + x(i) + '" y="' + (H - M.b + 20) + '" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '">' + (i + 1) + ' · ' + day(r.date).slice(5) + '</text>';
    }
  });
  svg += '<line id="cross" x1="0" x2="0" y1="' + M.t + '" y2="' + (H - M.b) + '" stroke="var(--axis)" stroke-width="1" visibility="hidden"/>';
  const dots = n <= 40;
  series.forEach((s) => {
    const pts = rows.map((r, i) => x(i).toFixed(1) + ',' + y(r[s.key].percent).toFixed(1));
    svg += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    rows.forEach((r, i) => {
      if (dots || i === n - 1) svg += '<circle cx="' + x(i) + '" cy="' + y(r[s.key].percent) + '" r="' + (i === n - 1 ? 4.5 : 3) + '" fill="' + s.color + '" stroke="var(--surface)" stroke-width="2"/>';
    });
  });
  if (n > 0) {
    // direct end labels, pushed apart so they never overlap
    const last = rows[n - 1];
    const labels = series.map((s) => ({ s, v: last[s.key].percent, yy: y(last[s.key].percent) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < labels.length; i++) if (labels[i].yy - labels[i - 1].yy < 16) labels[i].yy = labels[i - 1].yy + 16;
    labels.forEach((l) => { svg += '<text class="endlabel" x="' + (x(n - 1) + 12) + '" y="' + (l.yy + 4) + '">' + l.s.name + ' ' + l.v.toFixed(1) + '%</text>'; });
  }
  svg += '<rect id="hit" x="' + (M.l - 10) + '" y="' + M.t + '" width="' + (W - M.l - M.r + 20) + '" height="' + (H - M.t - M.b) + '" fill="transparent"/>';
  const chart = document.getElementById('chart');
  chart.innerHTML = svg;

  // ---- hover: crosshair + tooltip listing every series at the nearest measurement ----
  const tip = document.getElementById('tip'), cross = document.getElementById('cross'), wrap = document.getElementById('chartwrap');
  function show(evt) {
    if (n === 0) return;
    const box = chart.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * W;
    let i = n === 1 ? 0 : Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    const r = rows[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = '<strong>' + (i + 1) + ' · ' + day(r.date) + ' · ' + esc(r.label) + '</strong><div class="row"><span>Tests</span><span>' + (r.tests === null ? 'n/a' : r.tests) + '</span></div>' +
      series.map((s) => '<div class="row"><span><i style="background:' + s.color + '"></i>' + s.name + '</span><span>' + r[s.key].covered + ' / ' + r[s.key].total + ' · ' + r[s.key].percent.toFixed(1) + '%</span></div>').join('');
    tip.hidden = false;
    const left = (x(i) / W) * box.width;
    const flip = left + tip.offsetWidth + 16 > wrap.clientWidth;
    tip.style.left = Math.max(0, flip ? left - tip.offsetWidth - 12 : left + 12) + 'px';
    tip.style.top = '12px';
  }
  function hide() { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); }
  const hit = document.getElementById('hit');
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
</script>`;

  if (opts.fragment) return `${head}\n\n${body}\n`;
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

// ---------- CLI ----------

const HELP = `Usage:
  tsx coverage/history.ts append --history <file.jsonl> --sha <sha> [--coverage <coverage.json>]
                                 [--results <playwright json report>] [--message <commit message> | --label <text>]
                                 [--date <ISO date>] [--tests-failed]
      The commit message and date can also come from the COMMIT_MESSAGE and COMMIT_DATE environment
      variables, which is safer for multi-line messages than a command-line argument.
  tsx coverage/history.ts render --history <file.jsonl> --out <file.html> [--repo owner/name] [--fragment]`;

function main(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      history: { type: 'string' },
      coverage: { type: 'string' },
      results: { type: 'string' },
      sha: { type: 'string' },
      message: { type: 'string' },
      label: { type: 'string' },
      date: { type: 'string' },
      'tests-failed': { type: 'boolean' },
      out: { type: 'string' },
      repo: { type: 'string' },
      fragment: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  const command = positionals[0];
  if (values.help || !command || !values.history) {
    console.log(HELP);
    return values.help ? 0 : 2;
  }
  const historyFile = path.resolve(values.history);

  if (command === 'append') {
    if (!values.sha) {
      console.error('append needs --sha');
      return 2;
    }
    const coverageFile = path.resolve(values.coverage ?? 'coverage-report/coverage.json');
    if (!fs.existsSync(coverageFile)) {
      console.error(`Coverage not found: ${coverageFile}`);
      return 2;
    }
    const summary = (JSON.parse(fs.readFileSync(coverageFile, 'utf8')) as CoverageReport).summary;

    // Playwright's JSON reporter: stats.expected + unexpected + flaky + skipped = tests in the run.
    let tests: number | null = null;
    if (values.results && fs.existsSync(values.results)) {
      const stats = (JSON.parse(fs.readFileSync(values.results, 'utf8')) as { stats?: Record<string, number> }).stats;
      if (stats) tests = (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.flaky ?? 0) + (stats.skipped ?? 0);
    }

    const row: HistoryRow = {
      // Normalised to UTC so rows sort correctly whatever offset the commit timestamp carried.
      date: new Date(values.date || process.env.COMMIT_DATE || Date.now()).toISOString(),
      sha: values.sha,
      label: values.label ?? labelFromCommitMessage(values.message ?? process.env.COMMIT_MESSAGE ?? ''),
      tests,
      testsFailed: !!values['tests-failed'],
      operations: summary.operations,
      statuses: summary.statuses,
      parameters: summary.parameters,
      requestBodies: summary.requestBodies,
    };
    const rows = upsert(readHistory(historyFile), row);
    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    fs.writeFileSync(historyFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`History: ${rows.length} measurement(s); added ${row.sha.slice(0, 7)} "${row.label}"`);
    return 0;
  }

  if (command === 'render') {
    if (!values.out) {
      console.error('render needs --out');
      return 2;
    }
    const rows = readHistory(historyFile);
    const out = path.resolve(values.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, renderPage(rows, { repo: values.repo, fragment: values.fragment, generatedAt: new Date().toISOString() }));
    console.log(`Rendered ${rows.length} measurement(s) to ${out}`);
    return 0;
  }

  console.error(`Unknown command "${command}"\n${HELP}`);
  return 2;
}

// Only run the CLI when executed directly, so the unit tests can import the functions.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
