import type { Architecture } from '../../content/projectDetails/types'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { Reveal } from '../motion/Reveal'
import { COMPLETION, weaker } from './architecture'
import { StatusMark } from './StatusMark'
import styles from './ArchitectureDiagram.module.scss'

/**
 * The system as layers, top to bottom, with each part marked as built, partly working or planned,
 * and below it every connection written out, which is also the text version of the picture. It is
 * drawn only from the project's own data: a part or a link that is a plan says so, in a word and a
 * dashed outline, and nothing is shown that the project does not have or does not mark as planned.
 */
export function ArchitectureDiagram({ architecture }: { architecture: Architecture }) {
  const { lang, t } = useI18n()
  const nodes = new Map(architecture.tiers.flatMap((tier) => tier.nodes.map((node) => [node.id, node] as const)))
  const status = t.project.architecture.status

  return (
    <figure className={styles.figure}>
      <figcaption className="visually-hidden">{t.project.architecture.label}</figcaption>

      <ol className={styles.tiers} aria-label={t.project.architecture.label}>
        {architecture.tiers.map((tier, position) => (
          <li key={tier.id} className={styles.tier}>
            <Reveal className={styles.tierInner} delay={Math.min(position, 4) * 60}>
              <h3 className={styles.tierLabel}>{tier.label[lang]}</h3>
              <ul className={styles.nodes}>
                {tier.nodes.map((node) => (
                  <li key={node.id} className={cx(styles.node, styles[node.status])}>
                    <StatusMark status={COMPLETION[node.status]} label={status[node.status]} />
                    <strong className={styles.nodeLabel}>{node.label}</strong>
                    {node.detail && <span className={styles.nodeDetail}>{node.detail[lang]}</span>}
                  </li>
                ))}
              </ul>
            </Reveal>
          </li>
        ))}
      </ol>

      <div className={styles.connections}>
        <h3 className={styles.connectionsTitle}>{t.project.architecture.connections}</h3>
        <ul>
          {architecture.links.map((link) => {
            const from = nodes.get(link.from)
            const to = nodes.get(link.to)
            if (!from || !to) return null
            const linkStatus = link.status ?? weaker(from.status, to.status)
            return (
              <li key={`${link.from}-${link.to}`} className={cx(styles.link, linkStatus !== 'built' && styles.softLink)}>
                <span className={styles.ends}>
                  <span>{from.label}</span>
                  <span className={styles.arrow}>→</span>
                  <span>{to.label}</span>
                </span>
                <span className={styles.linkLabel}>{link.label[lang]}</span>
                {linkStatus !== 'built' && <StatusMark status={COMPLETION[linkStatus]} label={status[linkStatus]} />}
              </li>
            )
          })}
        </ul>
      </div>

      {architecture.note && <figcaption className={styles.note}>{architecture.note[lang]}</figcaption>}
    </figure>
  )
}
