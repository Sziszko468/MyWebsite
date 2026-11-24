import { memo, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import { Badge } from '../components/Badge/Badge'
import { Button } from '../components/Button/Button'
import { CheckboxField, SelectField, TextField } from '../components/form/fields'
import { ProjectMockup } from '../components/home/ProjectMockup'
import { LabChoice, LabToggle } from '../components/lab/ui/LabControls'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { MainNav } from '../components/MainNav/MainNav'
import { ProjectCard } from '../components/ProjectCard/ProjectCard'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { ServiceCard } from '../components/ServiceCard/ServiceCard'
import { useI18n } from '../i18n/useI18n'
import { previewTokens, type Palette, type PreviewTheme } from './color'
import { PreviewStage } from './PreviewStage'
import { Controls, LabSection, Preview, type LabProps, type PlaygroundText } from './parts'
import { COMPONENT_IDS, type Action, type ComponentId, type ComponentsState } from './state'
import styles from './ComponentLab.module.scss'

interface Props extends LabProps {
  components: ComponentsState
  /** Bumped by a reset: what a preview keeps for itself (typed text, a pressed button) starts over. */
  resetKey: number
  palette: Palette
  theme: PreviewTheme
  dispatch: Dispatch<Action>
  onReset: () => void
}

/** Where each component comes from in the project: the real ones, named, so nothing here is a copy. */
const SOURCES: Record<ComponentId, string> = {
  button: 'src/components/Button',
  badge: 'src/components/Badge',
  fields: 'src/components/form/fields.tsx',
  link: 'src/components/LocalizedLink · src/components/Button',
  navigation: 'src/components/MainNav',
  heading: 'src/components/SectionHeading',
  service: 'src/components/ServiceCard',
  project: 'src/components/ProjectCard',
}

type Patch = (patch: Record<string, string | boolean>) => void

interface PanelProps<K extends ComponentId> {
  value: ComponentsState[K]
  set: Patch
  t: PlaygroundText
}

const choice = <T extends string>(t: PlaygroundText, keys: readonly T[]) => keys.map((key) => ({ value: key, label: (t.components.choices as Record<string, string>)[key] ?? key }))

function ButtonControls({ value, set, t }: PanelProps<'button'>) {
  return (
    <>
      <LabChoice label={t.components.props.variant} value={value.variant} options={choice(t, ['primary', 'secondary', 'text'] as const)} columns={3} onChange={(variant) => set({ variant })} />
      <LabChoice label={t.components.props.size} value={value.size} options={choice(t, ['sm', 'md', 'lg'] as const)} columns={3} onChange={(size) => set({ size })} />
      <LabChoice label={t.components.props.status} value={value.status} options={choice(t, ['none', 'success', 'error'] as const)} columns={3} onChange={(status) => set({ status })} />
      <LabToggle label={t.components.props.arrow} checked={value.arrow} onChange={(arrow) => set({ arrow })} />
      <LabToggle label={t.components.props.fullWidth} checked={value.fullWidth} onChange={(fullWidth) => set({ fullWidth })} />
      <LabToggle label={t.components.props.disabled} checked={value.disabled} onChange={(disabled) => set({ disabled })} />
    </>
  )
}

/** The real Button. Pressing it shows its real loading state for a moment (a timer, cleared when the preview goes). */
function ButtonPreview({ value, t }: Pick<PanelProps<'button'>, 'value' | 't'>) {
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return (
    <div className={styles.center}>
      <Button
        variant={value.variant}
        size={value.size}
        arrow={value.arrow}
        fullWidth={value.fullWidth}
        disabled={value.disabled}
        loading={loading}
        loadingLabel={t.components.sample.loading}
        status={value.status === 'none' ? undefined : value.status}
        onClick={() => {
          setLoading(true)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setLoading(false), 1400)
        }}
      >
        {t.components.sample.press}
      </Button>
    </div>
  )
}

/** The four states of a project, as the site words them (its own status labels), for the badge and the project card. */
function useStatusOptions() {
  const { t } = useI18n()
  return [
    { value: 'live' as const, label: t.status.live },
    { value: 'demo' as const, label: t.status.demo },
    { value: 'in-progress' as const, label: t.status.inProgress },
    { value: 'concept' as const, label: t.status.concept },
  ]
}

function BadgeControls({ value, set, t }: PanelProps<'badge'>) {
  const statuses = useStatusOptions()
  return <LabChoice label={t.components.props.kind} value={value.kind} options={[...statuses, ...choice(t, ['neutral'] as const)]} columns={3} onChange={(kind) => set({ kind })} />
}

