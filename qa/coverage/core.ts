// Pure coverage logic: parse the OpenAPI spec, match logged calls to operations, diff, list gaps.
// No I/O besides the two loaders at the top, so everything else is unit-testable (see core.test.ts).
import fs from 'node:fs';
import path from 'node:path';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

/** One line of coverage-log/worker-<n>.jsonl (written by framework/api.ts). */
export interface LoggedCall {
  method: string;
  path: string;
  status: number;
  query: string[];
  /** Names of headers the test passed explicitly. Absent in logs written before Day 2. */
  headers?: string[];
  hasBody: boolean;
}

export type ParamLocation = 'path' | 'query' | 'header' | 'cookie';

export interface Operation {
  method: string;
  /** Real URL template, e.g. `/api/articles/{id}`. */
  path: string;
  /** Path exactly as written in the spec, e.g. `/articles/{id}`. */
  specPath: string;
  operationId: string | null;
  tags: string[];
  secured: boolean;
  /** Documented response codes as written: `200`, `404`, `4XX`, `default`. */
  statuses: string[];
  parameters: { name: string; in: ParamLocation; required: boolean }[];
  hasRequestBody: boolean;
}

export interface Spec {
  version: string;
  basePath: string;
  operations: Operation[];
  /** Things the loader had to fix or could not interpret. */
  notes: string[];
}

// ---------- spec ----------

type Json = Record<string, any>;

export function parseSpec(doc: Json): Spec {
  const notes: string[] = [];
  const version: string = doc.openapi ?? doc.swagger ?? 'unknown';
  if (!String(version).startsWith('3.')) notes.push(`Spec version ${version} is not OpenAPI 3.x; parsing may be incomplete.`);

  // Paths are relative to the first server URL (`/api` for GAD). Swagger 2.0 uses basePath.
  const serverUrl: string = doc.servers?.[0]?.url ?? doc.basePath ?? '';
  const basePath = trimSlash(new URL(serverUrl || '/', 'http://placeholder').pathname);

  const deref = (node: Json | undefined): Json | undefined => {
    if (!node?.$ref) return node;
    const target = String(node.$ref)
      .replace(/^#\//, '')
      .split('/')
      .reduce<any>((acc, key) => acc?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], doc);
    if (!target) notes.push(`Unresolved $ref ${node.$ref}`);
    return target;
  };

  const operations: Operation[] = [];
  for (const [specPath, rawItem] of Object.entries<Json>(doc.paths ?? {})) {
    const item = deref(rawItem) ?? {};
    let fullPath: string;
    if (basePath && (specPath === basePath || specPath.startsWith(basePath + '/'))) {
      // Spec defect: the path already carries the server prefix (GAD: `/api/books/{id}`).
      fullPath = trimSlash(specPath);
      notes.push(`Path "${specPath}" already includes "${basePath}"; treated as ${fullPath}, not ${basePath}${specPath}.`);
    } else {
      fullPath = trimSlash(basePath + specPath);
    }

    for (const method of HTTP_METHODS) {
      const op: Json | undefined = item[method];
      if (!op) continue;

      // Operation-level parameters override path-level ones with the same (in, name).
      const params = new Map<string, Operation['parameters'][number]>();
      for (const raw of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
        const p = deref(raw);
        if (!p?.name || !p.in) continue;
        if (p.in === 'body' || p.in === 'formData') continue; // Swagger 2.0 bodies, handled below
        params.set(`${p.in}:${p.name}`, { name: p.name, in: p.in, required: !!p.required });
      }

      const security = op.security ?? doc.security ?? [];
      operations.push({
        method: method.toUpperCase(),
        path: fullPath,
        specPath,
        operationId: op.operationId ?? null,
        tags: op.tags?.length ? op.tags : ['(untagged)'],
        secured: Array.isArray(security) && security.some((s: Json) => Object.keys(s).length > 0),
        statuses: Object.keys(op.responses ?? {}),
        parameters: [...params.values()],
        hasRequestBody:
          !!op.requestBody || (op.parameters ?? []).some((p: Json) => ['body', 'formData'].includes(deref(p)?.in)),
      });
    }
  }

  const seen = new Set<string>();
  for (const op of operations) {
    const key = `${op.method} ${op.path.replace(/\{[^}]+\}/g, '{}')}`;
    if (seen.has(key)) notes.push(`Duplicate operation after normalisation: ${op.method} ${op.path}`);
    seen.add(key);
  }
  return { version, basePath, operations, notes };
}

