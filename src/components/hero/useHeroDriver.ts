import { useEffect, useState, type RefObject } from 'react'
import { HeroDriver } from './HeroDriver'

/**
 * Creates the hero's driver, attaches it to the page and reports whether the hero is on screen.
 * `motion` is false under prefers-reduced-motion: then nothing listens and nothing moves.
 */
export function useHeroDriver(
  section: RefObject<HTMLElement | null>,
  stage: RefObject<HTMLElement | null>,
  root: RefObject<HTMLElement | null>,
  motion: boolean,
): { driver: HeroDriver; inView: boolean } {
  const [driver] = useState(() => new HeroDriver())
  const [inView, setInView] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || !document.hidden)

  // A hidden tab draws nothing: the scene waits instead of relying on the browser to starve its loop.
  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    const sectionElement = section.current
    const stageElement = stage.current
    const rootElement = root.current
    if (!sectionElement || !stageElement || !rootElement) return

    const detach = driver.attach(sectionElement, stageElement, rootElement, motion)
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting)
      driver.setVisible(entry.isIntersecting)
    })
    observer.observe(sectionElement)

    return () => {
      observer.disconnect()
      detach()
    }
  }, [driver, section, stage, root, motion])

  return { driver, inView: inView && tabVisible }
}
