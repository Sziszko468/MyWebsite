# Media management

The picture library (`/admin/media`, and the picture chooser inside the project editor, which reads the same library). Code: `server/src/modules/media/` (`service.ts`, `image.ts`, `replace.ts`, `storage.ts`), the routes in `server/src/modules/projects/routes.ts`, the screen in `src/admin/pages/MediaPage.tsx`.

## What can be done

| Action | How | Rule |
| --- | --- | --- |
| **Upload** | `POST /api/admin/media?name=<file name>`, the body is the image itself | the server decides what the file is **from its own bytes**; only PNG, JPEG, WebP and GIF; SVG, HTML and anything else are refused; a claimed type that does not match the bytes is refused (422) |
| **Look** | `GET /api/admin/media` | every picture with its size, where it is used (project titles) and its descriptions |
| **Describe** | `PUT /api/admin/media/<id>` with `{ alt: { hu, en, nl } }` | up to 200 characters per language; kept with the picture, offered when it is put on a project (the project keeps its own copy) |
| **Replace** | `POST /api/admin/media/<id>/replace`, the body is the new image | see below |
| **Delete** | `DELETE /api/admin/media/<id>` | administrators only; a picture **anything uses is never deleted** (409); the pictures that ship with the website are not deletable; the screen asks first |
| **Where is it kept** | `GET /api/admin/media-storage` | the folder, whether it can be written, whether it is on the application's own filesystem, how many files |

## Limits and safe names

- At most `MEDIA_MAX_BYTES` (default 6 MiB, configurable between 100 kB and 25 MB) and at most 8000 px on a side and 36 million pixels; larger or empty bodies are refused (413 / 422). The administration also re-draws a picture wider than 1600 px or heavier than 600 kB at most 1600 px on its long side (as WebP) in the browser **before** sending it, so a phone photo of several megabytes becomes about sixty kilobytes.
- A stored file's name is **the first 24 characters of the SHA-256 of its content plus the extension** (`<hash>.png`). The visitor-supplied file name is never used as a path: it is kept only as a cleaned label. `/media/<name>` accepts exactly that pattern, so `..`, encoded separators, NUL bytes, other case and short names are a plain 404 (probed in `tools/e2e/security-probe.mjs`).
- Pictures are served with their real type, `X-Content-Type-Options: nosniff`, a `sandbox` Content-Security-Policy and a long immutable cache.
- No variants are generated on the server for an uploaded picture; the pictures that ship with the website have prepared smaller copies (`tools/images/make-variants.cjs`) and use `srcset`. An uploaded picture is stored as it was sent (after the browser's resizing).

## Replacing a picture

The new file goes through the same checks as an upload and becomes a picture of its own; **everything that used the old one is pointed at the new one in a single transaction** (project thumbnails, gallery, feature pictures, search-and-sharing picture, block pictures). The description kept in the library carries over when the new picture has none. The screen says how many projects will change and asks first.

The old file and its address are **left alone**: the address is a content hash cached for a year, so one address can never be made to show a different picture, and an old link in a chat or a search result keeps working. Because of that, "preserve the URL on replace" is answered by *keeping the old URL alive*, not by overwriting it. The old picture stays in the library, now unused, until somebody deletes it. Replacing a picture with the very same bytes is refused (409), as there is nothing to replace.

## Where the files live, and production

Files are stored in `MEDIA_DIR`; **by default a `media` folder beside the database** (`<folder of DATABASE_PATH>/media`). The database holds only descriptions, never the pictures, so **a backup must contain both**.

A hosting platform's application folder is usually rebuilt at every deploy. The server cannot see the host's disk settings, so it asks the one question it can answer: *is the media folder on the same filesystem as the application's own files?* The picture library shows the result, and in production (`APP_ENV=production`) the server logs a warning at start and the screen shows a notice when it is. This is a strong hint, not proof (a host may mount a disk over the application folder), and the "writable" check is real (the server writes and removes a probe file).

**What is and is not known about the real deployment:** the production site is served by Render behind Cloudflare. Whether a persistent disk is attached to the Render service and whether `MEDIA_DIR` and `DATABASE_PATH` point onto it is **unverified** (audit finding D-1 of PROMPT 19 is still open): it is a setting of the host that this repository cannot read. Before the owner uploads real pictures in production, they must confirm in the Render dashboard that a disk is mounted and that both variables name a folder on it, then check the library's storage notice. No migration to an external media provider was made or is proposed here.
