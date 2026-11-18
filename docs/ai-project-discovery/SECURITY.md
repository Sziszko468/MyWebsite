# Security

What the server enforces for the project discovery, threat by threat. Everything marked *(test)* is covered by an automated check named in [TEST_RESULTS.md](TEST_RESULTS.md); everything marked *(browser)* was also exercised in a real Chrome against the real backend with the stand-in provider.

## The boundaries

| Threat | What stops it |
| --- | --- |
| **Reading or changing another visitor's project** | Every route reaches the conversation through the visitor's **session** (`X-AI-Session`, an HMAC-signed anonymous token). A conversation of another session, or a requirement id of another conversation, is simply **not found (404)**; no session at all is 401. The model's tools do the same: they find the conversation by the session they run for, never by an id the model supplies. *(test, browser)* |
| **Cross-site requests** | The assistant's API is cookie-free (nothing for another site to ride on) and **refuses any unsafe request (PUT, POST, DELETE) whose `Origin` is not this site** (403). *(test, browser)* |
| **Two writers overwriting each other** (two tabs; the visitor and the assistant) | Every write names `expectedVersion`; a stale one is **409** and changes nothing. All changes run in one transaction. *(test, browser)* |
| **The model overwriting the visitor** | The assistant's writes are always `origin: assistant`, unconfirmed; the server **refuses** to replace anything the visitor wrote, confirmed or rejected (the refusal is returned to the model as a result it is told to respect). It has no tool to confirm, reject, delete or edit titles. *(test, browser)* |
| **The model sending a quote request** | There is no discovery tool that sends. `submitApprovedQuoteRequest` takes no arguments and succeeds only with a live approval *for this plan's hash*, which only the visitor's form can create; the snapshot is read back from the database and verified against its hash before anything is created. *(test, browser)* |
| **Prompt injection through what the visitor typed** | The visitor's words are data in the draft; they are shown to the model only inside tool results (clipped), never as instructions; every tool input is validated against a strict schema (unknown keys are errors), enumerations are closed, texts are length-limited, and tool results are validated against an output schema before the model sees them. The model has no tool that reads anything except published content and the visitor's own discovery. *(test)* |
| **SQL injection** | Every statement is parameterised; a static test fails the build if SQL is built by interpolation. A requirement id with SQL in it is "not found". *(test, browser)* |
| **Stored XSS** | Visitor text is rendered by React as text, never as HTML. A requirement titled `<img src=x onerror=…>` is drawn as text, creates no element and runs nothing. The API answers `application/json` with `nosniff` and a `default-src 'none'` CSP. *(test, browser)* |
| **Oversize or malformed input** | Facts ≤ 80–400 characters, titles ≤ 100, descriptions ≤ 400, notes ≤ 1,000, ≤ 60 requirements per conversation, ≤ 8 per tool call, ≤ 5 dependencies, ≤ 40 plan versions, request bodies size-limited by the server. Over-long, unknown or malformed values are **422** and change nothing; the version does not move on a refused write. *(test, browser)* |
| **Flooding** | A dedicated limiter (`aiDiscovery`, 90 requests per minute) in front of every discovery route, on top of the global limit and the assistant's own per-session and per-address budgets. *(test)* |
| **Secrets and contact details reaching the model or the logs** | The visitor's name and e-mail are entered in the panel's approval form and go only to the approval endpoint; the chat refuses card numbers and keys before storage or the provider; the logs never carry what a visitor wrote (field names such as `name`, `token`, `session` are masked, and tool calls are logged by name, status and duration only). *(test, browser)* |
| **Caching and referrer leaks** | Responses are `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, no cookie is set. The discovery has **no page or URL of its own**: its data travels only in API responses. *(browser)* |
| **A sent request being altered** | After sending, every write is **409 `sent`**; the request keeps the snapshot (version and hash) that was approved. *(test, browser)* |
| **Downgrade through the older plan form** | `PUT /plan` refuses a discovery plan (409 `discovery_plan`), so confirmation rules cannot be bypassed. *(test)* |

## What the model cannot do (closed set)

The eight discovery tools **cannot**: send a quote request, set or suggest a price, read another conversation, confirm or reject anything, delete a requirement, change a title, overwrite the visitor's values, or read anything outside the published content and this visitor's own discovery. They can: propose a type, record facts the visitor stated, propose requirements, record characteristics, make or revise a plan from the draft, summarise, and check completeness.

## Model lock

Unchanged: the assistant runs on **Claude Haiku 5.5** only; the identifier is a constant in the source and is verified by the activation test. PROMPT 30 adds no model, provider, key or setting that could change that.

## What this is not

It is not a penetration test. The checks above are the ones the code and the browser runs exercise; nothing was attacked from outside, and the production deployment (reverse proxy, real Cloudflare, real client addresses) was not involved. See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).
