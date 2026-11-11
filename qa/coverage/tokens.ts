// Token usage per pull request, read from the Claude Code transcripts on the machine that did the work.
//   tsx coverage/tokens.ts record --pr <n> [--branch <name>] [--until <ISO date>] [--sha <commit>]
// CI cannot measure this (the transcripts are local), so the result is committed as coverage/tokens.json
// and the coverage history page (coverage/history.ts) draws it next to the coverage numbers.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export interface TokenUsage {
  /** Model calls counted. */
  messages: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
}

export interface PrTokens extends TokenUsage {
  branch: string;
  /** Calls after this moment (normally the merge) are not counted. */
  until?: string;
  /** Commit whose measurement shows this PR on the history page; without it, the PR's merge commit row. */
  sha?: string;
  recordedAt: string;
}

export interface TokenFile {
  prs: Record<string, PrTokens>;
}

export function readTokens(file: string): TokenFile {
  if (!fs.existsSync(file)) return { prs: {} };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<TokenFile>;
  return { prs: parsed.prs ?? {} };
}

/**
 * Sums the usage of every model call made while `branch` was checked out.
 * A transcript repeats one call's usage on several lines (one per content block), so calls are counted once.
 */
export function sumUsage(lines: Iterable<string>, branch: string, until?: string): TokenUsage {
  const limit = until ? new Date(until).getTime() : Infinity;
  const calls = new Map<string, TokenUsage>();
  let anonymous = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // a line still being written
    }
    const usage = entry?.message?.usage;
    if (entry?.type !== 'assistant' || !usage || entry.gitBranch !== branch) continue;
    if (entry.timestamp && new Date(entry.timestamp).getTime() > limit) continue;
    const id = entry.message.id || entry.requestId ? `${entry.message.id ?? ''}|${entry.requestId ?? ''}` : `anonymous-${anonymous++}`;
    const call: TokenUsage = {
      messages: 1,
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      total: 0,
    };
    const seen = calls.get(id);
    // Lines written while a reply streams can carry a partial output count: keep the largest.
    if (!seen || call.output > seen.output) calls.set(id, call);
  }
  const sum: TokenUsage = { messages: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0 };
  for (const c of calls.values()) {
    sum.messages += 1;
    sum.input += c.input;
    sum.output += c.output;
    sum.cacheWrite += c.cacheWrite;
    sum.cacheRead += c.cacheRead;
  }
  sum.total = sum.input + sum.output + sum.cacheWrite + sum.cacheRead;
  return sum;
}

/** Claude Code keeps a project's transcripts in ~/.claude/projects/<the project path, non-alphanumerics as dashes>. */
export function transcriptDir(projectRoot: string, home = os.homedir()): string {
  return path.join(home, '.claude', 'projects', projectRoot.replace(/[^A-Za-z0-9]/g, '-'));
}

function* transcriptLines(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* transcriptLines(full); // subagent transcripts live in subfolders
    else if (entry.name.endsWith('.jsonl')) yield* fs.readFileSync(full, 'utf8').split('\n');
  }
}

// ---------- CLI ----------

const HELP = `Usage:
  tsx coverage/tokens.ts record --pr <number> [--branch <name>] [--until <ISO date>] [--sha <commit>]
                                [--transcripts <dir>] [--out <tokens.json>]
      Counts the tokens of every Claude Code call made on the branch (default: the current one), up to
      --until (use the PR's merge time when recording after the merge), and stores them under the PR number.
      --sha pins the PR to a measured commit on the history page when its merge commit has no measurement.`;

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function main(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      pr: { type: 'string' },
      branch: { type: 'string' },
      until: { type: 'string' },
      sha: { type: 'string' },
      transcripts: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help || positionals[0] !== 'record' || !values.pr || !/^\d+$/.test(values.pr)) {
    console.log(HELP);
    return values.help ? 0 : 2;
  }
  if (values.until && Number.isNaN(new Date(values.until).getTime())) {
    console.error(`--until is not a date: ${values.until}`);
    return 2;
  }
  const branch = values.branch ?? git('rev-parse', '--abbrev-ref', 'HEAD');
  const dir = path.resolve(values.transcripts ?? transcriptDir(git('rev-parse', '--show-toplevel')));
  if (!fs.existsSync(dir)) {
    console.error(`No Claude Code transcripts at ${dir}`);
    return 2;
  }
  const usage = sumUsage(transcriptLines(dir), branch, values.until);
  if (usage.messages === 0) {
    console.error(`No Claude Code calls recorded on branch "${branch}" in ${dir}`);
    return 1;
  }

  const out = path.resolve(values.out ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'tokens.json'));
  const file = readTokens(out);
  file.prs[values.pr] = {
    branch,
    ...(values.until ? { until: new Date(values.until).toISOString() } : {}),
    ...(values.sha ? { sha: values.sha } : {}),
    ...usage,
    recordedAt: new Date().toISOString(),
  };
  const sorted = Object.fromEntries(Object.entries(file.prs).sort(([a], [b]) => Number(a) - Number(b)));
  fs.writeFileSync(out, JSON.stringify({ prs: sorted }, null, 2) + '\n');
  console.log(`PR #${values.pr} (${branch}): ${usage.total.toLocaleString('en-US')} tokens in ${usage.messages} calls, written to ${out}`);
  return 0;
}

// Only run the CLI when executed directly, so the unit tests can import the functions.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