export function loadSpec(file: string): Spec {
  return parseSpec(JSON.parse(fs.readFileSync(file, 'utf8')));
}

// ---------- logs ----------

export function loadCalls(logDir: string): { calls: LoggedCall[]; files: string[] } {
  const files = fs.existsSync(logDir)
    ? fs.readdirSync(logDir).filter((f) => f.endsWith('.jsonl')).sort()
    : [];
  const calls: LoggedCall[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(logDir, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      try {
        calls.push(JSON.parse(line) as LoggedCall);
      } catch {
        throw new Error(`${file}:${i + 1} is not valid JSON: ${line}`);
      }
    });
  }
  return { calls, files };
}

// ---------- matching ----------

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
const segments = (p: string) => p.split('/').filter(Boolean);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `{id}` or `v{version}`: a segment with a placeholder matches any non-empty segment text around the literals. */
const segmentRe = (tpl: string) =>
  new RegExp('^' + tpl.split(/\{[^}]+\}/).map(escapeRe).join('[^/]+') + '$');

/**
 * Finds the spec operation for a real call. When several templates fit, the most literal one wins,
 * comparing left to right: `/api/articles/search` beats `/api/articles/{id}`.
 */
export function matchOperation(operations: Operation[], method: string, callPath: string): Operation | undefined {
  const segs = segments(callPath);
  let best: Operation | undefined;
  let bestScore = '';
  for (const op of operations) {
    if (op.method !== method.toUpperCase()) continue;
    const tpl = segments(op.path);
    if (tpl.length !== segs.length) continue;
    let score = '';
    let ok = true;
    for (let i = 0; i < tpl.length && ok; i++) {
      const t = tpl[i]!;
      const s = segs[i]!;
      if (!t.includes('{')) {
        ok = t === s;
        score += '1';
      } else {
        ok = segmentRe(t).test(s);
        score += '0';
      }
    }
    if (ok && (!best || score > bestScore)) {
      best = op;
      bestScore = score;
    }
  }
  return best;
}

/** Does a documented response key (`200`, `4XX`) describe this status? `default` is handled by the caller. */
const statusMatches = (documented: string, status: number) =>
  documented === String(status) || (/^[1-5]XX$/i.test(documented) && documented[0] === String(status)[0]);

// ---------- coverage ----------

export interface Ratio {
  covered: number;
  total: number;
  percent: number;
}

export interface OperationCoverage {
  method: string;
  path: string;
  operationId: string | null;
  tags: string[];
  secured: boolean;
  calls: number;
  covered: boolean;
  statuses: { documented: string[]; covered: string[]; missing: string[]; undocumented: number[] };
  parameters: { name: string; in: ParamLocation; required: boolean; covered: boolean }[];
  requestBody: { documented: boolean; covered: boolean };
}

export interface CoverageReport {
  spec: { version: string; basePath: string; notes: string[] };
  calls: number;
  summary: { operations: Ratio; statuses: Ratio; parameters: Ratio; requestBodies: Ratio };
  byTag: Record<string, { operations: Ratio; statuses: Ratio }>;
  operations: OperationCoverage[];
  /** Calls that fit no documented operation (wrong path, or method not in the spec). */
  unmatchedCalls: { method: string; path: string; status: number; count: number }[];
}

const ratio = (covered: number, total: number): Ratio => ({
  covered,
  total,
  percent: total === 0 ? 100 : Math.round((covered / total) * 1000) / 10,
});

