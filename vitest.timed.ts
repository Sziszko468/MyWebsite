/**
 * Test files that hold the code to a time budget. `vite.config.ts` runs them after every other test file, one at a time, so that what they measure is the code and not the
 * machine's other work: beside the other test processes (19 of them on a 20-thread machine) the same queries took two to three times their usual CPU time, and the same
 * happened beside unrelated processes that only competed for memory. Their budgets and timeouts are the same as when they are run alone.
 * Evidence: docs/command-center/DATA_INTEGRITY.md, section "The full-suite timing failure".
 */
export const TIMED_TESTS: readonly string[] = ['server/test/analyticsPerformance.test.ts']