function BadgePreview({ value, t }: Pick<PanelProps<'badge'>, 'value' | 't'>) {
  return <div className={styles.center}>{value.kind === 'neutral' ? <Badge>{t.components.sample.badge}</Badge> : <Badge status={value.kind} />}</div>
}

function FieldsControls({ value, set, t }: PanelProps<'fields'>) {
  return (
    <>
      <LabToggle label={t.components.props.invalid} checked={value.invalid} onChange={(invalid) => set({ invalid })} />
      <LabToggle label={t.components.props.hint} checked={value.hint} onChange={(hint) => set({ hint })} />
      <LabToggle label={t.components.props.disabled} checked={value.disabled} onChange={(disabled) => set({ disabled })} />
    </>
  )
}

/** The real form fields. What is typed stays in this preview and goes nowhere. */
function FieldsPreview({ value, t }: Pick<PanelProps<'fields'>, 'value' | 't'>) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [topic, setTopic] = useState('')
  const [checked, setChecked] = useState(false)
  const error = value.invalid ? t.components.sample.invalid : undefined
  const hint = value.hint ? t.components.sample.hint : undefined
  const sample = t.components.sample
  return (
    <div className={styles.fields}>
      <TextField label={sample.name} hint={hint} error={error} value={name} disabled={value.disabled} maxLength={80} autoComplete="off" onChange={(event) => setName(event.currentTarget.value)} />
      <SelectField
        label={sample.topic}
        hint={hint}
        error={error}
        value={topic}
        placeholder={sample.topicPlaceholder}
        options={[
          { value: 'website', label: sample.topics.website },
          { value: 'app', label: sample.topics.app },
        ]}
        onChange={setTopic}
      />
      <TextField multiline rows={3} label={sample.message} hint={hint} error={error} value={message} disabled={value.disabled} maxLength={300} counter={`${message.length} / 300`} onChange={(event) => setMessage(event.currentTarget.value)} />
      <CheckboxField label={sample.check} checked={checked} error={error} onChange={setChecked} />
    </div>
  )
}

function LinkControls({ value, set, t }: PanelProps<'link'>) {
  return <LabToggle label={t.components.props.underline} checked={value.underline} onChange={(underline) => set({ underline })} />
}

function LinkPreview({ value, t }: Pick<PanelProps<'link'>, 'value' | 't'>) {
  const [before, after] = t.components.sample.linkSentence.split('{link}')
  return (
    <p className={styles.sentence}>
      {before}
      <LocalizedLink to="/lab" style={{ textDecoration: value.underline ? 'underline' : 'none' }}>
        {t.components.sample.linkText}
      </LocalizedLink>
      {after}{' '}
      <Button variant="text" to="/lab" arrow>
        {t.components.sample.textButton}
      </Button>
    </p>
  )
}

function NavigationControls({ value, set, t }: PanelProps<'navigation'>) {
  return <LabChoice label={t.components.props.navVariant} value={value.variant} options={choice(t, ['bar', 'footer'] as const)} columns={2} onChange={(variant) => set({ variant })} />
}

function HeadingControls({ value, set, t }: PanelProps<'heading'>) {
  return (
    <>
      <LabChoice label={t.components.props.headingSize} value={value.size} options={choice(t, ['default', 'large', 'stacked'] as const)} columns={3} onChange={(size) => set({ size })} />
      <LabToggle label={t.components.props.description} checked={value.description} onChange={(description) => set({ description })} />
      <LabToggle label={t.components.props.index} checked={value.index} onChange={(index) => set({ index })} />
    </>
  )
}

function ServiceControls({ value, set, t }: PanelProps<'service'>) {
  return (
    <>
      <LabChoice label={t.components.props.price} value={value.price} options={choice(t, ['quote', 'tbd'] as const)} columns={2} onChange={(price) => set({ price })} />
      <LabToggle label={t.components.props.featured} checked={value.featured} onChange={(featured) => set({ featured })} />
      <LabToggle label={t.components.props.action} checked={value.action} onChange={(action) => set({ action })} />
    </>
  )
}

function ProjectControls({ value, set, t }: PanelProps<'project'>) {
  const statuses = useStatusOptions()
  return (
    <>
      <LabChoice label={t.components.props.layout} value={value.layout} options={choice(t, ['default', 'lead', 'offset', 'compact', 'wide', 'row'] as const)} columns={3} onChange={(layout) => set({ layout })} />
      <LabChoice label={t.components.props.kind} value={value.status} options={statuses} columns={2} onChange={(status) => set({ status })} />
      <LabToggle label={t.components.props.link} checked={value.link} onChange={(link) => set({ link })} />
    </>
  )
}

