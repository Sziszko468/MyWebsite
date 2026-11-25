import { useId, type ReactNode } from 'react'
import { useArchive } from '../archive/useArchive'
import styles from '../archive/CommandCenter.module.scss'
import { SystemBar } from '../archive/SystemBar'
import { EntryVisual } from '../archive/EntryVisual'
import { TOOL_PATH, type ArchiveKind } from '../archive/model'
import { Badge } from '../components/Badge/Badge'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { useLocalized } from '../components/lab/core/useLabText'
import { LabArt } from '../components/lab/ui/LabArt'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { Reveal } from '../components/motion/Reveal'
import { usePointerField } from '../components/motion/usePointerField'
import { PageHero, HeroLine } from '../components/PageHero/PageHero'
import { archiveText } from '../content/archive/text'
import { experimentPath, playableExperiments } from '../content/lab'
import { playgroundEntry } from '../content/playground/entry'
import { demoEntry } from '../content/demos/entry'
import { serviceAreas } from '../content/services/areas'
import { demoPath } from '../demos/ids'
import { LANGUAGES } from '../i18n/config'
import { useI18n } from '../i18n/useI18n'
import { SHOP_PATHS, servicePath } from '../shop/paths'
import { fill, pad } from '../utils/format'

/** A band of the center: its number, its heading and what is in it. */
function Band({ id, number, title, text, action, children }: { id: string; number: string; title: string; text?: string; action?: { to: string; label: string }; children: ReactNode }) {
  const headingId = useId()
  return (
    <section id={id} className={styles.band} aria-labelledby={headingId}>
      <Container size="wide">
        <Reveal>
          <header className={styles.bandHead}>
            <span className={styles.bandNumber} aria-hidden="true">
              {number}
            </span>
            <div className={styles.bandText}>
              <h2 id={headingId} className={styles.bandTitle}>
                {title}
              </h2>
              {text && <p className={styles.bandLead}>{text}</p>}
            </div>
            {action && (
              <Button to={action.to} variant="secondary" size="sm" arrow>
                {action.label}
              </Button>
            )}
          </header>
        </Reveal>
        {children}
      </Container>
    </section>
  )
}

/**
 * The Command Center (PROMPT 37), at /command-center: the way into everything the website shows. It holds no content of its own: what it lists (the published projects, the
 * demos that are switched on, the six experiences of the Lab, the design tool, the services) is read from where each already lives, with the numbers of what is really there.
 */
