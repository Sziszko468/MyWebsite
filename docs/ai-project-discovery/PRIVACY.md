# Privacy

The project discovery adds **no new party and no new kind of personal data**. It structures what the visitor already says to the assistant. This page lists what is stored, what the AI model sees, how long it stays, and how it is deleted. It is a description of the code, not legal advice: the privacy notice itself is for the site's owner to review (see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)).

## What is stored

In the same SQLite database, on the server where the site runs, in five tables that hang off the conversation (`ai_discovery`, `ai_discovery_facts`, `ai_discovery_requirements`, `ai_discovery_plans`, `ai_discovery_notes`):

| Data | Source | Contains personal data? |
| --- | --- | --- |
| Stage, project type, skipped stages, complexity characteristics, draft version | the server, from the conversation | no |
| Facts: project name, objective, problem, audience, existing site, budget idea, timeline, maintenance | the visitor's words (typed in the panel, or recorded by the assistant from the conversation) | **only if the visitor writes it there**; the interface and the system prompt tell the visitor not to enter sensitive personal data |
| Requirements (titles, descriptions, categories, priorities, status) | the visitor's words and the assistant's suggestions | same |
| Plan versions (codes plus the visitor's own words) and the visitor's notes | generated from the above | same |

**Not stored here, ever:** the visitor's name, e-mail address, company or any other contact detail (they are entered in the approval form, held in `ai_approvals`, and put into the quote request only if the visitor approves); prices; API keys or tokens; IP addresses.

## What the AI model sees

- The **conversation text**, as before.
- **Compact tool results** (the current stage, what is missing, the facts clipped to 200 characters, requirement titles clipped to 80, counts, the complexity level): the visitor's *own* discovery, never another visitor's, never anything from the quote system, the bookings, the customers or the administration.
- **Never** the visitor's name, e-mail or company (not part of the discovery, not in any prompt), never a quote reference before it exists, never an API key.

## What is logged

Tool calls are logged by **name, status and duration only** (in `ai_tool_calls`, for the administration's counters). The server log never contains what a visitor wrote: field names such as `name`, `token`, `session` are masked by the logger, and the discovery code logs no text of its own. The administration sees **counts only** (conversations, discoveries started, plan versions made); it has no screen that shows a conversation or a discovery.

## Retention and deletion

- The discovery lives **exactly as long as its conversation**, by the same retention (set by the owner; the conversation window shows the number of days).
- **The visitor can delete a conversation at any time**: the text is removed at once, and so is every row of its discovery (draft, facts, requirements, plan versions, notes) in the same transaction (`eraseDiscovery`). *(Verified in the browser journey against the scratch database: all five tables hold zero rows for the deleted conversation, and the API answers 404.)*
- **"Start over"** deletes the discovery and the plan projected into the quote workflow (not for a conversation that was sent).
- The retention job (`eraseConversation`) deletes the discovery rows with the conversation.
- A quote request that was **sent** is a different record: it belongs to the quote system and follows *its* retention, not the conversation's. The visitor is told that sending creates a request.
- Backups, where the owner has enabled them, contain the database as it was (see the backup documentation); a deleted discovery disappears from future backups.

## Where the visitor is told

- In the discovery panel: *"You enter your name and email address in the form below, not in the chat; the AI model does not see them."*, and *"The studio uses the details to answer this request, as described in the privacy notice."*
- In the privacy notice (`/privacy`, assistant section, three languages): a sentence added by PROMPT 30 says that what is recorded about the project (type, requirements, plan versions, notes) is stored with the conversation text, for the same time, and removed at once when the conversation is deleted; that the assistant cannot confirm anything on the visitor's behalf; and that the plan is a proposal, not a quote.

## Pages, caches, referrers

The discovery has **no URL of its own**; its data travels only in API responses, which are `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `nosniff`, with no cookie. The `/control-room` page is a public page whose HTML holds no visitor data (the discovery is loaded by script with the visitor's session token after the page is open); it was not changed to `noindex` by this work. The session token lives in `sessionStorage` (this tab only) as before; the discovery adds no browser storage.

## Not verified

The wording of the privacy notice, the legal basis, the retention period and the provider's own terms are the owner's to confirm; nothing in this work invents them.
