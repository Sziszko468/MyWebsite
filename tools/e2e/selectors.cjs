// How a browser journey says "this happened" without quoting the wording of the page (PROMPT 25).
//
// A journey that waits for the sentence "The settings are saved." breaks when somebody rewords it, translates it or the owner picks another
// language for the administration, and it breaks for a reason that is not a defect. The pages therefore carry invisible test hooks
// (`data-testid` and `data-*` attributes: what happened, never how it is worded), and the journeys use them for states and outcomes.
//
// What stays text-based on purpose, and must:
//   - `getByRole(..., { name })` and `getByLabel`: the accessible name IS the accessibility contract; a journey that finds a control by it also proves
//     that a person using a screen reader can find it;
//   - a check that a word is in the right LANGUAGE (the translations of one screen, per language): the sentence is the thing under test;
//   - data the journey itself created (a reference number, a name, a marker) that it looks for.
//
// The hooks (add a new one next to the component, never a CSS class, and describe the state, not the text):
//   toast             data-tone = success | error | info, data-seq = a number that only grows (the administration's short messages)
//   status-badge      data-kind, data-status (an admin status chip)
//   field-error       the message under a form field in the administration
//   booking-status    data-status: the status of a booking on the customer's own page
//   booking-change    data-kind = cancel | move | proposal: a change that is open on the customer's page
//   booking-notice    the confirmation the customer's page shows after an action
//   booking-link-problem   data-reason: why a customer's link did not open
//   booking-open-state     data-open = true | false: whether booking is open to the public (admin)
//   booking-open-change    data-kind: a booking list row with a request waiting for the owner
//   type-readiness         data-complete: whether a consultation type can be switched on

/** The newest toast's sequence number (0 when there is none). Take it just BEFORE the action that should produce a new toast. */
async function toastMark(page) {
  return page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('[data-testid="toast"]')].map((el) => Number(el.getAttribute('data-seq')) || 0)))
}

/** Waits for a toast of this tone that is NEWER than `mark`, so a message left over from an earlier action can not satisfy it. */
async function waitToast(page, mark, tone = 'success', timeout = 10000) {
  await page.waitForFunction(
    ({ mark: seen, tone: wanted }) => [...document.querySelectorAll('[data-testid="toast"]')].some((el) => el.getAttribute('data-tone') === wanted && (Number(el.getAttribute('data-seq')) || 0) > seen),
    { mark, tone },
    { timeout },
  )
}

/** Runs `action` (usually a click) and waits for the new toast it should cause. */
async function toastAfter(page, action, tone = 'success', timeout = 10000) {
  const mark = await toastMark(page)
  await action()
  await waitToast(page, mark, tone, timeout)
}

module.exports = { toastMark, waitToast, toastAfter }
