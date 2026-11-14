import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { experimentPath, experiments, neighbourExperiment, playableExperiments, type LabId } from '../../content/lab'
import { experimentSummary } from '../../content/labMeta'
import { experimentText } from '../../content/labText'
import { LANGUAGES } from '../../i18n/config'
import { I18nContext } from '../../i18n/context'
import { dictionaries } from '../../i18n/dictionaries'
import { PAGES } from '../../routes/pages'
import { flattenKinetic } from '../../test/markup'
import { ThemeContext } from '../../theme/context'
import { NFSU2 } from './easter/eggConfig'
import { Discovery } from './page/Discovery'
import { EXPERIMENT_COMPONENTS } from './registry'
import { LabArt } from './ui/LabArt'

/**
 * The scope of the Lab (PROMPT 22.1): exactly six standard experiences, Generative Objects among them as a procedural, local, interactive
 * experience (no AI model, no external service, no server), and the NFSU2 racing screen a separate hidden Easter egg that is none of the six.
 */

const SIX: readonly LabId[] = ['particle-universe', 'liquid-matter', 'type-in-motion', 'infinite-space', 'chromatic-distortion', 'generative-objects']
const SRC = join(__dirname, '..', '..')
const GENERATIVE = join(__dirname, 'experiments', 'generative')

function sourcesOf(directory: string): Array<{ file: string; text: string }> {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourcesOf(path)
    return /\.(ts|tsx|scss)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [{ file: path, text: readFileSync(path, 'utf8') }] : []
  })
}

describe('the six standard experiences', () => {
  it('are exactly these six, in this order, each ready, with unique identifiers and numbers', () => {
    expect(experiments).toHaveLength(6)
    expect(experiments.map((e) => e.id)).toEqual(SIX)
    expect(new Set(experiments.map((e) => e.id)).size).toBe(6)
    expect(experiments.map((e) => e.number)).toEqual(['01', '02', '03', '04', '05', '06'])
    expect(new Set(experiments.map((e) => e.name)).size).toBe(6)
    expect(experiments.find((e) => e.id === 'generative-objects')?.name).toBe('Generative Objects')
    expect(experiments.every((e) => e.status === 'ready')).toBe(true)
    expect(playableExperiments).toHaveLength(6)
  })

  it('each has a component, a page, its words in three languages and a still picture', () => {
    expect(Object.keys(EXPERIMENT_COMPONENTS).sort()).toEqual([...SIX].sort())
    for (const experiment of experiments) {
      expect(PAGES.some((page) => page.path === experimentPath(experiment.id)), experiment.id).toBe(true)
      for (const lang of LANGUAGES) {
        expect(experiment.tagline[lang].trim(), `${experiment.id} tagline ${lang}`).not.toBe('')
        expect(experimentSummary[experiment.id][lang].trim(), `${experiment.id} summary ${lang}`).not.toBe('')
        expect(experimentText[experiment.id].description[lang].trim(), `${experiment.id} description ${lang}`).not.toBe('')
        expect(experimentText[experiment.id].stageLabel[lang].trim(), `${experiment.id} stage ${lang}`).not.toBe('')
      }
      expect(renderToStaticMarkup(createElement(LabArt, { id: experiment.id })), experiment.id).toContain('<svg')
    }
  })

  it('can all be reached through the Lab: the previous/next walk visits every one, and the overview links each once', () => {
    const visited = new Set<LabId>()
    let current: LabId = SIX[0]
    for (let step = 0; step < 6; step += 1) {
      visited.add(current)
      current = neighbourExperiment(current, 1)!.id
    }
    expect([...visited].sort()).toEqual([...SIX].sort())
    expect(current).toBe(SIX[0])
    expect(neighbourExperiment('generative-objects', 1)?.id).toBe('particle-universe')
    expect(neighbourExperiment('particle-universe', -1)?.id).toBe('generative-objects')

    const html = flattenKinetic(
      renderToStaticMarkup(
        createElement(
          ThemeContext.Provider,
          { value: { theme: 'dark', setTheme: () => undefined, toggleTheme: () => undefined, followSystem: () => undefined } },
          createElement(MemoryRouter, { initialEntries: ['/en/lab'] }, createElement(I18nContext.Provider, { value: { lang: 'en', t: dictionaries.en } }, createElement(Discovery))),
        ),
      ),
    )
    for (const id of SIX) expect(html.split(`href="/en${experimentPath(id)}"`).length - 1, id).toBe(1)
    expect(html.match(/<article\b/g)).toHaveLength(6)
  })

  it('are counted as six in the words that count them (no "five" left in the Lab\'s copy)', () => {
    const copy = `${readFileSync(join(__dirname, 'page', 'pageText.ts'), 'utf8')} ${readFileSync(join(SRC, 'content', 'labMeta.ts'), 'utf8')}`
    expect(copy).not.toMatch(/\bFive\b|\bvijf\b|\bÖt (interaktív|környezet|játszótér)|Az öt élmény|De vijf/)
  })
})

