import { tri } from '../trilingual'

/** The few words the floating button needs. Kept apart from the rest of the interface (content/ai/index.ts) so the button, which is on every page, does not carry the assistant's whole vocabulary: that loads only when the assistant is opened. */
export const launcherText = {
  open: tri('Control Room AI megnyitása', 'Open Control Room AI', 'Control Room AI openen'),
}