export function computeCoverage(spec: Spec, calls: LoggedCall[], tags: string[] = []): CoverageReport {
  const hits = new Map<Operation, LoggedCall[]>();
  const unmatched = new Map<string, CoverageReport['unmatchedCalls'][number]>();

  for (const call of calls) {
    const op = matchOperation(spec.operations, call.method, call.path);
    if (op) {
      hits.set(op, [...(hits.get(op) ?? []), call]);
    } else {
      const key = `${call.method} ${call.path} ${call.status}`;
      const row = unmatched.get(key) ?? { method: call.method, path: call.path, status: call.status, count: 0 };
      row.count++;
      unmatched.set(key, row);
    }
  }

  const inScope = spec.operations.filter((op) => tags.length === 0 || op.tags.some((t) => tags.includes(t)));
  const operations = inScope.map((op): OperationCoverage => {
    const opCalls = hits.get(op) ?? [];
    const seen = [...new Set(opCalls.map((c) => c.status))].sort((a, b) => a - b);
    const explicit = op.statuses.filter((s) => s !== 'default');
    const undocumentedSeen = seen.filter((s) => !explicit.some((d) => statusMatches(d, s)));
    const coveredStatuses = op.statuses.filter((d) =>
      d === 'default' ? undocumentedSeen.length > 0 : seen.some((s) => statusMatches(d, s)),
    );
    const sentQuery = new Set(opCalls.flatMap((c) => c.query));
    const sentHeaders = new Set(opCalls.flatMap((c) => c.headers ?? []).map((h) => h.toLowerCase()));

    return {
      method: op.method,
      path: op.path,
      operationId: op.operationId,
      tags: op.tags,
      secured: op.secured,
      calls: opCalls.length,
      covered: opCalls.length > 0,
      statuses: {
        documented: op.statuses,
        covered: coveredStatuses,
        missing: op.statuses.filter((s) => !coveredStatuses.includes(s)),
        undocumented: op.statuses.includes('default') ? [] : undocumentedSeen,
      },
      parameters: op.parameters.map((p) => ({
        ...p,
        covered:
          p.in === 'path'
            ? opCalls.length > 0
            : p.in === 'query'
              ? sentQuery.has(p.name)
              : p.in === 'header'
                ? sentHeaders.has(p.name.toLowerCase())
                : false, // cookies are not recorded
      })),
      requestBody: { documented: op.hasRequestBody, covered: op.hasRequestBody && opCalls.some((c) => c.hasBody) },
    };
  });

  const summarise = (ops: OperationCoverage[]) => ({
    operations: ratio(ops.filter((o) => o.covered).length, ops.length),
    statuses: ratio(sum(ops, (o) => o.statuses.covered.length), sum(ops, (o) => o.statuses.documented.length)),
    parameters: ratio(sum(ops, (o) => o.parameters.filter((p) => p.covered).length), sum(ops, (o) => o.parameters.length)),
    requestBodies: ratio(ops.filter((o) => o.requestBody.covered).length, ops.filter((o) => o.requestBody.documented).length),
  });

  const byTag: CoverageReport['byTag'] = {};
  for (const tag of [...new Set(operations.flatMap((o) => o.tags))].sort()) {
    const { operations: o, statuses: s } = summarise(operations.filter((op) => op.tags.includes(tag)));
    byTag[tag] = { operations: o, statuses: s };
  }

  return {
    spec: { version: spec.version, basePath: spec.basePath, notes: spec.notes },
    calls: calls.length,
    summary: summarise(operations),
    byTag,
    operations,
    unmatchedCalls: [...unmatched.values()],
  };
}

const sum = <T>(items: T[], f: (item: T) => number) => items.reduce((n, item) => n + f(item), 0);

// ---------- gaps ----------

export interface Gap {
  type: 'operation' | 'status' | 'parameter' | 'requestBody';
  method: string;
  path: string;
  operationId: string | null;
  tags: string[];
  secured: boolean;
  /** false when the operation itself was never called (its `operation` gap is also in the list). */
  operationCovered: boolean;
  status?: string;
  parameter?: { name: string; in: ParamLocation; required: boolean };
}

