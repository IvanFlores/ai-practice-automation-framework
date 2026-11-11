// Coverage CLI. Run from qa/ after `npx playwright test`:  npm run coverage -- [options]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildGaps, computeCoverage, formatConsole, loadCalls, loadSpec, type Ratio } from './core';

const HELP = `Usage: tsx coverage/cli.ts [options]

Diffs the OpenAPI spec against the calls recorded in coverage-log/*.jsonl.

  --spec <file>            OpenAPI JSON (default: SPEC_FILE from qa/.env, relative to the repo root)
  --logs <dir>             Log directory (default: qa/coverage-log)
  --out <dir>              Where coverage.json and gaps.json go (default: qa/coverage-report)
  --tag <a,b>              Only report operations with one of these spec tags
  --min-operations <pct>   Exit 1 if operation coverage is below this
  --min-statuses <pct>     Exit 1 if status-code coverage is below this
  --min-parameters <pct>   Exit 1 if parameter coverage is below this
  --fail-on-unmatched      Exit 1 if a call matches no documented operation
  --quiet                  Print only the summary line and failures
  --help

Exit codes: 0 ok, 1 threshold not met, 2 bad input (no spec, no logs).`;

const qaDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(qaDir, '..');

function main(): number {
  const { values } = parseArgs({
    options: {
      spec: { type: 'string' },
      logs: { type: 'string' },
      out: { type: 'string' },
      tag: { type: 'string', multiple: true },
      'min-operations': { type: 'string' },
      'min-statuses': { type: 'string' },
      'min-parameters': { type: 'string' },
      'fail-on-unmatched': { type: 'boolean' },
      quiet: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  // Same convention as playwright.config.ts: qa/.env is optional, real env vars win.
  const envFile = path.join(qaDir, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

  // --spec is relative to the current directory; SPEC_FILE is relative to the repo root.
  const specFile = values.spec
    ? path.resolve(values.spec)
    : process.env.SPEC_FILE
      ? path.resolve(repoRoot, process.env.SPEC_FILE)
      : undefined;
  if (!specFile || !fs.existsSync(specFile)) {
    console.error(`Spec not found: ${specFile ?? '(set SPEC_FILE or pass --spec)'}`);
    return 2;
  }
  const logDir = path.resolve(values.logs ?? path.join(qaDir, 'coverage-log'));
  const outDir = path.resolve(values.out ?? path.join(qaDir, 'coverage-report'));

  const { calls, files } = loadCalls(logDir);
  if (calls.length === 0) {
    // An empty log means the tests did not run, not that coverage is 0%.
    console.error(`No logged calls in ${logDir}. Run \`npx playwright test\` first.`);
    return 2;
  }

  const tags = (values.tag ?? []).flatMap((t) => t.split(',')).map((t) => t.trim()).filter(Boolean);
  const spec = loadSpec(specFile);
  const unknownTags = tags.filter((t) => !spec.operations.some((op) => op.tags.includes(t)));
  if (unknownTags.length) {
    console.error(`Unknown tag(s): ${unknownTags.join(', ')}`);
    return 2;
  }

  const report = computeCoverage(spec, calls, tags);
  const gaps = buildGaps(report);

  fs.mkdirSync(outDir, { recursive: true });
  const meta = {
    generatedAt: new Date().toISOString(),
    specFile: path.relative(repoRoot, specFile).replaceAll('\\', '/'),
    logFiles: files,
    tags,
  };
  fs.writeFileSync(path.join(outDir, 'coverage.json'), JSON.stringify({ ...meta, ...report }, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'gaps.json'), JSON.stringify(gaps, null, 2) + '\n');

  const s = report.summary;
  if (values.quiet) {
    console.log(
      `coverage: operations ${s.operations.percent}% statuses ${s.statuses.percent}% ` +
        `parameters ${s.parameters.percent}% gaps ${gaps.length}`,
    );
  } else {
    console.log(formatConsole(report, gaps));
    console.log(`\nWritten: ${path.relative(process.cwd(), path.join(outDir, 'coverage.json'))}, ${path.relative(process.cwd(), path.join(outDir, 'gaps.json'))}`);
  }

  const failures: string[] = [];
  const check = (flag: 'min-operations' | 'min-statuses' | 'min-parameters', label: string, r: Ratio) => {
    const raw = values[flag];
    if (raw === undefined) return;
    const min = Number(raw);
    if (!Number.isFinite(min)) failures.push(`--${flag} must be a number, got "${raw}"`);
    else if (r.percent < min) failures.push(`${label} coverage ${r.percent}% is below the minimum ${min}%`);
  };
  check('min-operations', 'Operation', s.operations);
  check('min-statuses', 'Status-code', s.statuses);
  check('min-parameters', 'Parameter', s.parameters);
  if (values['fail-on-unmatched'] && report.unmatchedCalls.length) {
    failures.push(`${report.unmatchedCalls.length} call(s) match no documented operation`);
  }
  for (const f of failures) console.error(`FAIL: ${f}`);
  return failures.length ? 1 : 0;
}

process.exitCode = main();
