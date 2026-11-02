/**
 * Closing a modal <dialog> with an exit animation, safely. A dialog that is closed with `close()` is
 * gone at once, so the exit has to play first; this marks the dialog `data-closing` (the stylesheet
 * animates that state out), waits for the dialog's own `animationend`, and closes it. It can never leave
 * a dialog open: a timer closes it anyway if the animation never runs or never reports its end (reduced
 * motion, an old browser, a hidden tab), and asking twice does nothing. A caller never has to wait for
 * the exit before doing the next thing (a link that closed the menu has already navigated).
 */
export const EXIT_FALLBACK_MS = 260

export function closeDialog(dialog: HTMLDialogElement | null | undefined, fallbackMs = EXIT_FALLBACK_MS): void {
  if (!dialog?.open || dialog.dataset.closing !== undefined) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dialog.close()
    return
  }
  dialog.dataset.closing = ''
  let timer = 0
  const finish = () => {
    window.clearTimeout(timer)
    dialog.removeEventListener('animationend', onEnd)
    delete dialog.dataset.closing
    if (dialog.open) dialog.close()
  }
  const onEnd = (event: AnimationEvent) => {
    if (event.target === dialog) finish()
  }
  timer = window.setTimeout(finish, fallbackMs)
  dialog.addEventListener('animationend', onEnd)
}
