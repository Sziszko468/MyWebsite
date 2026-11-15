# Annotations: comments tied to a spot on a picture

Annotations exist **only for pictures** (a version with an `image_url` on an allow-listed origin). Every other kind of deliverable gets text feedback. There is no annotation on a frame, a page, a PDF or a video: a third party's page cannot be measured from the portal, and pretending to would be wrong.

## The position

A position is two numbers, **`x` and `y`, from 0 to 1**, measured from the **top-left corner of the picture** as it is *displayed*, so it is independent of the picture's size, the device, the zoom and the layout. It is stored on the **first comment of a thread only** (a reply or follow-up never has one), rounded to four decimals, with the comment, in the database (both or neither, always within 0–1: a `CHECK`). The server accepts `{ x, y }` only when both are finite numbers in range and the version has a picture; anything else is `position: invalid`.

`src/utils/annotations.ts` holds the arithmetic (shared by the portal, the tests and, if wanted, the administration):

| Function | Does |
| --- | --- |
| `toNormalized(point, box)` | a pointer position → 0–1 on the picture (a point outside it is clamped to its edge; `null` only when the picture has no size to measure against) |
| `markerStyle(position)` | the marker's `left`/`top` **in percent**, so it stays on its spot when the picture scales |
| `describePoint(position)` | the same spot **in words** (*"25% from the left, 20% from the top"*) |
| `nudge`, `stepOf`, `centre` | moving the keyboard crosshair: arrows 1%, Shift+arrow 5%, clamped to the picture |

## How a customer places a marker

1. **Place a marker** switches placing mode on (a button, `aria-pressed`).
2. **Pointer or touch:** one click or tap on the picture places it where it landed (works the same with a mouse, a finger and a pen). The chosen spot is said in words (*"The chosen spot: 25% from the left, 20% from the top"*) and drawn as a ring.
3. **Keyboard:** entering placing mode puts **focus on a crosshair button** (named with its position, which updates as it moves). **Arrow keys** move it (1%), **Shift+arrow** moves it five times as far, **Enter** places it, **Escape** cancels and returns to the button. No pointer is needed anywhere.
4. The comment is written and **saved as a draft** with the position; the marker appears numbered on the picture (*"Marker 1: 25% from the left, 20% from the top"*, a real button) and the comment appears in the list. **Remove the spot** removes the position and keeps the comment as a general one.
5. **Send the feedback** sends the drafts together; from then on the marker and the comment are fixed.

Numbers are assigned in the order the threads were started and are **per version**; the owner sees the same numbers.

## What makes it usable by everyone

* **The list is the truth; the picture is a picture of the list.** Every marker's comment, number and position **in words** appears as text beside the picture. A person who cannot see the picture, or cannot point at it, loses nothing.
* **Markers are buttons** with names that say the number and the position; selecting one focuses its thread in the list. The crosshair is a button. Colours come from the design system's tokens (an accent dot with a number, a ring in the page's background colour around it, a grey ring for a draft, a focus ring for the one selected), so the number carries the meaning, not the colour alone. There is **no animation and no transition** on markers, so reduced motion has nothing to take away.
* **Responsive.** The picture scales with its box (`width: 100%`, aspect ratio kept), the markers are percentages, the page has no sideways scroll at 320 px, and every marker and the crosshair are **44 px** wide (2.75 rem), centred on their spot, so a thumb can hit them.
* **Dark and light** both checked (axe, and the layout checks, at five widths); the markers carry a ring in the page's background colour so they separate from a dark or a light picture.
* **No annotation tool lives in the owner's screen.** The owner reads positions (words and number) and replies; the picture itself is the customer's page.

## Limits and honesty

* The position is where the customer pointed **on the picture as drawn**. If the owner later publishes a new picture, the old markers belong to the **old version**; they are never moved onto a new picture.
* A picture that **cannot be loaded** (the host is down, or its origin is not on the list) shows the browser's broken-image state; the page falls back to text feedback because the picture-only controls need the picture. The page says if a version has no picture.
* Annotations are **not shown to the owner as an overlay** in the administration (words and numbers only): that is a deliberate scope limit of this prompt.
