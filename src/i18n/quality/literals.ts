import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import type { Finding } from './types'

/**
 * Sentences written into code that is not a React component (PROMPT 23). `hardcoded.ts` reads what a component renders; this reads the
 * rest of the website's source (`.ts` modules and the strings in a component's logic) for a string that looks like a sentence a visitor
 * would read: three words or more, starting with a letter, no code in it. Such a string is the same in every language, which on a
 * three-language site is wrong in two of them, and no other check in this folder would see it.
 *
 * Not read: the texts' own homes (`content/`, `i18n/locales/`, which the inventory checks), the administration, tests, the design-system
 * page. A string inside `tri(...)` is a text with its three versions and is skipped; so are error messages for developers
 * (`throw new Error(...)`), `console` calls, imports and types.
 */

const SKIPPED = ['admin/', 'i18n/locales/', 'i18n/quality/', 'test/', 'content/']

/**
 * Sentence-like strings that may stay, `<file>:<text>`, each with the reason. A sentence a visitor reads in their own language never
 * belongs here: it goes into a dictionary or a `tri()`.
 */
export const LITERAL_ALLOWED: Readonly<Record<string, string>> = {
  'components/hero/threeConsole.ts:THREE.Clock: This module has been deprecated': 'the text of a Three.js warning that a development console filter matches; never shown to a visitor',
  'components/lab/experiments/type/TypeScene.tsx:Georgia, "Times New Roman", serif': 'a CSS font stack',
  'components/lab/experiments/type/TypeScene.tsx:ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace': 'a CSS font stack',
  'seo/head.ts:index, follow, max-image-preview:large': 'the value of a robots meta tag: a directive for crawlers, not words',
}

/** Whole files of words that are not output: the vocabulary the Generative Objects experience READS (input), whose three-language names are checked where they are shown. */
const INPUT_VOCABULARY = new Set(['components/lab/experiments/generative/lexicon.ts'])

/** Files that hold sentences in three languages as plain records (not `tri()`), which `inventory.ts` reads and checks. */
const READ_BY_INVENTORY = new Set(['components/lab/experiments/generative/examples.ts'])

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

function looksLikeSentence(text: string): boolean {
  const clean = text.trim()
  if (clean.length < 14) return false
  if (clean.split(/\s+/).length < 3) return false
  if (!/^[A-ZÁÉÍÓÖŐÚÜŰa-z]/.test(clean)) return false
  if (/[{}<>=;|\\/$#@]|=>|\.\w+\(|^[a-z]+(-[a-z]+)+$/.test(clean)) return false
  const letters = (clean.match(/\p{L}/gu) ?? []).length
  return letters / clean.length > 0.7
}

export function scanLiterals(srcDirectory: string): Finding[] {
  const findings: Finding[] = []
  for (const file of sources(srcDirectory)) {
    const name = relative(srcDirectory, file).split(sep).join('/')
    if (SKIPPED.some((prefix) => name.startsWith(prefix)) || name === 'pages/DesignSystemPage.tsx' || INPUT_VOCABULARY.has(name) || READ_BY_INVENTORY.has(name)) continue
    const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

    const visit = (node: ts.Node) => {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && looksLikeSentence(node.text) && !isExempt(node, tree)) {
        const clean = node.text.replace(/\s+/g, ' ').trim()
        if (!(`${name}:${clean}` in LITERAL_ALLOWED)) {
          const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree))
          findings.push({ rule: 'literal', severity: 'error', id: `${name}:${line + 1}`, message: 'a sentence written in code, not in a dictionary or a tri() text', sample: clean })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  return findings
}

/** A string that is not a visitor's text: inside `tri()`, a developer's error or log, an import, a type, or an attribute that is not read by a person. */
function isExempt(node: ts.Node, tree: ts.SourceFile): boolean {
  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (ts.isCallExpression(parent)) {
      const callee = parent.expression.getText(tree)
      if (/^(tri|console\.\w+|require|describe|it|expect|fill|String|Error|assert\w*|String\.raw)$/.test(callee) || /\.(log|warn|error|info|debug)$/.test(callee)) return true
    }
    if (ts.isNewExpression(parent) && /Error/.test(parent.expression.getText(tree))) return true
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isTypeNode(parent) || ts.isLiteralTypeNode(parent)) return true
    if (ts.isJsxAttribute(parent) && !/^(aria-label|title|alt|placeholder)$/.test(parent.name.getText(tree))) return true
  }
  return false
}