describe('Generative Objects is procedural and local', () => {
  const files = sourcesOf(GENERATIVE)

  it('has the procedural parts and none of the old AI parts', () => {
    const names = files.map((entry) => entry.file.replace(`${GENERATIVE}\\`, '').replace(`${GENERATIVE}/`, '').replace(/\\/g, '/'))
    for (const expected of ['compose.ts', 'interpret.ts', 'lexicon.ts', 'ideas.ts', 'spec.ts', 'GenerativeObjects.tsx', 'GenerativeScene.tsx', 'parts/kit.ts']) expect(names, expected).toContain(expected)
    for (const forbidden of ['aiClient.ts', 'genStore.ts', 'voice.ts', 'VoiceInput.tsx', 'glb.ts', 'keep.ts', 'creation.ts', 'genText.ts']) expect(names, forbidden).not.toContain(forbidden)
  })

  it('imports no AI client, no external service, no network call and no microphone', () => {
    for (const { file, text } of files) {
      expect(text, file).not.toMatch(/from\s+['"][^'"]*(aiClient|anthropic|openai|meshy|tripo|@ai-sdk|\/server\/|ai3d)[^'"]*['"]/i)
      expect(text, file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|SpeechRecognition|webkitSpeechRecognition|getUserMedia|MediaRecorder/)
      expect(text, file).not.toMatch(/['"`]\/api\//)
      expect(text, file).not.toMatch(/\b(meshy|tripo)\b/i)
    }
  })

  it('has no AI generation anywhere else in the Lab or the website\'s client code, and no server folder for it', () => {
    const lab = sourcesOf(join(SRC, 'components', 'lab')).filter((entry) => !/labScope|\.test\./.test(entry.file))
    for (const { file, text } of lab) expect(text, file).not.toMatch(/\b(meshy|tripo|text-to-3d|ai3d)\b/i)
    expect(() => statSync(join(SRC, '..', 'server', 'ai3d'))).toThrow()
    const manifest = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; scripts?: Record<string, string> }
    expect(Object.keys(manifest.dependencies ?? {}).filter((name) => /meshy|tripo/i.test(name))).toEqual([])
    expect(Object.keys(manifest.scripts ?? {}).filter((name) => /ai3d/i.test(name))).toEqual([])
  })

  it('says, in all three languages, that it is local and has no AI', () => {
    for (const lang of LANGUAGES) {
      expect(experimentText['generative-objects'].description[lang].length).toBeGreaterThan(80)
    }
    expect(experimentText['generative-objects'].description.en).toMatch(/no AI/)
    expect(experimentText['generative-objects'].description.hu).toMatch(/mesterséges intelligencia nincs/)
    expect(experimentText['generative-objects'].description.nl).toMatch(/geen AI/)
    expect(experiments.find((e) => e.id === 'generative-objects')?.tech.join(' ')).toMatch(/Procedural/)
  })
})

describe('the NFSU2 racing screen is a hidden Easter egg, not a seventh experience', () => {
  it('is in none of the lists, has no page and no route of its own', () => {
    expect(experiments.some((e) => /nfsu|racing/i.test(`${e.id} ${e.name}`))).toBe(false)
    expect(PAGES.some((page) => /nfsu|racing/i.test(page.path))).toBe(false)
    expect(Object.keys(EXPERIMENT_COMPONENTS).some((id) => /nfsu|racing/i.test(id))).toBe(false)
    expect(experiments).toHaveLength(6)
  })

  it('is still the same hidden link, opened by the red full stop or by typing it', () => {
    expect(NFSU2.url).toBe('https://nfsu2.xyz/')
  })
})
