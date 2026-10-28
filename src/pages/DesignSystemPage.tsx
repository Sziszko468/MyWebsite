import type { ReactNode } from 'react'
import { Badge } from '../components/Badge/Badge'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { LanguageSwitcher } from '../components/LanguageSwitcher/LanguageSwitcher'
import { ProjectCard } from '../components/ProjectCard/ProjectCard'
import { SceneLayer } from '../components/SceneLayer/SceneLayer'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { ServiceCard } from '../components/ServiceCard/ServiceCard'
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle'
import styles from './DesignSystemPage.module.scss'

// Dev-only reference page (see App.tsx). Copy here is demo content, not product copy.

const BRAND_TOKENS = ['--brand-red', '--brand-black', '--brand-blue', '--brand-paper', '--brand-graphite']

const COLOR_GROUPS: Record<string, string[]> = {
  Surfaces: [
    '--color-bg',
    '--color-bg-subtle',
    '--color-surface',
    '--color-surface-raised',
    '--color-surface-hover',
    '--color-surface-active',
  ],
  Text: ['--color-text', '--color-text-secondary', '--color-text-muted'],
  Lines: ['--color-border', '--color-border-strong', '--color-divider'],
  Accent: [
    '--color-accent',
    '--color-accent-text',
    '--color-accent-hover',
    '--color-accent-active',
    '--color-secondary',
    '--color-secondary-text',
    '--color-focus',
  ],
  Disabled: ['--color-disabled-bg', '--color-disabled-text', '--color-disabled-border'],
}

const TYPE_SCALE: Array<[token: string, sample: string]> = [
  ['--fs-display', 'Build digital'],
  ['--fs-3xl', 'Things that matter'],
  ['--fs-2xl', 'Selected work'],
  ['--fs-xl', 'What I build'],
  ['--fs-lg', 'Thoughtful websites and web applications'],
  ['--fs-md', 'Technology, creativity and a sharp eye for detail.'],
  ['--fs-base', 'Body copy stays calm and readable at every size, in both themes.'],
  ['--fs-sm', 'Secondary information and controls'],
  ['--fs-xs', 'Labels and captions'],
]

const SPACING = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7', '--space-8']
const RADII = ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-pill']
const SHADOWS = ['--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-glow']

function Swatch({ token }: { token: string }) {
  return (
    <li className={styles.swatch}>
      <span className={styles.chip} style={{ backgroundColor: `var(${token})` }} />
      <code>{token}</code>
    </li>
  )
}

function Block({ id, index, title, children }: { id: string; index: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.block} aria-labelledby={id}>
      <Container>
        <SectionHeading id={id} index={index} title={title} />
        <div className={styles.content}>{children}</div>
      </Container>
    </section>
  )
}

