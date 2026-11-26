import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { TIMED_TESTS } from '../../vitest.timed.ts'

/**
 * PROMPT 37.1: a test that holds the code to a time budget must not share the machine with the rest of the suite (vitest.timed.ts says why). These checks fail if the
 * timed files are put back beside the others, if a new CPU-time test is not declared, or if the split loses a test file or runs one twice.
 */

vi.setConfig({ testTimeout: 120_000 })

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const testFiles = (directory: string): string[] =>
  readdirSync(join(root, directory)).flatMap((name) => {
    const path = `${directory}/${name}`
    if (statSync(join(root, path)).isDirectory()) return name === 'node_modules' ? [] : testFiles(path)
    return name.endsWith('.test.ts') ? [path] : []
  })
const everyTestFile = () => ['src', 'server', 'worker', 'scripts'].flatMap(testFiles).sort()

interface Project {
  test: { name: string; include: string[]; fileParallelism?: boolean; sequence?: { groupOrder?: number } }
}
const projects = async (): Promise<Project[]> => {
  const config = (await import(/* @vite-ignore */ pathToFileURL(join(root, 'vite.config.ts')).href)) as { default: { test: { projects: Project[] } } }
  return config.default.test.projects
}

describe('the test schedule', () => {
  it('runs the timed files after every other file, one at a time', async () => {
    const all = await projects()
    const timed = all.filter((project) => project.test.name === 'timed')
    const others = all.filter((project) => project.test.name !== 'timed')
    expect(timed).toHaveLength(1)
    expect(others.length).toBeGreaterThan(0)
    expect(timed[0].test.include).toEqual([...TIMED_TESTS])
    expect(timed[0].test.fileParallelism).toBe(false)
    for (const other of others) expect(timed[0].test.sequence?.groupOrder, other.test.name).toBeGreaterThan(other.test.sequence?.groupOrder ?? 0)
  })

  it('declares every test file that measures CPU time as timed', () => {
    const measuring = everyTestFile().filter((file) => file !== 'server/test/testScheduling.test.ts' && readFileSync(join(root, file), 'utf8').includes('process.cpuUsage('))
    expect(measuring).toContain('server/test/analyticsPerformance.test.ts')
    for (const file of measuring) expect(TIMED_TESTS, file).toContain(file)
  })

  it('runs every test file exactly once, the timed ones in the timed group', () => {
    // The test runner's own answer, from a process of its own: which files it would run, and in which group.
    const listed = JSON.parse(execFileSync(process.execPath, [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'list', '--filesOnly', '--json'], { cwd: root, encoding: 'utf8' })) as Array<{ file: string; projectName: string }>
    const files = listed.map((entry) => relative(root, entry.file).split(sep).join('/'))
    expect([...files].sort()).toEqual(everyTestFile())
    expect(listed.filter((entry) => entry.projectName === 'timed').map((entry) => relative(root, entry.file).split(sep).join('/'))).toEqual([...TIMED_TESTS])
  })
})
