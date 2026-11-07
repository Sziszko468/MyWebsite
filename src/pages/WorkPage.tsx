import { useId, useState } from 'react'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { ProjectMockup } from '../components/home/ProjectMockup'
import { Reveal } from '../components/motion/Reveal'
import { PageHero, HeroLine } from '../components/PageHero/PageHero'
import { ProjectCard } from '../components/ProjectCard/ProjectCard'
import { Section } from '../components/Section/Section'
import { useI18n } from '../i18n/useI18n'
import { useReducedMotion } from '../components/hero/capabilities'
import { useCards } from '../projects/useCards'
import { fill, pad } from '../utils/format'
import styles from './WorkPage.module.scss'

/**
 * The portfolio: every published project, in the administrator's order, filtered by the categories the administrator
 * configured. It reads the same list as the home page's Selected work (src/projects/), so there is one source for both. Each
 * card is marked with the state the project is really in; a project without a page of its own says so and links nowhere; a
 * demo link appears only once the owner marked it as checked. With `?preview=1` and an administrator's session, drafts are
 * shown too, each labelled as one.
 */
export function WorkPage() {
  const { t } = useI18n()
  const cards = useCards()
  const [filter, setFilter] = useState<string>('all')
  const titleId = useId()
  const reduced = useReducedMotion()

  const visible = filter === 'all' ? cards.all : cards.all.filter((card) => card.category === filter)
  const hero = t.workPage.hero

  return (
    <>
      <PageHero
        compact
        eyebrow={hero.eyebrow}
        title={
          <>
            <HeroLine>{hero.titleLine1}</HeroLine>
            <HeroLine accent>{hero.titleLine2}</HeroLine>
          </>
        }
        lead={hero.lead}
        seed={4}
      />

      <Section tone="base" labelledBy={titleId} className={styles.section}>
        <Container size="wide">
          <h2 id={titleId} className="visually-hidden">
            {t.nav.work}
          </h2>

          {cards.categories.length > 1 && (
            <div className={styles.filters} role="group" aria-label={t.workPage.filter.label}>
              {[{ key: 'all', label: t.workPage.filter.all }, ...cards.categories].map((category) => (
                <Button
                  key={category.key}
                  variant={filter === category.key ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={filter === category.key}
                  onClick={(event) => {
                    setFilter(category.key)
                    // On a phone the chips are one swipeable row: bring the chosen one (and its neighbours) into view.
                    event.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
                  }}
                >
                  {category.label}
                </Button>
              ))}
            </div>
          )}
          <p className={styles.count} role="status" aria-live="polite">
            {cards.loading ? '' : fill(t.workPage.count, { count: String(visible.length) })}
          </p>

          {cards.loading ? (
            <p className={styles.state} aria-busy="true">
              {t.workPage.loading}
            </p>
          ) : visible.length === 0 ? (
            <p className={styles.state}>{filter === 'all' ? t.workPage.empty : t.workPage.emptyFilter}</p>
          ) : (
            <ul className={styles.grid}>
              {visible.map((card, position) => (
                <li key={card.slug} className={styles.item} data-draft={card.draft || undefined}>
                  {card.draft && <span className={styles.draft}>{t.workPage.draft}</span>}
                  <Reveal className={styles.fill} delay={(position % 2) * 80}>
                    <ProjectCard
                      className={styles.card}
                      // A phone gets a rhythm: the first project and every third one is a full card, the rest are list rows
                      // (from `md` all are the same card of the grid).
                      layout={position % 3 === 0 ? 'default' : 'row'}
                      index={pad(position + 1)}
                      title={card.name}
                      category={card.label}
                      description={card.description}
                      status={card.status}
                      tags={card.tags}
                      image={card.image ? { ...card.image } : undefined}
                      media={<ProjectMockup kind={card.mockup} />}
                      mediaLabel={t.home.work.conceptSketch}
                      to={card.detailPath ?? undefined}
                      demoHref={card.demoUrl ?? undefined}
                      demoLabel={t.home.work.demo}
                      detailsLabel={t.home.work.details}
                      note={t.home.work.noDetails}
                    />
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>
    </>
  )
}

