# Lab 2.0: the creative digital universe

PROMPT 34. Branch `feature/lab-2-creative-universe`, based on `feature/controlled-ai-automation` (`4761c8e`). Nothing here is merged or
deployed. Documents: [ARCHITECTURE](ARCHITECTURE.md) · [PERFORMANCE](PERFORMANCE.md) · [ACCESSIBILITY](ACCESSIBILITY.md) ·
[TEST_RESULTS](TEST_RESULTS.md) · [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md).

## What this is

The Lab at `/lab` is the site's experimental playground: **exactly six** interactive experiences, each a real-time WebGL scene that answers a
pointer, a finger and the keyboard, plus one *hidden* Easter egg (the NFSU2 racing screen) that is none of the six. Lab 2.0 is an upgrade of what
was there, in the Racing Red identity (Racing Red `#FF161F`, Carbon Black `#0B0B0D`, Cobalt Blue `#445CFF`, Warm Paper `#F4F0E8`, Graphite
`#303036`, the existing tokens and the existing motion system). It does not rebuild the Lab, remove anything, add a dependency, a backend route, a
database table, an AI provider or a paid service.

| # | Experience | What it is |
| --- | --- | --- |
| 01 | **Particle Universe** | Tens of thousands of particles in depth layers that follow, flee and re-form into five shapes. |
| 02 | **Liquid Matter** | A liquid body in four states (chrome, soft matter, glass, molten red) that deforms under the pointer. |
| 03 | **Type in Motion** | Letters as a material: the visitor's own words, fonts, motion presets and a pointer that lifts and tilts them. |
| 04 | **Infinite Space** | A tunnel of light with no end: steer it, drag to look around, jump, pulse. |
| 05 | **Chromatic Distortion** | Light and colour pulled apart by one shader, in three modes. |
| 06 | **Generative Objects** | A written description becomes an object, built from a fixed word list and procedural parts. **No AI, no network, no server.** |

The hidden egg is unchanged: typed `n f s u 2` or found as the red full stop of the Lab's headline, it opens `https://nfsu2.xyz/` in a **new tab**
(that site forbids being framed, so there is no iframe and none is attempted).

## What changed in Lab 2.0

**The shared shell** (all six get it):

* **Full screen** with a visible, named button and one way out. The browser's own full screen on the experience's frame; where the browser has none
  for an element (an iPhone) or refuses, the same view laid over the viewport. Escape leaves both. Leaving the page leaves full screen. Theme and
  language switches, the panel and the dock keep working inside it.
* **How to use it** in the panel: the experience's own ways to interact, and the keyboard line (Tab, arrows, Enter/Space, Home, Escape).
* **What steers it, on every tile of the overview**: the "Interactive" state and one tag per input (pointer, touch, keys, your own words).
* **The keyboard on the stage**: arrows move a virtual pointer (two keys at once now add up instead of cancelling), **Home** recentres, Enter and
  Space are a click.
* **A fix found by testing the Calm view in a real browser**: see [TEST_RESULTS](TEST_RESULTS.md) → "Defects found by the journey".

**Per experience** (the controls fit each model; they are not one generic panel):

* **Particle Universe**: an *arrangement* control (0–99): the same number is always the same cloud, `#1` is the cloud the shape always was.
* **Chromatic Distortion**: a *mode* (mixed, linear, radial); the direction control goes away when it does not apply.
* **Infinite Space**: *drag to look around*; the view stays where you let go, inside a cone the tunnel still reads in; **Recentre view** (and Reset)
  bring it back.
* **Generative Objects**: the *seed* is shown and can be typed (the same words and the same seed always build the same object), and there is now a **Reset**.
* Liquid Matter and Type in Motion already had the controls the brief asks for (states and transitions, a few meaningful controls, the visitor's own
  words, presets, reset); they got the shared shell.

## Interaction at a glance

| Input | Does |
| --- | --- |
| Pointer move / finger drag | The experience's primary interaction (see the table in ARCHITECTURE). |
| Click / tap · Enter · Space | A pulse, a burst, a surge: the experience's "impact". |
| Arrow keys on the focused stage | Move a virtual pointer. |
| Home on the focused stage | The virtual pointer back to the middle. |
| Drag in Infinite Space | Turns the view; it stays. |
| Tab | Stage, then the page's controls, panel, dock. |
| Escape | Leaves the expanded full screen (the browser handles the native one). |

## The three views

**Live** (full motion), **Calm** (the default under `prefers-reduced-motion`: interactive, nothing moves by itself, draws only while something
changes), **Still** (no WebGL: the experience's picture and the page's words). The visitor can always choose, and the choice is remembered for the
session. A browser without WebGL 2, a scene that throws and a frame rate that cannot be held all end in Still, with a notice that says why.

## Known limitations

Listed honestly in [TEST_RESULTS](TEST_RESULTS.md#not-verified) and [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md); in short: no physical phone, tablet, Safari, Firefox
or screen reader was used; phone "emulation" is a slowed CPU and a small screen, not a phone's GPU; the Hungarian and Dutch wording was checked by
the platform's rules and a spell checker, not by a native proofreader; the new full-screen fallback was exercised by simulating a browser without the
API, not on an iPhone.

## Remaining owner decisions

See [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md). None blocks merging the code; they are about what to confirm on real devices before the Lab is promoted.