/** Flat list of everything documented but not exercised. Filter on `type` to pick a granularity. */
export function buildGaps(report: CoverageReport): Gap[] {
  const gaps: Gap[] = [];
  for (const op of report.operations) {
    const base = {
      method: op.method,
      path: op.path,
      operationId: op.operationId,
      tags: op.tags,
      secured: op.secured,
      operationCovered: op.covered,
    };
    if (!op.covered) gaps.push({ type: 'operation', ...base });
    for (const status of op.statuses.missing) gaps.push({ type: 'status', ...base, status });
    for (const p of op.parameters) {
      if (!p.covered) gaps.push({ type: 'parameter', ...base, parameter: { name: p.name, in: p.in, required: p.required } });
    }
    if (op.requestBody.documented && !op.requestBody.covered) gaps.push({ type: 'requestBody', ...base });
  }
  return gaps;
}

// ---------- console ----------

export function formatConsole(report: CoverageReport, gaps: Gap[]): string {
  const out: string[] = [];
  const row = (label: string, r: Ratio) =>
    `  ${label.padEnd(16)}${String(r.covered).padStart(5)} /${String(r.total).padStart(4)}  ${r.percent.toFixed(1).padStart(5)}%`;

  out.push(`API coverage (OpenAPI ${report.spec.version}, base ${report.spec.basePath || '/'}, ${report.calls} logged calls)`, '');
  out.push(row('Operations', report.summary.operations));
  out.push(row('Status codes', report.summary.statuses));
  out.push(row('Parameters', report.summary.parameters));
  out.push(row('Request bodies', report.summary.requestBodies));

  const touched = Object.entries(report.byTag).filter(([, t]) => t.operations.covered > 0);
  const untouched = Object.keys(report.byTag).length - touched.length;
  out.push('', 'By tag (tags with at least one covered operation):');
  for (const [tag, t] of touched) {
    out.push(
      `  ${tag.padEnd(16)}operations ${t.operations.covered}/${t.operations.total} (${t.operations.percent}%), ` +
        `statuses ${t.statuses.covered}/${t.statuses.total} (${t.statuses.percent}%)`,
    );
  }
  if (touched.length === 0) out.push('  (none)');
  if (untouched > 0) out.push(`  ... ${untouched} more tag(s) at 0%`);

  out.push('', 'Covered operations:');
  const covered = report.operations.filter((o) => o.covered);
  const width = Math.max(0, ...covered.map((o) => o.method.length + o.path.length + 1));
  for (const o of covered) {
    const parts = [`hit ${o.statuses.covered.join(',') || '-'}`];
    if (o.statuses.missing.length) parts.push(`missing ${o.statuses.missing.join(',')}`);
    if (o.statuses.undocumented.length) parts.push(`UNDOCUMENTED ${o.statuses.undocumented.join(',')}`);
    const params = o.parameters.filter((p) => p.in !== 'path');
    if (params.length) parts.push(`params ${params.filter((p) => p.covered).length}/${params.length}`);
    out.push(`  ${`${o.method} ${o.path}`.padEnd(width)}  ${parts.join(' | ')}  (${o.calls} call${o.calls === 1 ? '' : 's'})`);
  }
  if (covered.length === 0) out.push('  (none)');

  if (report.unmatchedCalls.length) {
    out.push('', 'Calls matching no documented operation:');
    for (const c of report.unmatchedCalls) out.push(`  ${c.method} ${c.path} -> ${c.status} (x${c.count})`);
  }
  if (report.spec.notes.length) {
    out.push('', 'Spec notes:');
    for (const n of report.spec.notes) out.push(`  ${n}`);
  }

  const count = (type: Gap['type']) => gaps.filter((g) => g.type === type).length;
  out.push(
    '',
    `Gaps: ${gaps.length} (${count('operation')} operations, ${count('status')} status codes, ` +
      `${count('parameter')} parameters, ${count('requestBody')} request bodies)`,
  );
  return out.join('\n');
}