export default function DesignSystemPage() {
  return (
    <div className={styles.root}>
      <Container>
        <SectionHeading
          level={1}
          index="DS"
          title="Racing Red design system"
          description="Tokens, components and states. Toggle the theme and the language from the bar above; every block follows."
        />
      </Container>

      <Block id="ds-colour" index="01" title="Colour tokens">
        <h3 className={styles.sub}>Brand</h3>
        <ul className={styles.swatches}>
          {BRAND_TOKENS.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </ul>
        {Object.entries(COLOR_GROUPS).map(([group, tokens]) => (
          <div key={group}>
            <h3 className={styles.sub}>{group}</h3>
            <ul className={styles.swatches}>
              {tokens.map((token) => (
                <Swatch key={token} token={token} />
              ))}
            </ul>
          </div>
        ))}
      </Block>

      <Block id="ds-type" index="02" title="Typography">
        <ul className={styles.typeList}>
          {TYPE_SCALE.map(([token, sample]) => (
            <li key={token} className={styles.typeRow}>
              <code>{token}</code>
              <span className={styles.typeSample} style={{ fontSize: `var(${token})` }}>
                {sample}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block id="ds-buttons" index="03" title="Buttons">
        <div className={styles.matrix}>
          <span className={styles.matrixHead}>Default</span>
          <span className={styles.matrixHead}>With arrow</span>
          <span className={styles.matrixHead}>Large</span>
          <span className={styles.matrixHead}>Disabled</span>
          <span className={styles.matrixHead}>As link</span>

          <Button>Primary</Button>
          <Button arrow>Primary</Button>
          <Button size="lg">Primary</Button>
          <Button disabled>Primary</Button>
          <Button to="/">Primary</Button>

          <Button variant="secondary">Secondary</Button>
          <Button variant="secondary" arrow>
            Secondary
          </Button>
          <Button variant="secondary" size="lg">
            Secondary
          </Button>
          <Button variant="secondary" disabled>
            Secondary
          </Button>
          <Button variant="secondary" to="/">
            Secondary
          </Button>

          <Button variant="text">Text</Button>
          <Button variant="text" arrow>
            Text
          </Button>
          <Button variant="text" size="lg">
            Text
          </Button>
          <Button variant="text" disabled>
            Text
          </Button>
          <Button variant="text" to="/">
            Text
          </Button>
        </div>
      </Block>

      <Block id="ds-badges" index="04" title="Badges & switches">
        <div className={styles.row}>
          <Badge status="live" />
          <Badge status="demo" />
          <Badge status="in-progress" />
          <Badge status="concept" />
          <Badge>Category</Badge>
        </div>
        <div className={styles.row}>
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </Block>

      <Block id="ds-cards" index="05" title="Cards">
        <div className={styles.cards}>
          <ProjectCard
            category="Finance app"
            title="Project name"
            status="live"
            tags={['Tag one', 'Tag two', 'Tag three']}
            href="#ds-cards"
          />
          <ProjectCard
            category="Platform"
            title="Static card without a link"
            status="in-progress"
            tags={['Tag one', 'Tag two']}
          />
          <ProjectCard category="Concept" title="Concept project" status="concept" tags={[]} />
        </div>
        <div className={styles.cards}>
          <ServiceCard
            index="01"
            name="Package"
            description="Short description of what the package covers."
            price={{ kind: 'from', amount: 1000, currency: 'EUR' }}
          />
          <ServiceCard
            index="02"
            name="Featured"
            description="Highlighted package with the accent edge."
            price={{ kind: 'quote' }}
            featured
          />
          <ServiceCard
            index="03"
            name="Pending"
            description="Price not decided yet."
            price={{ kind: 'tbd' }}
          />
        </div>
      </Block>

      <Block id="ds-scale" index="06" title="Space, shape & shadow">
        <ul className={styles.scaleRow}>
          {SPACING.map((token) => (
            <li key={token} className={styles.scaleItem}>
              <span className={styles.spaceBar} style={{ width: `var(${token})` }} />
              <code>{token}</code>
            </li>
          ))}
        </ul>
        <ul className={styles.scaleRow}>
          {RADII.map((token) => (
            <li key={token} className={styles.scaleItem}>
              <span className={styles.shape} style={{ borderRadius: `var(${token})` }} />
              <code>{token}</code>
            </li>
          ))}
        </ul>
        <ul className={styles.scaleRow}>
          {SHADOWS.map((token) => (
            <li key={token} className={styles.scaleItem}>
              <span className={styles.shape} style={{ boxShadow: `var(${token})` }} />
              <code>{token}</code>
            </li>
          ))}
        </ul>
      </Block>
      <Block id="ds-scene" index="07" title="Scene layer">
        <section className={styles.sceneDemo}>
          <SceneLayer>
            <div className={styles.sceneArt} />
          </SceneLayer>
          <div className={styles.sceneContent}>
            <p>Content sits above the scene and stays readable and clickable.</p>
            <Button variant="secondary" arrow>
              Clickable
            </Button>
          </div>
        </section>
      </Block>

    </div>
  )
}
