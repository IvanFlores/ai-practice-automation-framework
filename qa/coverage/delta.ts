// Compares two coverage reports (PR branch vs base branch) and renders the results:
// a Markdown summary (job summary + PR comment) and a self-contained HTML report (pipeline artifact).
import type { CoverageReport, OperationCoverage, Ratio } from './core';

/** Hidden marker so CI can find and update its own PR comment instead of adding a new one. */
export const COMMENT_MARKER = '<!-- qa-coverage-report -->';

export interface MetricDelta {
  label: string;
  head: Ratio;
  base: Ratio | null;
  /** Change in covered items and in percentage points. null when there is no base. */
  deltaCovered: number | null;
  deltaPercent: number | null;
}

export interface TopGap {
  method: string;
  path: string;
  tags: string[];
  kind: 'missing-statuses' | 'uncovered-operation';
  statuses: string[];
}

export interface Delta {
  hasBase: boolean;
  metrics: MetricDelta[];
  /** `GET /api/articles/{id}` for operations, `GET /api/articles/{id} -> 404` for statuses. */
  newlyCovered: { operations: string[]; statuses: string[] };
  lost: { operations: string[]; statuses: string[] };
  topGaps: TopGap[];
}

const opKey = (o: OperationCoverage) => `${o.method} ${o.path}`;
const coveredOps = (r: CoverageReport) => r.operations.filter((o) => o.covered).map(opKey);
const coveredStatuses = (r: CoverageReport) =>
  r.operations.flatMap((o) => o.statuses.covered.map((s) => `${opKey(o)} -> ${s}`));
