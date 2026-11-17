#!/usr/bin/env node
/**
 * `npm run check:deploy`: the checks a branch has to pass before it is pushed to the branch the host deploys from (PROMPT 25).
 * The same steps run in CI (.github/workflows/ci.yml; server/test/ciWorkflow.test.ts keeps the two from drifting apart):
 *
 *   typecheck  ->  lint  ->  tests  ->  build  ->  SEO checks on what the build wrote
 *
 * It stops at the first step that fails and exits with that step's status, so a green run really is every step green.
 * `--keep-going` runs all of them and lists every failure at the end (useful when a branch is far from ready).
 *
 * It deploys nothing, reads no secret and touches no hosting setting. For the SEO step to also hold the site to its canonical host,
 * set the address for the build and the check, for example (POSIX shell):
 *
 *   VITE_SITE_URL=https://szilardkiss.com EXPECTED_SITE_ORIGIN=https://szilardkiss.com npm run check:deploy
 */
import { spawnSync } from 'node:child_process'

export const STEPS = [
  { name: 'typecheck', script: 'typecheck' },
  { name: 'lint', script: 'lint' },
  { name: 'tests', script: 'test' },
  { name: 'build', script: 'build' },
  { name: 'seo checks', script: 'check:seo' },
]

const keepGoing = process.argv.includes('--keep-going')
const windows = process.platform === 'win32'
const results = []

for (const step of STEPS) {
  console.log(`\n=== check:deploy: ${step.name} (npm run ${step.script}) ===`)
  const started = Date.now()
  // On Windows `npm` is a .cmd file, which Node only runs through a shell.
  const run = spawnSync(windows ? 'npm.cmd' : 'npm', ['run', step.script], { stdio: 'inherit', shell: windows })
  const seconds = Math.round((Date.now() - started) / 1000)
  const code = run.status ?? 1
  results.push({ ...step, code, seconds })
  if (code !== 0 && !keepGoing) break
}

console.log('\n=== check:deploy: summary ===')
for (const step of STEPS) {
  const result = results.find((r) => r.name === step.name)
  console.log(`${result ? (result.code === 0 ? 'ok     ' : 'FAILED ') : 'not run'}  ${step.name}${result ? `  (${result.seconds}s)` : ''}`)
}
const failed = results.find((r) => r.code !== 0)
if (failed || results.length < STEPS.length) {
  console.log('\ncheck:deploy FAILED: do not push this to the deployment branch.')
  process.exit(failed?.code || 1)
}
console.log('\ncheck:deploy ok: every step passed.')
