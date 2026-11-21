import { LabAction, LabActions, LabChoice, LabGroup, LabSlider, LabToggle } from './ui/LabControls'

/** The words one demo panel is built with: they come from the test, so no text is written in this component. */
export interface DemoWords {
  group: string
  slider: string
  choice: string
  optionA: string
  helpA: string
  optionB: string
  toggle: string
  action: string
}

/** One of every control the panels are built from, for the test that reads their markup (lab2.test.ts). */
export function LabControlsDemo({ words }: { words: DemoWords }) {
  return (
    <LabGroup title={words.group}>
      <LabSlider
        label={words.slider}
        value={0.42}
        min={0}
        max={1}
        step={0.01}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={() => undefined}
      />
      <LabChoice
        label={words.choice}
        value="a"
        options={[
          { value: 'a', label: words.optionA, help: words.helpA },
          { value: 'b', label: words.optionB },
        ]}
        onChange={() => undefined}
      />
      <LabToggle label={words.toggle} checked={false} onChange={() => undefined} />
      <LabActions>
        <LabAction>{words.action}</LabAction>
      </LabActions>
    </LabGroup>
  )
}
