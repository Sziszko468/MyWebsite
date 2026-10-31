import { useId } from 'react'
import { useLocalized } from '../../core/useLabText'
import { useStore } from '../../experience/store'
import { LabChoice } from '../../ui/LabControls'
import {
  DEFAULT_LOOK,
  FINISHES,
  GLOWS,
  LOOK_PRESETS,
  RIM_COLOURS,
  STRIPES,
  carLook,
  patchLook,
  sameLook,
  setLook,
  type CarLook,
  type Finish,
  type Glow,
  type StripeStyle,
} from './carLook'
import { racingText } from './racingText'
import styles from './LookPanel.module.scss'

/**
 * The car customiser: ready colour schemes, the paint and stripe colours, the stripe's shape, the
 * finish, the rims and a light under the floor. Changes show at once, on the car in the picture, and
 * are kept in this browser. It is used by the Racing Experience and by the Performance Lab.
 */
export function LookPanel() {
  const t = useLocalized(racingText).look
  const look = useStore(carLook, (value) => value)
  const paintId = useId()
  const stripeId = useId()
  return (
    <div className={styles.panel}>
      <p className={styles.note}>{t.note}</p>
      <div role="group" aria-label={t.presets} className={styles.presets}>
        {LOOK_PRESETS.map(({ id, look: preset }) => (
          <button
            key={id}
            type="button"
            className={styles.preset}
            aria-pressed={sameLook(look, preset as CarLook)}
            onClick={() => setLook(preset as CarLook)}
          >
            <span
              className={styles.swatch}
              style={{
                background: `linear-gradient(135deg, ${preset.paint} 60%, ${preset.stripe} 60% 72%, ${preset.paint} 72%)`,
              }}
              aria-hidden="true"
            />
            {t.preset[id]}
          </button>
        ))}
      </div>
      <div className={styles.colours}>
        <label htmlFor={paintId}>{t.paint}</label>
        <input
          id={paintId}
          type="color"
          value={look.paint}
          onChange={(event) => patchLook({ paint: event.currentTarget.value })}
        />
        <label htmlFor={stripeId}>{t.stripe}</label>
        <input
          id={stripeId}
          type="color"
          value={look.stripe}
          onChange={(event) => patchLook({ stripe: event.currentTarget.value })}
        />
      </div>
      <LabChoice<StripeStyle>
        label={t.stripeStyle}
        value={look.stripeStyle}
        options={STRIPES.map((value) => ({ value, label: t.stripes[value] }))}
        onChange={(stripeStyle) => patchLook({ stripeStyle })}
        columns={4}
      />
      <LabChoice<Finish>
        label={t.finish}
        value={look.finish}
        options={FINISHES.map((value) => ({ value, label: t.finishes[value] }))}
        onChange={(finish) => patchLook({ finish })}
        columns={3}
      />
      <div role="group" aria-label={t.rims} className={styles.rims}>
        <span className={styles.rimsLabel}>{t.rims}</span>
        {RIM_COLOURS.map((colour) => (
          <button
            key={colour}
            type="button"
            className={styles.rim}
            style={{ background: colour }}
            aria-pressed={look.rims === colour}
            aria-label={t.rim.replace('{colour}', colour)}
            onClick={() => patchLook({ rims: colour })}
          />
        ))}
      </div>
      <LabChoice<Glow>
        label={t.glow}
        value={look.glow}
        options={GLOWS.map((value) => ({ value, label: t.glows[value] }))}
        onChange={(glow) => patchLook({ glow })}
        columns={4}
      />
      <button type="button" className={styles.reset} onClick={() => setLook({ ...DEFAULT_LOOK })}>
        {t.reset}
      </button>
    </div>
  )
}
