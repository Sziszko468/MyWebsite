import { tri } from '../../../../content/trilingual'
import { fill } from '../../core/useLabText'
import type { IssueId, TrackIssue } from './trackModel'

/** What each problem a track can have is called, for the editor's list and the Racing Experience's notice. */
export const issueText: Record<IssueId, ReturnType<typeof tri>> = {
  'few-points': tri(
    'Legalább {value} vezérlőpont kell.',
    'At least {value} control points are needed.',
    'Er zijn minstens {value} punten nodig.',
  ),
  'not-closed': tri(
    'A pálya nincs lezárva: kösd össze az utolsó pontot az elsővel.',
    'The loop is not closed: connect the last point to the first.',
    'De lus is niet gesloten: verbind het laatste punt met het eerste.',
  ),
  'too-short': tri(
    'A pálya túl rövid ({value} m): legalább 500 m kell.',
    'The track is too short ({value} m): at least 500 m is needed.',
    'De baan is te kort ({value} m): minstens 500 m nodig.',
  ),
  'too-long': tri(
    'A pálya túl hosszú ({value} m): legfeljebb 7000 m lehet.',
    'The track is too long ({value} m): at most 7000 m.',
    'De baan is te lang ({value} m): maximaal 7000 m.',
  ),
  'bad-connection': tri(
    'Két szomszédos pont {value} m-re van: 8 és 400 méter között kell lennie.',
    'Two neighbouring points are {value} m apart: it must be between 8 and 400 metres.',
    'Twee naburige punten liggen {value} m uit elkaar: dat moet tussen 8 en 400 meter zijn.',
  ),
  narrow: tri(
    'A pálya {value} m széles egy ponton: legalább 8 m kell.',
    'The road is {value} m wide at one point: at least 8 m is needed.',
    'De weg is op één punt {value} m breed: minstens 8 m nodig.',
  ),
  'self-intersection': tri(
    'A pálya önmagát keresztezi vagy érinti.',
    'The track crosses or touches itself.',
    'De baan kruist of raakt zichzelf.',
  ),
  'sharp-corner': tri(
    'Egy kanyar túl éles ({value} m sugár): autóval nem vehető.',
    'A corner is too sharp ({value} m radius): a car cannot take it.',
    'Een bocht is te scherp ({value} m straal): een auto kan hem niet nemen.',
  ),
  'tight-corner': tri(
    'Nagyon szűk kanyar ({value} m sugár): lassú lesz.',
    'A very tight corner ({value} m radius): it will be slow.',
    'Een zeer krappe bocht ({value} m straal): dat wordt langzaam.',
  ),
  steep: tri('Meredek szakasz ({value} %).', 'A steep section ({value} %).', 'Een steil stuk ({value} %).'),
  'start-in-corner': tri(
    'A rajtvonal kanyarban van: tedd egyenesre.',
    'The start line is in a corner: put it on a straight.',
    'De startlijn ligt in een bocht: leg hem op een rechte stuk.',
  ),
  'parallel-close': tri(
    'Két szakasz közel fut egymáshoz ({value} m): a korlátok összeérhetnek.',
    'Two sections run close together ({value} m): their barriers may touch.',
    'Twee stukken lopen dicht naast elkaar ({value} m): de vangrails kunnen elkaar raken.',
  ),
}

/** One issue as a sentence, with its number in. */
export function describeIssue(texts: Record<IssueId, string>, issue: TrackIssue): string {
  const value =
    issue.value === undefined || !Number.isFinite(issue.value)
      ? ''
      : String(Math.round(issue.value * (issue.id === 'narrow' ? 10 : 1)) / (issue.id === 'narrow' ? 10 : 1))
  return fill(texts[issue.id], { value })
}
