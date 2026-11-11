// Downloads the coverage artifact of a PR's latest qa-pr-coverage run and prints where the gap list is.
// This is how the test agent reads its work list:  npm run pr:gaps -- <pr-number> [--repo owner/name]
// Needs the GitHub CLI (`gh`) on PATH and logged in. Set GH_BIN if gh is installed elsewhere.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const WORKFLOW = 'qa-pr-coverage';
const ARTIFACT = 'qa-coverage-report';
const qaDir = fileURLToPath(new URL('..', import.meta.url));

function gh(...args: string[]): string {
  return execFileSync(process.env.GH_BIN ?? 'gh', args, { encoding: 'utf8' }).trim();
}

function main(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { repo: { type: 'string' }, out: { type: 'string' } },
  });
  const pr = positionals[0];
  if (!pr || !/^\d+$/.test(pr)) {
    console.error('Usage: tsx agents/fetch-pr-gaps.ts <pr-number> [--repo owner/name] [--out dir]');
    return 2;
  }
  const repo = values.repo ?? process.env.QA_REPO;
  if (!repo) {
    console.error('Pass --repo owner/name or set QA_REPO (this checkout has more than one remote).');
    return 2;
  }

  const head = JSON.parse(gh('pr', 'view', pr, '--repo', repo, '--json', 'headRefName,headRefOid')) as {
    headRefName: string;
    headRefOid: string;
  };
  const runs = JSON.parse(
    gh('run', 'list', '--repo', repo, '--workflow', WORKFLOW, '--commit', head.headRefOid, '--json', 'databaseId,status,conclusion'),
  ) as { databaseId: number; status: string; conclusion: string }[];
  const run = runs[0];
  if (!run) {
    console.error(`No ${WORKFLOW} run for ${head.headRefName}@${head.headRefOid.slice(0, 7)} yet.`);
    return 1;
  }
  if (run.status !== 'completed') {
    console.error(`Run ${run.databaseId} is still ${run.status}. Try again when it has finished.`);
    return 1;
  }

  const outDir = path.resolve(values.out ?? path.join(qaDir, 'coverage-report', `pr-${pr}`));
  fs.rmSync(outDir, { recursive: true, force: true });
  gh('run', 'download', String(run.databaseId), '--repo', repo, '--name', ARTIFACT, '--dir', outDir);

  // The artifact holds qa/coverage-report/ and qa/coverage-log/; find the gap list wherever it landed.
  const find = (dir: string): string | undefined => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const hit = find(full);
        if (hit) return hit;
      } else if (entry.name === 'pr-gaps.json') return full;
    }
    return undefined;
  };
  const gapsFile = find(outDir);
  if (!gapsFile) {
    console.error(`Artifact of run ${run.databaseId} has no pr-gaps.json.`);
    return 1;
  }
  const gaps = JSON.parse(fs.readFileSync(gapsFile, 'utf8')) as unknown[];
  console.log(`PR #${pr} (${head.headRefName}@${head.headRefOid.slice(0, 7)}), run ${run.databaseId}: ${run.conclusion}`);
  console.log(`Gaps introduced by this PR: ${gaps.length}`);
  console.log(`Gap list: ${gapsFile}`);
  console.log(`Summary:  ${path.join(path.dirname(gapsFile), 'summary.md')}`);
  return 0;
}

process.exitCode = main();
