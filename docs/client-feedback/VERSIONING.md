# Versioning

## States of a version

```
draft ──publish──▶ published ──a newer one is published──▶ superseded
  ▲ only the owner sees it     the customer's current       still readable,
  │ can be edited, previewed    version; never changed       never changed
```

* **Draft.** Made when the deliverable is created (version 1) or by *Make a new version* (the next number; it starts from the last version's words and addresses). Only the owner sees it. It can be edited (`PATCH …/versions/:v`) as often as needed. **At most one draft exists at a time.**
* **Published.** Publishing is a deliberate act with a question first (*"From now on this version is never changed"*). It needs what the **type** needs (below). The version gets its time, its publisher and its **fingerprint**, the deliverable's `current_version` moves to it, and the customer is e-mailed (unless switched off).
* **Superseded.** When a newer version is published the older one becomes `superseded`. It stays readable (read-only) with all its feedback.

## What a type needs to be published

| Type | Needs |
| --- | --- |
| `website_preview`, `prototype` | an https preview address |
| `image` | an https picture address (its origin on the allow-list) |
| `design`, `document`, `other` | at least one of: a preview address, a picture, or words for the customer (a version always has a title) |

A version that lacks it is refused with `version_incomplete`. The type cannot change once a version was published (`type_locked`).

## Numbering

Version numbers rise by exactly one: the application takes `MAX + 1` inside one transaction, a trigger refuses any other number, and `UNIQUE (deliverable_id, number)` backs it. Two owners pressing *New version* at once cannot make two drafts (the partial unique index) or skip a number.

## Immutability

A published version's title, words, addresses, number and fingerprint can **never** change, not through the API (`version_published`, 409) and not through SQL (a trigger aborts). "Fixing a typo" is a new version. This is what makes an approval mean something: the version a customer approved is the version they saw.

## The fingerprint

`checksum` is the **SHA-256** of the version's reference, number, title, words, preview address and picture address, computed **at publication** (`checksumOf` in `service.ts`) and stored with the version. The customer's page shows its first 12 hex characters (*"This is the version's fingerprint. An approval is for exactly this version."*). The approval request carries the full value, and the customer's confirmation must send it back; it is kept with the approval. It proves *which text and addresses* were approved. **It does not prove the content behind a preview address** (the owner hosts that; see PREVIEW_SECURITY.md).

## What a new version does to everything else

* **Feedback** belongs to the version it was written on. Older versions keep theirs, read-only.
* **A waiting request for approval** of the previous version ends (`superseded`, `closed_by: system`, an `approval_superseded` event): the customer is never asked to approve something that was replaced, and a late click answers *"A new version was published meanwhile"*.
* **An approval is never inherited.** Version 3 is not approved because version 2 was. The deliverable's review state becomes `superseded` (*"A new version, no decision yet"*) until the owner asks again.
* **Drafts of the customer** that were never sent stay on the version they were written on; the page says how many (*"2 drafts on an earlier version were never sent"*).

## Archiving and removing

* **Archive** (`POST …/archive`): the customer can still read everything, but can no longer comment or decide; a waiting request is cancelled by the system. It cannot be undone from the screens.
* **Remove** (`DELETE …/:id`): only a deliverable **that was never published** (nobody has seen it). A published one is part of the record and is archived instead (`published`, 409).
