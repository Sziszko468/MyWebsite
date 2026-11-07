# Phone checks (PROMPT 13.2)

Small Playwright scripts that drive the **built** site (`npm run build` first) with a real Chrome, CDP touch events and device emulation. Same setup as `tools/audit`: `AUDIT_PLAYWRIGHT=/path/to/node_modules/playwright` (and `AUDIT_CHANNEL=msedge` for Edge). Each starts its own static server on the port you give. Emulation only: no physical device, no Safari, no Firefox.

| Script | What it checks |
| --- | --- |
| `intro-touch.cjs <port> [WxH]` | A finger dragging over the fullscreen intro reaches the field: pointer moves arrive, no `pointercancel`, the field variables change, the page does not scroll. |
| `lab-touch.cjs <port> [WxH]` | The same drag on each of the five Lab experiences' stages. |
| `safe-area.cjs <port> <outdir>` | Notch insets through `Emulation.setSafeAreaInsetsOverride` (portrait 47/34, landscape 59/59): nothing interactive outside the safe rectangle, no sideways scroll, on the intro, home, Work, cart and the Lab. |
| `egg.cjs <port> <outdir>` | The hidden NFSU2 screen at 320×568, 390×844, 844×390, 568×320: opened by touch, no overflow, 48 px controls, Back by touch. |
| `restore.cjs <port> [experience] [throttle]` | The quality governor end to end: slows the CPU until the Lab lowers the canvas resolution, releases it, and prints the resolution coming back. |
| `admin-safe-area.cjs --base --email --password` | The administration on a notched phone (backend + built site + a throw-away administrator, like `audit-admin.cjs`): the bottom bar includes the home-indicator area, its buttons keep their height, the header stays inside the side insets. |
| `image-widths.cjs <port>` | How wide the project pages' pictures are really drawn at 13 viewports (320 to 1920 px): the numbers behind the `sizes` strings in `src/utils/responsiveImage.ts`. |
| `shots.cjs <port> <outdir> <WxH,..> </path,..>` | Full-page screenshots (reduced motion so entrances are visible). |