export function CommandCenterPage() {
  const words = useLocalized(archiveText)
  const t = words.command
  const demoWords = useLocalized(demoEntry)
  const tool = useLocalized(playgroundEntry)
  const { lang, t: site } = useI18n()
  const { entries, projects, demos, loading } = useArchive()
  const map = usePointerField<HTMLUListElement>()
  const mapId = useId()

  const count = (kind: ArchiveKind) => entries.filter((entry) => entry.kind === kind).length
  const featured = projects.filter((project) => project.featured)
  const shownProjects = (featured.length > 0 ? featured : projects).slice(0, 4)
  const projectName = (slug: string) => projects.find((project) => project.slug === slug)?.name ?? slug

  const sectors = [
    { id: 'archive', to: '/archive', title: t.map.archive.title, text: t.map.archive.text, count: loading ? null : entries.length, label: t.map.archive.count },
    { id: 'work', to: '/work', title: t.map.work.title, text: t.map.work.text, count: loading ? null : count('project'), label: t.map.work.count },
    { id: 'demos', to: '/command-center#demos', title: t.map.demos.title, text: t.map.demos.text, count: loading ? null : count('demo'), label: t.map.demos.count },
    { id: 'lab', to: '/lab', title: t.map.lab.title, text: t.map.lab.text, count: playableExperiments.length, label: t.map.lab.count },
    { id: 'tool', to: TOOL_PATH, title: t.map.tool.title, text: t.map.tool.text, count: 1, label: t.map.tool.count },
    { id: 'services', to: '/services', title: t.map.services.title, text: t.map.services.text, count: serviceAreas.length, label: t.map.services.count },
    { id: 'people', to: '/command-center#people', title: t.map.people.title, text: t.map.people.text, count: 2, label: t.map.people.count },
  ] as const

  return (
    <div className={styles.page} data-command-center="">
      <PageHero
        compact
        eyebrow={t.eyebrow}
        title={
          <>
            <HeroLine>{t.titleA}</HeroLine>
            <HeroLine accent>{t.titleB}</HeroLine>
          </>
        }
        lead={t.lead}
        actions={
          <Button to="/archive" variant="primary" arrow>
            {t.enter}
          </Button>
        }
        seed={73}
      >
        <p className={styles.line}>{fill(t.line, { entries: loading ? '…' : entries.length, languages: LANGUAGES.length })}</p>
      </PageHero>
      <SystemBar current="command" />

      <section className={styles.mapBand} aria-labelledby={mapId}>
        <Container size="wide">
          <header className={styles.mapHead}>
            <h2 id={mapId} className={styles.bandTitle}>
              {t.map.title}
            </h2>
            <p className={styles.bandLead}>{t.map.lead}</p>
          </header>
          <ul ref={map} className={styles.map}>
            {sectors.map((sector, index) => (
              <li key={sector.id} className={styles.sector} data-sector={sector.id}>
                <LocalizedLink to={sector.to} className={styles.sectorLink}>
                  <span className={styles.sectorNumber} aria-hidden="true">
                    {pad(index + 1)}
                  </span>
                  <span className={styles.sectorCount} aria-hidden="true">
                    {sector.count === null ? '…' : pad(sector.count)}
                  </span>
                  <span className={styles.sectorTitle}>{sector.title}</span>
                  <span className={styles.sectorText}>{sector.text}</span>
                  <span className={styles.sectorTotal}>{sector.count === null ? words.archive.loading : fill(sector.label, { count: sector.count })}</span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <Band id="featured" number="01" title={t.featured.title} action={{ to: '/work', label: t.featured.all }}>
        {loading && shownProjects.length === 0 ? (
          <p className={styles.note}>{words.archive.loading}</p>
        ) : (
          <ol className={styles.featured}>
            {shownProjects.map((project, index) => (
              <li key={project.slug} className={styles.feature}>
                <Reveal variant={index % 2 === 0 ? 'left' : 'right'} className={styles.featurePicture}>
                  <EntryVisual visual={project.image ? { type: 'image', ...project.image } : { type: 'mockup', kind: project.mockup }} />
                </Reveal>
                <div className={styles.featureBody}>
                  <p className={styles.featureMeta}>
                    <span aria-hidden="true">{pad(index + 1)}</span>
                    <Badge status={project.status} />
                  </p>
                  <h3 className={styles.featureName}>{project.detailPath ? <LocalizedLink to={project.detailPath}>{project.name}</LocalizedLink> : project.name}</h3>
                  <p className={styles.featureText}>{project.description}</p>
                  {!project.detailPath && <p className={styles.note}>{site.home.work.noDetails}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Band>

      <Band id="lab" number="02" title={t.lab.title} text={t.lab.text} action={{ to: '/lab', label: t.lab.all }}>
        <ol className={styles.lab}>
          {playableExperiments.map((experiment) => (
            <li key={experiment.id} className={styles.experiment}>
              <LocalizedLink to={experimentPath(experiment.id)} className={styles.experimentLink}>
                <span className={styles.experimentArt} aria-hidden="true">
                  <LabArt id={experiment.id} />
                </span>
                <span className={styles.experimentNumber} aria-hidden="true">
                  {experiment.number}
                </span>
                <span className={styles.experimentName}>{experiment.name}</span>
                <span className={styles.experimentLine}>{experiment.tagline[lang]}</span>
              </LocalizedLink>
            </li>
          ))}
        </ol>
        <p className={styles.toolLine}>
          {tool.kicker}: <LocalizedLink to={TOOL_PATH}>{tool.title}</LocalizedLink>
        </p>
      </Band>

      <Band id="demos" number="03" title={t.demos.title} text={t.demos.text}>
        {demos.length === 0 ? (
          <p className={styles.note}>{loading ? words.archive.loading : t.demos.none}</p>
        ) : (
          <ul className={styles.rows}>
            {demos.map((demo) => (
              <li key={demo.slug}>
                <LocalizedLink to={demoPath(demo.slug)} className={styles.rowLink}>
                  <span className={styles.rowName}>
                    {projectName(demo.slug)}: {demoWords.kinds[demo.type].name}
                  </span>
                  <span className={styles.rowText}>{demoWords.kinds[demo.type].summary}</span>
                  <span aria-hidden="true" className={styles.rowArrow}>
                    →
                  </span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        )}
      </Band>

      <Band id="services" number="04" title={t.services.title} action={{ to: '/services', label: t.services.shop }}>
        <ul className={styles.rows}>
          {serviceAreas.map((area) => (
            <li key={area.id}>
              <LocalizedLink to={servicePath(area.id)} className={styles.rowLink}>
                <span className={styles.rowName}>{area.name[lang]}</span>
                <span className={styles.rowText}>{area.summary[lang]}</span>
                <span aria-hidden="true" className={styles.rowArrow}>
                  →
                </span>
              </LocalizedLink>
            </li>
          ))}
          <li>
            <LocalizedLink to={SHOP_PATHS.fullExperience} className={styles.rowLink}>
              <span className={styles.rowName}>{t.services.full}</span>
              <span aria-hidden="true" className={styles.rowArrow}>
                →
              </span>
            </LocalizedLink>
          </li>
        </ul>
      </Band>

      <Band id="people" number="05" title={t.people.title}>
        <ul className={styles.doors}>
          <li>
            <LocalizedLink to="/about" className={styles.door}>
              {t.people.about}
              <span aria-hidden="true">→</span>
            </LocalizedLink>
          </li>
          <li>
            <LocalizedLink to="/contact" className={styles.door}>
              {t.people.contact}
              <span aria-hidden="true">→</span>
            </LocalizedLink>
          </li>
        </ul>
      </Band>
    </div>
  )
}

export default CommandCenterPage