const minus = (a: string[], b: string[]) => {
  const drop = new Set(b);
  return a.filter((x) => !drop.has(x));
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeDelta(head: CoverageReport, base: CoverageReport | null, topGapCount = 10): Delta {
  const metric = (label: string, key: keyof CoverageReport['summary']): MetricDelta => {
    const h = head.summary[key];
    const b = base?.summary[key] ?? null;
    return {
      label,
      head: h,
      base: b,
      deltaCovered: b ? h.covered - b.covered : null,
      deltaPercent: b ? round1(h.percent - b.percent) : null,
    };
  };

  return {
    hasBase: base !== null,
    metrics: [
      metric('Operations', 'operations'),
      metric('Status codes', 'statuses'),
      metric('Parameters', 'parameters'),
      metric('Request bodies', 'requestBodies'),
    ],
    newlyCovered: base
      ? { operations: minus(coveredOps(head), coveredOps(base)), statuses: minus(coveredStatuses(head), coveredStatuses(base)) }
      : { operations: [], statuses: [] },
    lost: base
      ? { operations: minus(coveredOps(base), coveredOps(head)), statuses: minus(coveredStatuses(base), coveredStatuses(head)) }
      : { operations: [], statuses: [] },
    topGaps: rankGaps(head).slice(0, topGapCount),
  };
}

/**
 * Cheapest wins first: operations that are already called but miss documented statuses, then operations
 * never called in tags the suite already touches, then everything else. Most statuses first within a group.
 */
export function rankGaps(report: CoverageReport): TopGap[] {
  const touched = new Set(report.operations.filter((o) => o.covered).flatMap((o) => o.tags));
  const partial = report.operations
    .filter((o) => o.covered && o.statuses.missing.length > 0)
    .sort((a, b) => b.statuses.missing.length - a.statuses.missing.length)
    .map((o): TopGap => ({ method: o.method, path: o.path, tags: o.tags, kind: 'missing-statuses', statuses: o.statuses.missing }));
  const uncovered = report.operations
    .filter((o) => !o.covered)
    .map((o) => ({ o, near: o.tags.some((t) => touched.has(t)) }))
    .sort((a, b) => Number(b.near) - Number(a.near) || b.o.statuses.documented.length - a.o.statuses.documented.length)
    .map(({ o }): TopGap => ({ method: o.method, path: o.path, tags: o.tags, kind: 'uncovered-operation', statuses: o.statuses.documented }));
  return [...partial, ...uncovered];
}

/** True when operation or status-code coverage is lower than on the base branch. */
export function coverageDropped(delta: Delta): boolean {
  return delta.metrics.slice(0, 2).some((m) => m.deltaPercent !== null && m.deltaPercent < 0);
}

// ---------- Markdown (job summary + PR comment) ----------

const ratioText = (r: Ratio | null) => (r ? `${r.covered} / ${r.total} (${r.percent}%)` : 'n/a');
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const deltaText = (m: MetricDelta) =>
  m.deltaCovered === null || m.deltaPercent === null ? 'n/a' : `${signed(m.deltaCovered)} (${signed(m.deltaPercent)} pp)`;
const gapText = (g: TopGap) =>
  g.kind === 'missing-statuses'
    ? `\`${g.method} ${g.path}\`: missing ${g.statuses.join(', ')}`
    : `\`${g.method} ${g.path}\`: never called (${g.statuses.join(', ')})`;

export function formatMarkdown(delta: Delta, opts: { testsFailed?: boolean; reportHint?: string } = {}): string {
  const out: string[] = [COMMENT_MARKER, '## API spec coverage', ''];
  if (opts.testsFailed) out.push('> **The API tests failed on this branch.** Coverage below reflects the calls made before/despite the failures.', '');
  if (!delta.hasBase) out.push('> No baseline: the base branch has no `qa/` suite (or this is not a pull request), so there is no delta.', '');

  out.push('| | Base | This branch | Change |', '|---|---|---|---|');
  for (const m of delta.metrics) out.push(`| ${m.label} | ${ratioText(m.base)} | ${ratioText(m.head)} | ${deltaText(m)} |`);

  if (delta.hasBase) {
    const { newlyCovered: n, lost: l } = delta;
    out.push('', `**Newly covered:** ${n.operations.length} operations, ${n.statuses.length} status codes. ` +
      `**Lost:** ${l.operations.length} operations, ${l.statuses.length} status codes.`);
    const list = (title: string, items: string[]) => {
      if (items.length === 0) return;
      out.push('', `<details><summary>${title} (${items.length})</summary>`, '', ...items.map((i) => `- \`${i}\``), '', '</details>');
    };
    list('Newly covered status codes', n.statuses);
    list('Lost status codes', l.statuses);
  }

  out.push('', `### Top ${delta.topGaps.length} gaps`);
  delta.topGaps.forEach((g, i) => out.push(`${i + 1}. ${gapText(g)}`));
  if (delta.topGaps.length === 0) out.push('None: every documented operation and status code is covered.');
  if (opts.reportHint) out.push('', opts.reportHint);
  return out.join('\n') + '\n';
}

// ---------- HTML (pipeline artifact) ----------

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function formatHtml(head: CoverageReport, delta: Delta, meta: { title: string; generatedAt: string }): string {
  const bar = (r: Ratio) => `<div class="bar"><span style="width:${Math.min(100, r.percent)}%"></span></div>`;
  const deltaCell = (m: MetricDelta) => {
    if (m.deltaCovered === null) return '<td class="muted">n/a</td>';
    const cls = m.deltaCovered > 0 ? 'up' : m.deltaCovered < 0 ? 'down' : 'muted';
    return `<td class="${cls}">${esc(deltaText(m))}</td>`;
  };

  const metricRows = delta.metrics
    .map((m) => `<tr><th>${esc(m.label)}</th><td>${esc(ratioText(m.base))}</td><td>${esc(ratioText(m.head))}</td>${deltaCell(m)}<td>${bar(m.head)}</td></tr>`)
    .join('');

  const tagRows = Object.entries(head.byTag)
    .sort(([, a], [, b]) => b.operations.percent - a.operations.percent || b.operations.total - a.operations.total)
    .map(([tag, t]) => `<tr><th>${esc(tag)}</th><td>${esc(ratioText(t.operations))}</td><td>${bar(t.operations)}</td><td>${esc(ratioText(t.statuses))}</td><td>${bar(t.statuses)}</td></tr>`)
    .join('');

  const newOps = new Set(delta.newlyCovered.operations);
  const opRows = head.operations
    .map((o) => {
      const state = !o.covered ? 'uncovered' : o.statuses.missing.length ? 'partial' : 'full';
      const chips = [
        ...o.statuses.covered.map((s) => `<span class="chip hit">${esc(s)}</span>`),
        ...o.statuses.missing.map((s) => `<span class="chip miss">${esc(s)}</span>`),
        ...o.statuses.undocumented.map((s) => `<span class="chip undoc" title="returned but not documented">${esc(s)}?</span>`),
      ].join(' ');
      const params = o.parameters.filter((p) => p.in !== 'path');
      const paramText = params.length
        ? params.map((p) => `<span class="chip ${p.covered ? 'hit' : 'miss'}" title="${esc(p.in)}">${esc(p.name)}</span>`).join(' ')
        : '';
      const body = o.requestBody.documented ? (o.requestBody.covered ? 'sent' : 'not sent') : '';
      return `<tr data-state="${state}" data-text="${esc(`${o.method} ${o.path} ${o.tags.join(' ')}`.toLowerCase())}">` +
        `<td><span class="state ${state}">${state}</span>${newOps.has(opKey(o)) ? ' <span class="chip new">new</span>' : ''}</td>` +
        `<td><code>${esc(o.method)} ${esc(o.path)}</code>${o.secured ? ' <span class="muted" title="needs bearer token">auth</span>' : ''}</td>` +
        `<td>${esc(o.tags.join(', '))}</td><td>${chips}</td><td>${paramText}</td><td>${body}</td><td>${o.calls}</td></tr>`;
    })
    .join('\n');

  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li><code>${esc(i)}</code></li>`).join('')}</ul>` : '<p class="muted">None.</p>');
  const gapItems = delta.topGaps
    .map((g) => `<li><code>${esc(g.method)} ${esc(g.path)}</code> ${g.kind === 'missing-statuses' ? 'missing' : 'never called; documents'} ${esc(g.statuses.join(', '))}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<style>
  :root { --bg:#fff; --fg:#1f2328; --muted:#656d76; --line:#d0d7de; --soft:#f6f8fa; --hit:#1a7f37; --miss:#cf222e; --warn:#9a6700; --accent:#0969da; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --fg:#e6edf3; --muted:#8d96a0; --line:#30363d; --soft:#161b22; --hit:#3fb950; --miss:#f85149; --warn:#d29922; --accent:#4493f8; } }
  body { margin:0; padding:24px 16px 48px; background:var(--bg); color:var(--fg); font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width:1200px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:16px; margin:32px 0 8px; }
  .muted { color:var(--muted); } .up { color:var(--hit); font-weight:600; } .down { color:var(--miss); font-weight:600; }
  .scroll { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; }
  th, td { text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  thead th { background:var(--soft); font-weight:600; position:sticky; top:0; }
  tbody th { font-weight:600; white-space:nowrap; }
  code { font:12px ui-monospace,SFMono-Regular,Consolas,monospace; }
  .bar { width:140px; height:8px; background:var(--soft); border:1px solid var(--line); border-radius:4px; margin-top:6px; }
  .bar span { display:block; height:100%; background:var(--hit); border-radius:3px; }
  .chip { display:inline-block; padding:0 6px; border-radius:10px; border:1px solid var(--line); font-size:12px; }
  .chip.hit { color:var(--hit); border-color:var(--hit); } .chip.miss { color:var(--miss); } .chip.undoc { color:var(--warn); border-color:var(--warn); }
  .chip.new { color:var(--accent); border-color:var(--accent); }
  .state { font-size:12px; font-weight:600; } .state.full { color:var(--hit); } .state.partial { color:var(--warn); } .state.uncovered { color:var(--muted); }
  .controls { display:flex; gap:8px; flex-wrap:wrap; margin:8px 0; }
  .controls input, .controls select { font:inherit; padding:4px 8px; color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:6px; }
  .cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:0 32px; }
  ul, ol { padding-left:20px; margin:4px 0; }
</style>
</head>
<body>
<main>
<h1>${esc(meta.title)}</h1>
<p class="muted">Generated ${esc(meta.generatedAt)} · OpenAPI ${esc(head.spec.version)} · ${head.calls} logged calls · ${delta.hasBase ? 'compared with the base branch' : 'no baseline to compare with'}</p>

<h2>Summary</h2>
<div class="scroll"><table>
<thead><tr><th></th><th>Base</th><th>This branch</th><th>Change</th><th></th></tr></thead>
<tbody>${metricRows}</tbody>
</table></div>

<div class="cols">
<section><h2>Newly covered status codes (${delta.newlyCovered.statuses.length})</h2>${list(delta.newlyCovered.statuses)}</section>
<section><h2>Lost status codes (${delta.lost.statuses.length})</h2>${list(delta.lost.statuses)}</section>
<section><h2>Top gaps</h2>${gapItems ? `<ol>${gapItems}</ol>` : '<p class="muted">None.</p>'}</section>
</div>
${head.unmatchedCalls.length ? `<h2>Calls matching no documented operation</h2>${list(head.unmatchedCalls.map((c) => `${c.method} ${c.path} -> ${c.status} (x${c.count})`))}` : ''}

<h2>By tag</h2>
<div class="scroll"><table>
<thead><tr><th>Tag</th><th>Operations</th><th></th><th>Status codes</th><th></th></tr></thead>
<tbody>${tagRows}</tbody>
</table></div>

<h2>Operations (<span id="shown">${head.operations.length}</span> of ${head.operations.length})</h2>
<div class="controls">
  <input id="q" type="search" placeholder="Filter by method, path or tag" size="32">
  <select id="state"><option value="">All states</option><option value="full">Full</option><option value="partial">Partial</option><option value="uncovered">Uncovered</option></select>
</div>
<div class="scroll"><table id="ops">
<thead><tr><th>State</th><th>Operation</th><th>Tags</th><th>Status codes</th><th>Query / header params</th><th>Body</th><th>Calls</th></tr></thead>
<tbody>
${opRows}
</tbody>
</table></div>
</main>
<script>
  const q = document.getElementById('q'), state = document.getElementById('state'), shown = document.getElementById('shown');
  const rows = [...document.querySelectorAll('#ops tbody tr')];
  function apply() {
    const text = q.value.trim().toLowerCase();
    let n = 0;
    for (const r of rows) {
      const ok = (!text || r.dataset.text.includes(text)) && (!state.value || r.dataset.state === state.value);
      r.hidden = !ok;
      if (ok) n++;
    }
    shown.textContent = n;
  }
  q.addEventListener('input', apply);
  state.addEventListener('change', apply);
</script>
</body>
</html>
`;
}
