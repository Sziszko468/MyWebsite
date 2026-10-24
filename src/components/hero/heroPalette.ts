import { Color } from 'three'
import type { Theme } from '../../theme/theme'

/**
 * The scene's colours and light levels for the active theme, read from the design tokens
 * (`--scene-*` in src/styles/tokens.css). The theme itself stays in one place: <html data-theme>.
 */
export interface ScenePalette {
  bg: Color
  track: Color
  marking: Color
  carBody: Color
  carTrim: Color
  red: Color
  blue: Color
  /** Strength of reflections on the track and body. */
  reflection: number
  /** Brightness of the generated reflection environment. */
  env: number
  /** Multiplier for emissive light streaks and lamps. */
  glow: number
  /** Strength of the post-processing bloom. */
  bloom: number
  /** 1 on dark backgrounds (lights add to the image), 0 on light ones (lights paint over it). */
  additive: number
}

function color(style: CSSStyleDeclaration, name: string, fallback: string): Color {
  const value = style.getPropertyValue(name).trim()
  return new Color(value || fallback)
}

function number(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const parsed = parseFloat(style.getPropertyValue(name))
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Reads the scene tokens as they stand now. Call it after `theme` has been applied to <html>. */
export function readScenePalette(theme: Theme, root: HTMLElement = document.documentElement): ScenePalette {
  const style = getComputedStyle(root)

  return {
    bg: color(style, '--scene-bg', '#0b0b0d'),
    track: color(style, '--scene-track', '#131316'),
    marking: color(style, '--scene-marking', '#8a8a94'),
    carBody: color(style, '--scene-car-body', '#12141a'),
    carTrim: color(style, '--scene-car-trim', '#1c1e26'),
    red: color(style, '--scene-light-red', '#ff161f'),
    blue: color(style, '--scene-light-blue', '#445cff'),
    reflection: number(style, '--scene-reflection', 0.5),
    env: number(style, '--scene-env', 1),
    glow: number(style, '--scene-glow', 1),
    bloom: number(style, '--scene-bloom', 0.8),
    additive: theme === 'light' ? 0 : 1,
  }
}
