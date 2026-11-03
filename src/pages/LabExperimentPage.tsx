import { Component, Suspense, useEffect, type ReactNode } from 'react'
import { track } from '../analytics/tracker'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { useLabText } from '../components/lab/core/useLabText'
import { EXPERIMENT_COMPONENTS } from '../components/lab/registry'
import type { LabId } from '../content/lab'

function LabFallback() {
  return <div style={{ minHeight: '100svh', backgroundColor: 'var(--scene-bg)' }} aria-hidden="true" />
}

function Crash() {
  const { text } = useLabText()
  return (
    <Container size="narrow" style={{ paddingBlock: 'var(--space-section)' }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)' }}>{text.crash.title}</h1>
      <p style={{ marginBlock: 'var(--space-5)', color: 'var(--color-text-secondary)' }}>{text.crash.text}</p>
      <Button to="/lab" variant="secondary" arrow>
        {text.crash.back}
      </Button>
    </Container>
  )
}

/** A chunk that fails to load, or a page that throws, must not take the whole Lab down: the way back stays. */
class CrashBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('A Lab experiment failed to load.', error)
  }

  render() {
    return this.state.failed ? <Crash /> : this.props.children
  }
}

/** The page of one experiment, from the registry. */
export function LabExperimentPage({ id }: { id: LabId }) {
  const Experiment = EXPERIMENT_COMPONENTS[id]
  useEffect(() => track('lab_experience_opened', { experiment: id }), [id])
  if (!Experiment) return <Crash />

  return (
    <CrashBoundary key={id}>
      <Suspense fallback={<LabFallback />}>
        <Experiment />
      </Suspense>
    </CrashBoundary>
  )
}
