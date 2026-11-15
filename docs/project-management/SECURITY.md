# Security

Each line of the brief's list, **where it is enforced**, and **which test proves it** (all in `server/test/projectWork*.test.ts` unless another file is named). "Not proven" is said where it is true.

| Concern | Enforced by | Proof |
| --- | --- | --- |
| **The customer is identified by the session only** | `ctx.customer` from the cookie; no address, query or body names a customer; every query selects through the project the session's customer owns | `projectWorkData` ("the customer's: … a customer id … in the query or the body is never believed"), `projectWorkActions` (another customer, mixed references) |
| **IDOR**: another customer's task, project or request | The same query starts from `p.customer_id = ?`; anything else answers the **same 404** as something that does not exist (the same message) | `projectWorkActions` ("cannot answer a task that is not yours…", "only the customer who owns the project…") and the browser journey part D |
| **Private tasks, notes and review notes never reach a customer** | The customer's queries select named columns (`customer_description`, never `description`), filter `customer_visible = 1`; `internal_note` is not selected; events are filtered by `visibility` **and** by the task's / milestone's current visibility | `projectWorkActions` ("shows the customer only…", "the overview and the timeline"), journey D (a marker word in every page and every API answer) |
| **Admin routes need an administrator** | `auth: true` on every route and `requirePermission` in every business function | `projectWorkData` (every route: no session → 401, a customer's cookie → 401) |
| **CSRF** | Every change needs the session's token (admin and customer); a portal change also needs the same-origin check | the same sweep (a change without the token → 403); `projectWorkActions` ("needs a signed-in customer and the CSRF token") |
| **Roles** | an editor works on tasks, requests and milestones; categories need `clients:write`, the e-mail choices `system:write` | `projectWorkTasks` ("who may do what"), `projectWorkNotifications` ("the owner's choices") |
| **Validation and limits** | `Fields` per field: title 160, description 4000, words for the customer 2000, request 2000, answer 5000, note 1000 / 2000, category name 60, bulk 100, reorder 500; dates are real calendar days; enumerations are checked | `projectWorkTasks`, `projectWorkActions` ("validates the answer"), `projectWorkData` (categories) |
| **Mass assignment** | every body is read field by field against a list; an unknown field is refused (`422`): no id, creator, revision, status, completion time or reference can be set | `projectWorkTasks` ("refuses a field that does not exist"), `projectWorkActions` ("a customer cannot set a status") |
| **XSS** | React escapes every value; the e-mails go through the escaping layout; nothing is rendered as HTML; subjects are one line | `projectWorkActions` ("stores markup as text"), `projectWorkData` ("what a person writes is text": the e-mails and the API) |
| **Header injection** | titles in subjects are made one line; the mime layer refuses a line break in a header | `projectWorkData` ("a line break in a title…") |
| **SQL injection** | parameters for every value; the sort is a fixed map; the house rule that no SQL is built from a value is enforced by `security.test.ts` (which flagged one dynamic statement during this work, now a single fixed statement) | `projectWorkTasks` (search with `' OR 1=1 --`, `%`, `_`), `security.test.ts` |
| **Races** | one synchronous writer + conditional UPDATEs on the old status and revision + unique keys (one answer per revision, one message per thing) | `projectWorkData` ("two requests at once": three answers at once → one; two edits / moves from one screen → one; two reviews → one e-mail) |
| **A refused step leaves nothing behind** | one transaction per step; a nested failure rolls back to its savepoint | `projectWorkData` ("a step that is refused leaves nothing behind") |
| **Dependencies and loops** | application check **and** a database trigger; cross-project pairs refused by trigger | `projectWorkTasks` (dependencies), `projectWorkData` ("what the database refuses by itself") |
| **Answers cannot be altered** | trigger on `project_action_submissions`; transitions and history append-only | `projectWorkActions` ("a response is never changed…") |
| **Existence is not leaked** | the same 404 body for a task of someone else, a hidden task, a task that does not exist | `projectWorkActions` (the two messages are compared) |
| **Pages are not indexed or cached** | the portal is the existing private page (`noindex`, `no-store`, `Referrer-Policy: no-referrer`, nothing measured); the new addresses live below it | `src/portal/portal.test.ts` (unchanged, still passing) and the earlier browser journey |
| **No privacy notice change** | no new kind of data is collected: an answer is something the customer chose to write inside a portal they were invited to, kept like their other portal data; **but** see "Privacy" below | – |
| **Audit** | every change of the work is a line of `audit_log` (who, what, which record); never the text written | `projectWorkData` ("the administration's own record") |

## Privacy

The portal's privacy position is unchanged (no cookie beyond the session, no measurement of anything in the portal, nothing in the browser's storage). The one genuinely new thing is that **a customer's written answers are stored** until the owner erases them. The existing privacy notice describes the portal's data in general terms; **whether it needs a sentence about answers to requests is the owner's decision with a lawyer** ([LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)). No retention period or legal basis was invented here.

## What was not proven

No penetration test by a third party; no load test (SQLite with one writer is the stated model); the CSP of the built site was exercised only by the existing journeys, which load every new screen (no console violation was recorded, but no separate CSP report analysis was made); rate limits are `RATE_LIMITS=false` in the browser journeys and covered by the earlier suite for the existing portal limits (the new customer endpoints use the portal's `portal` limit class).
