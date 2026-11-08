import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * The few things an answer needs, drawn as React elements (never as HTML): paragraphs, lists, bold, inline code and links. A
 * link is a page of this site (a path that starts with a language, such as /en/services/packages/grow) or an https address;
 * anything else stays plain text, so an answer cannot carry a `javascript:` address, a picture or markup of any kind.
 */

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\/(?:hu|en|nl)\/[A-Za-z0-9\-._~/#?=&%]*[A-Za-z0-9\-_~/])/g

const isPath = (value: string): boolean => /^\/(?:hu|en|nl)\/[A-Za-z0-9\-._~/#?=&%]*$/.test(value)
const isSecure = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let index = 0
  for (const match of text.matchAll(INLINE)) {
    const token = match[0]
    const at = match.index ?? 0
    if (at > last) nodes.push(text.slice(last, at))
    const key = `${keyBase}-${index++}`
    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('[')) {
      const close = token.indexOf('](')
      const label = token.slice(1, close)
      const target = token.slice(close + 2, -1)
      nodes.push(link(target, label, key))
    } else nodes.push(link(token, token, key))
    last = at + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function link(target: string, label: ReactNode, key: string): ReactNode {
  if (isPath(target)) return <Link key={key} to={target}>{label}</Link>
  if (isSecure(target)) return <a key={key} href={target} target="_blank" rel="noopener noreferrer">{label}</a>
  return <Fragment key={key}>{label}</Fragment>
}

export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n')
        if (lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
          return (
            <ul key={blockIndex}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inline(line.replace(/^\s*[-*•]\s+/, ''), `${blockIndex}-${lineIndex}`)}</li>
              ))}
            </ul>
          )
        }
        if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
          return (
            <ol key={blockIndex}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inline(line.replace(/^\s*\d+[.)]\s+/, ''), `${blockIndex}-${lineIndex}`)}</li>
              ))}
            </ol>
          )
        }
        return (
          <p key={blockIndex}>
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {inline(line, `${blockIndex}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}
