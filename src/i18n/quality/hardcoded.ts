import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import type { Finding } from './types'

/**
 * Customer-facing words written straight into a React component instead of the dictionaries or the content files. Such a
 * word is the same in every language, which on a three-language site means it is wrong in two of them, and it is invisible
 * to every other check in this folder. The scan reads the real syntax tree (not a regular expression), so it sees exactly
 * what React would render:
 *
 *   - text between tags:                <p>Send</p>
 *   - a string in braces:               <p>{'Send'}</p>
 *   - attributes a person reads:        aria-label, aria-placeholder, aria-description, placeholder, title, alt
 *
 * Only words count: a text without two letters in a row (×, /, 404, ·) is a symbol, not language. The administration
 * (`src/admin`, its own English/Hungarian interface for the owner), tests and the internal design-system page are not
 * the visitors' site and are skipped.
 */

const READ_ATTRIBUTES = new Set(['aria-label', 'aria-placeholder', 'aria-description', 'aria-roledescription', 'placeholder', 'title', 'alt'])

/**
 * Literal texts that may stay in a component, each with the reason. The key is `<file>:<text>`. A word a visitor reads in
 * their own language never belongs here; it goes into a dictionary.
 */
export const LITERAL_ALLOWED: Readonly<Record<string, string>> = {
  'components/ai/ChatSurface.tsx:CR': "the assistant's monogram, a decorative avatar hidden from screen readers",
  'components/contact/ProfileLinks.tsx:: src/config/site.ts': 'development-only note (SHOW_PENDING is import.meta.env.DEV): not part of the production site',
  'components/SiteFooter/SiteFooter.tsx:Placeholder: set it in src/config/site.ts': 'development-only tooltip (shown only while an entry is a placeholder, in development)',
  'components/home/LabSection.tsx:Create': "the Lab's English signature line, decorative art, the same in every language by design",
  'components/home/LabSection.tsx:Without': "the Lab's English signature line, decorative art, the same in every language by design",
  'components/home/LabSection.tsx:Limits.': "the Lab's English signature line, decorative art, the same in every language by design",
  'components/lab/ui/LabArt.tsx:Aa': 'a type specimen in a decorative picture',
  'components/lab/ui/LabArt.tsx:CREATE WITHOUT LIMITS.': "the Lab's English signature line, decorative art, the same in every language by design",
  'components/lab/artifacts/ArtifactsPanel.tsx:JSON': 'a file format name',
  'components/lab/artifacts/ArtifactsPanel.tsx:PNG': 'a file format name',
  'pages/ProjectPage.tsx:/admin': 'the address of the administration: a path, not a word',
}

function hasWords(text: string): boolean {
  return /[\p{L}]{2,}/u.test(text)
}

export function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return name.endsWith('.tsx') && !name.endsWith('.test.tsx') ? [path] : []
  })
}

export function scanHardcoded(srcDirectory: string): Finding[] {
  const findings: Finding[] = []
  for (const file of sourceFiles(srcDirectory)) {
    const name = relative(srcDirectory, file).split(sep).join('/')
    if (name.startsWith('admin/') || name.startsWith('test/') || name === 'pages/DesignSystemPage.tsx') continue
    const sourceText = readFileSync(file, 'utf8')
    const tree = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    const report = (node: ts.Node, text: string, where: string) => {
      const clean = text.replace(/\s+/g, ' ').trim()
      if (!hasWords(clean) || `${name}:${clean}` in LITERAL_ALLOWED) return
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree))
      findings.push({ rule: 'hardcoded', severity: 'error', id: `${name}:${line + 1}`, message: `${where} is written in the component, not in a dictionary`, sample: clean })
    }

    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) report(node, node.getText(tree), 'text')
      else if (ts.isJsxAttribute(node) && READ_ATTRIBUTES.has(node.name.getText(tree))) {
        const initializer = node.initializer
        if (initializer && ts.isStringLiteral(initializer)) report(initializer, initializer.text, `${node.name.getText(tree)} attribute`)
        if (initializer && ts.isJsxExpression(initializer) && initializer.expression && (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression))) {
          report(initializer, initializer.expression.text, `${node.name.getText(tree)} attribute`)
        }
      } else if (ts.isJsxExpression(node) && node.expression && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))) {
        const parent = node.parent
        if (ts.isJsxElement(parent) || ts.isJsxFragment(parent)) report(node, node.expression.text, 'text')
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  return findings
}
