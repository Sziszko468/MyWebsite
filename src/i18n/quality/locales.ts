import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import type { Finding } from './types'

/**
 * Wrong or unplanned references to a language (PROMPT 23), read from the real syntax tree of the source:
 *
 *   - `lang="de"`, `hrefLang="fr"`, `hreflang: 'xx'`: a language the site does not have, in a place a browser or a crawler reads;
 *   - `/de/…` or `'fr'` written as an address or compared with a language: a route that does not exist;
 *   - `Intl.DateTimeFormat(lang, …)`, `toLocaleString('en-US')`, `Intl.NumberFormat('en')`: a locale that is not the language's one tag
 *     (`LOCALE_TAGS` in i18n/config.ts). A bare `en` writes American dates on a British-English site, and two places that each
 *     guess a locale drift apart (it happened: "October 28, 2026" next to "28 October 2026").
 *
 * The three languages and `x-default` are the only valid values. An exception is written into `LOCALE_ALLOWED` with its reason.
 */

const LANGUAGES = new Set(['hu', 'en', 'nl'])
const VALID_HREFLANG = new Set([...LANGUAGES, 'x-default'])
/** Codes of languages a developer might type by mistake for a site that has three. A closed list: short words such as `ai`, `io` or `db` are not languages. */
const OTHER_LANGUAGES = ['de', 'fr', 'es', 'it', 'pt', 'pl', 'cs', 'sk', 'ro', 'ru', 'sv', 'da', 'fi', 'tr', 'ja', 'zh', 'ko', 'ar', 'el', 'bg', 'hr', 'sl', 'sr', 'uk']
const OTHER = new Set(OTHER_LANGUAGES)
const ADDRESS = new RegExp(`^/(${OTHER_LANGUAGES.join('|')})(/|$)`)

/** The full tags the site's `Intl` calls may name. */
const SITE_LOCALES = new Set(['hu-HU', 'en-GB', 'nl-NL'])
const INTL_CONSTRUCTORS = new Set(['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'ListFormat'])
const LOCALE_METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'])

/**
 * Exceptions, `<file>:<text>`, each with the reason. A locale that follows the visitor's own browser is not a reference to a language of
 * the site: it is the visitor's own setting, and says nothing about the page's language.
 */
export const LOCALE_ALLOWED: Readonly<Record<string, string>> = {}

/** The files the scan reads: the website, the administration, the edge Worker and the backend. Tests and generated files are not read. */
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

/** Whether an expression is the bare language variable (`lang`, `language`, `props.lang`): a language code, not a locale tag. */
function isBareLanguage(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) return /^(lang|language|code|locale)$/.test(node.text)
  if (ts.isPropertyAccessExpression(node)) return /^(lang|language)$/.test(node.name.text)
  return false
}

export function scanLocaleReferences(roots: ReadonlyArray<{ directory: string; base: string }>): Finding[] {
  const findings: Finding[] = []
  for (const { directory, base } of roots) {
    for (const file of sources(directory)) {
      const name = relative(base, file).split(sep).join('/')
      const text = readFileSync(file, 'utf8')
      const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const report = (node: ts.Node, message: string, sample: string) => {
        if (`${name}:${sample}` in LOCALE_ALLOWED) return
        const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree))
        findings.push({ rule: 'locale', severity: 'error', id: `${name}:${line + 1}`, message, sample })
      }

      const visit = (node: ts.Node) => {
        // lang="xx" / hrefLang="xx" on an element
        if (ts.isJsxAttribute(node) && /^(lang|hrefLang|hreflang)$/.test(node.name.getText(tree))) {
          const value = node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text : null
          if (value !== null && !VALID_HREFLANG.has(value.toLowerCase())) report(node, `${node.name.getText(tree)}="${value}" is not one of the site's languages (hu, en, nl)`, value)
        }
        // { hreflang: 'xx' }
        if (ts.isPropertyAssignment(node) && /^(hreflang|hrefLang)$/.test(node.name.getText(tree)) && ts.isStringLiteral(node.initializer)) {
          const value = node.initializer.text
          if (!VALID_HREFLANG.has(value.toLowerCase())) report(node, `hreflang '${value}' is not one of the site's languages (hu, en, nl, x-default)`, value)
        }
        // lang === 'de', lang !== 'fr'
        if (ts.isBinaryExpression(node) && /^(===|!==|==|!=)$/.test(node.operatorToken.getText(tree))) {
          const [left, right] = [node.left, node.right]
          const literal = ts.isStringLiteral(right) ? right : ts.isStringLiteral(left) ? left : null
          const other = literal === right ? left : right
          if (literal && isBareLanguage(other) && OTHER.has(literal.text)) report(node, `a language the site does not have ('${literal.text}') compared with a language`, literal.text)
        }
        // '/de/…' as an address
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ADDRESS.test(node.text)) {
          report(node, `an address in a language the site does not have: ${node.text}`, node.text)
        }
        // Intl.DateTimeFormat(<bare language>) / Intl.NumberFormat('en-US')
        if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
          const callee = node.expression
          const first = node.arguments?.[0]
          const intl = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'Intl' && INTL_CONSTRUCTORS.has(callee.name.text)
          const method = ts.isPropertyAccessExpression(callee) && LOCALE_METHODS.has(callee.name.text)
          if ((intl || method) && first) {
            if (ts.isStringLiteral(first) && !SITE_LOCALES.has(first.text)) report(first, `locale '${first.text}' is not one of the site's tags (hu-HU, en-GB, nl-NL): use LOCALE_TAGS[lang]`, first.text)
            else if (isBareLanguage(first) && !(ts.isIdentifier(first) && first.text === 'locale')) report(first, 'a bare language code as the locale: use LOCALE_TAGS[lang] (a bare "en" writes American dates)', first.getText(tree))
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(tree)
    }
  }
  return findings
}
