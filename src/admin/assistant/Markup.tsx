import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import styles from '../styles/assistant.module.scss'

/**
 * The few things an answer needs, drawn as React elements and never as HTML (PROMPT 31): paragraphs, headings, lists, a small table, bold, inline code, and the REFERENCES of
 * records that a tool returned, which become links to the record's page in the administration. A reference that no tool returned stays plain text, so the assistant cannot
 * make a link of its own (not to an address, not to a page): the only links are the ones the server put in a tool's result, and `model.ts` has already checked their paths.
 */

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function inline(text: string, keyBase: string, links: ReadonlyMap<string, string>, pattern: RegExp | null): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let index = 0
  const source = pattern ? new RegExp(`(\\*\\*[^*\\n]+\\*\\*|\`[^\`\\n]+\`|(?<![A-Za-z0-9._-])(?:${pattern.source})(?![A-Za-z0-9._-]))`, 'g') : /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g
  for (const match of text.matchAll(source)) {
    const token = match[0]
    const at = match.index ?? 0
    if (at > last) nodes.push(text.slice(last, at))
    const key = `${keyBase}-${index++}`
    // A reference in bold is still a reference (the assistant often bolds the record it is talking about).
    if (token.startsWith('**')) nodes.push(<strong key={key}>{inline(token.slice(2, -2), `${key}s`, links, pattern)}</strong>)
    else if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    else {
      const path = links.get(token)
      nodes.push(path ? <Link key={key} to={path}>{token}</Link> : <Fragment key={key}>{token}</Fragment>)
    }
    last = at + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

const isBullet = (line: string): boolean => /^\s*[-*•]\s+/.test(line)
const isNumbered = (line: string): boolean => /^\s*\d{1,2}[.)]\s+/.test(line)
const isRow = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line)
const isRule = (line: string): boolean => /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(line)

export function RichText({ text, links }: { text: string; links: ReadonlyMap<string, string> }) {
  // Longest references first, so `CC-2026-000012` is never cut at `CC-2026-00001`.
  const references = [...links.keys()].sort((a, b) => b.length - a.length)
  const pattern = references.length > 0 ? new RegExp(references.map(escapeRegex).join('|')) : null
  const blocks = text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n')
        const key = `b${blockIndex}`
        if (lines.length > 1 && lines.every(isRow)) {
          const rows = lines.filter((line) => !isRule(line)).map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
          const [head, ...body] = rows
          return (
            <div key={key} className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {head.map((cell, index) => (
                      <th key={index} scope="col">
                        {inline(cell, `${key}h${index}`, links, pattern)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, index) => (
                        <td key={index}>{inline(cell, `${key}r${rowIndex}c${index}`, links, pattern)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (lines.every(isBullet)) {
          return (
            <ul key={key}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inline(line.replace(/^\s*[-*•]\s+/, ''), `${key}l${lineIndex}`, links, pattern)}</li>
              ))}
            </ul>
          )
        }
        if (lines.every(isNumbered)) {
          return (
            <ol key={key}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inline(line.replace(/^\s*\d{1,2}[.)]\s+/, ''), `${key}l${lineIndex}`, links, pattern)}</li>
              ))}
            </ol>
          )
        }
        // A heading line (`## Title`) is a bold line, not a heading level: the page's own headings keep their order.
        return (
          <p key={key}>
            {lines.map((line, lineIndex) => {
              const heading = /^#{1,4}\s+(.*)$/.exec(line)
              return (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  {heading ? <strong>{inline(heading[1], `${key}l${lineIndex}`, links, pattern)}</strong> : inline(line, `${key}l${lineIndex}`, links, pattern)}
                </Fragment>
              )
            })}
          </p>
        )
      })}
    </>
  )
}
