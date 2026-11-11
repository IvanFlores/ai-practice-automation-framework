# Day 4 — two-agent pipeline

Two agents with separate jobs, connected only through the pull request and its coverage check.

| Step | Who | What happens |
|---|---|---|
| 1 | Engineer | Gives the feature agent a feature request. |
| 2 | Feature agent (`feature-agent.md`) | Implements the endpoint, documents it in the OpenAPI spec, opens a PR. Writes no `qa/` tests. |
| 3 | CI (`.github/workflows/qa-pr-coverage.yml`) | Runs the suite on the PR and on the base. The spec grew and the tests did not, so the delta is negative and the check fails. The artifact contains `pr-gaps.json`: the gaps this PR introduced. |
| 4 | Test agent (`test-agent.md`) | Downloads the artifact (`npm run pr:gaps -- <pr>`), writes tests for exactly those gaps, runs them, pushes to the same PR branch. |
| 5 | CI | Runs again on the new commit. The delta is no longer negative and the check passes. |

## How the agents are run
- Each agent is a fresh Claude Code subagent started with its prompt file plus the inputs listed at its top.
  The prompts live here, not in `.claude/agents/`, so nothing is auto-loaded into other sessions.
- The hand-off from step 3 to step 4 is the failing check. In the Claude desktop app, "Auto-fix" on the PR
  wakes the orchestrating session when CI fails, and that session starts the test agent. Without it, start
  the test agent by hand once the check has finished.
- The agents never talk to each other. The test agent's only inputs are the PR number, the artifact, the spec
  and `CONVENTIONS.md`.

## Why the check fails in step 3
`coverage:report --fail-on-drop` fails when operation or status-code coverage is lower than on the base
branch. New documented operations raise the totals without raising the covered counts, so the percentages
fall. `pr-gaps.json` lists only what the PR added, so the test agent is not asked to fix older gaps.

## Local runs
The GAD on port 3001 may be a different checkout without the new endpoint. Agents therefore run with
`PORT=3002`, which makes Playwright start GAD from this checkout.