function ProjectPreview({ value, t }: Pick<PanelProps<'project'>, 'value' | 't'>) {
  const { t: site } = useI18n()
  return (
    <div className={styles.projectFrame} data-layout={value.layout}>
      <ProjectCard
        title={t.components.sample.projectTitle}
        category={t.components.sample.projectCategory}
        status={value.status}
        tags={['React', 'TypeScript']}
        description={t.components.sample.projectText}
        media={<ProjectMockup kind="finance" />}
        mediaLabel={site.home.work.conceptSketch}
        index="01"
        to={value.link ? '/work' : undefined}
        detailsLabel={site.home.work.details}
        note={t.components.sample.projectNote}
        layout={value.layout}
        headingLevel={3}
      />
    </div>
  )
}

/**
 * The component laboratory (PROMPT 36): the website's own components, picked from a short list, with their real variants and properties, drawn on a stage that carries the
 * visitor's colours and theme. Each preview is the real component from `src/components`, named with its source; the only things made here are the sample words and the
 * control panels. A link in a preview never leaves the page (see PreviewStage).
 */
export const ComponentLab = memo(function ComponentLab({ components, resetKey, palette, theme, dispatch, onReset, t }: Props) {
  const id = components.selected
  const tokens = useMemo(() => previewTokens(palette, theme), [palette, theme])
  const set: Patch = (patch) => dispatch({ type: 'components/set', id, patch })

  const controls = () => {
    switch (id) {
      case 'button': return <ButtonControls value={components.button} set={set} t={t} />
      case 'badge': return <BadgeControls value={components.badge} set={set} t={t} />
      case 'fields': return <FieldsControls value={components.fields} set={set} t={t} />
      case 'link': return <LinkControls value={components.link} set={set} t={t} />
      case 'navigation': return <NavigationControls value={components.navigation} set={set} t={t} />
      case 'heading': return <HeadingControls value={components.heading} set={set} t={t} />
      case 'service': return <ServiceControls value={components.service} set={set} t={t} />
      case 'project': return <ProjectControls value={components.project} set={set} t={t} />
    }
  }

  const preview = () => {
    switch (id) {
      case 'button': return <ButtonPreview value={components.button} t={t} />
      case 'badge': return <BadgePreview value={components.badge} t={t} />
      case 'fields': return <FieldsPreview value={components.fields} t={t} />
      case 'link': return <LinkPreview value={components.link} t={t} />
      case 'navigation': return <MainNav variant={components.navigation.variant} label={t.components.names.navigation} />
      case 'heading':
        return (
          <SectionHeading
            level={3}
            size={components.heading.size}
            title={t.components.sample.headingTitle}
            description={components.heading.description ? t.components.sample.headingDescription : undefined}
            index={components.heading.index ? '01' : undefined}
          />
        )
      case 'service':
        return (
          <ServiceCard
            name={t.components.sample.serviceName}
            description={t.components.sample.serviceText}
            price={{ kind: components.service.price }}
            featured={components.service.featured}
            index="01"
            headingLevel={3}
            action={components.service.action ? <Button variant="secondary" size="sm" to="/contact">{t.components.sample.serviceAction}</Button> : undefined}
          />
        )
      case 'project': return <ProjectPreview value={components.project} t={t} />
    }
  }

  return (
    <LabSection id="components" number="03" title={t.components.title} lead={t.components.lead} resetLabel={t.common.reset} onReset={onReset}>
      <Controls label={t.common.controls}>
        <LabChoice<ComponentId>
          label={t.components.pick}
          value={id}
          options={COMPONENT_IDS.map((value) => ({ value, label: t.components.names[value] }))}
          columns={2}
          onChange={(value) => dispatch({ type: 'components/select', id: value })}
        />
        <div className={styles.about}>
          <p>{t.components.about[id]}</p>
          <p className={styles.source}>
            {t.components.source.split('{path}')[0]}
            <code className={styles.code}>{SOURCES[id]}</code>
            {t.components.source.split('{path}')[1]}
          </p>
        </div>
        <div className={styles.props}>{controls()}</div>
        <Button variant="secondary" size="sm" onClick={() => dispatch({ type: 'components/reset', id })}>
          {t.components.reset}
        </Button>
      </Controls>

      <Preview label={t.common.preview}>
        <PreviewStage theme={theme} vars={tokens} label={t.components.names[id]} className={styles.stage}>
          <div key={`${id}-${resetKey}`} className={styles.canvas}>
            {preview()}
          </div>
        </PreviewStage>
        <p className={styles.inert}>{t.common.linksInert}</p>
      </Preview>
    </LabSection>
  )
})
