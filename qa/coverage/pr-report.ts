// PR report CLI: compares this branch's coverage.json with the base branch's and writes
// delta.json, pr-gaps.json (gaps this PR introduced), summary.md (job summary + PR comment) and report.html.
//   npm run coverage:report -- --head coverage-report/coverage.json --base <base coverage.json>
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { CoverageReport } from './core';
import { computeDelta, coverageDropped, formatHtml, formatMarkdown } from './delta';

const HELP = `Usage: tsx coverage/pr-report.ts [options]

  --head <file>      coverage.json of this branch (default: coverage-report/coverage.json)
  --base <file>      coverage.json of the base branch. Missing file or flag = no baseline, no delta
  --out <dir>        Output directory (default: the directory of --head)
  --title <text>     Title of the HTML report
  --top <n>          Number of top gaps to list (default: 10)
  --tests-failed     Add a warning that the API tests failed on this branch
  --fail-on-drop     Exit 1 if operation or status-code coverage is lower than on the base
  --help`;

function main(): number {
  const { values } = parseArgs({
    options: {
      head: { type: 'string' },
      base: { type: 'string' },
      out: { type: 'string' },
      title: { type: 'string' },
      top: { type: 'string' },
      'tests-failed': { type: 'boolean' },
      'fail-on-drop': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const headFile = path.resolve(values.head ?? 'coverage-report/coverage.json');
  if (!fs.existsSync(headFile)) {
    console.error(`Head coverage not found: ${headFile}. Run \`npm run coverage\` first.`);
    return 2;
  }
  const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as CoverageReport;
  const head = read(headFile);
  const baseFile = values.base ? path.resolve(values.base) : undefined;
  const base = baseFile && fs.existsSync(baseFile) ? read(baseFile) : null;
  if (baseFile && !base) console.warn(`Base coverage not found (${baseFile}): reporting without a delta.`);

  const delta = computeDelta(head, base, Number(values.top ?? 10) || 10);
  const outDir = path.resolve(values.out ?? path.dirname(headFile));
  fs.mkdirSync(outDir, { recursive: true });

  const markdown = formatMarkdown(delta, {
    testsFailed: values['tests-failed'],
    reportHint: 'Full report: `report.html` in the `qa-coverage-report` artifact of this run.',
  });
  fs.writeFileSync(path.join(outDir, 'delta.json'), JSON.stringify(delta, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'pr-gaps.json'), JSON.stringify(delta.introducedGaps, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'summary.md'), markdown);
  fs.writeFileSync(
    path.join(outDir, 'report.html'),
    formatHtml(head, delta, { title: values.title ?? 'GAD API spec coverage', generatedAt: new Date().toISOString() }),
  );

  console.log(markdown);
  console.log(`Written: delta.json, pr-gaps.json, summary.md, report.html in ${path.relative(process.cwd(), outDir) || '.'}`);

  if (values['fail-on-drop'] && coverageDropped(delta)) {
    console.error('FAIL: operation or status-code coverage is lower than on the base branch.');
    return 1;
  }
  return 0;
}

process.exitCode = main();
