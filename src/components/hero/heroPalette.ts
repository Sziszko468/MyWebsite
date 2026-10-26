import { Color } from 'three'
import type { Theme } from '../../theme/theme'

/**
 * The scene's colours and light levels for the active theme, read from the design tokens
 * (`--scene-*` in src/styles/tokens.css). The theme itself stays in one place: <html data-theme>.
 */
export interface ScenePalette {
  bg: Color
  /** The neutral line colour: paper-white on dark, graphite on light. */
  ink: Color
  /** Base colour of the distortion surfaces. */
  grid: Color
  red: Color
  blue: Color
  /** Multiplier for the light of every system. */
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
    ink: color(style, '--scene-ink', '#f4f0e8'),
    grid: color(style, '--scene-grid', '#4a5072'),
    red: color(style, '--scene-light-red', '#ff161f'),
    blue: color(style, '--scene-light-blue', '#445cff'),
    glow: number(style, '--scene-glow', 1),
    bloom: number(style, '--scene-bloom', 0.8),
    additive: theme === 'light' ? 0 : 1,
  }
}
