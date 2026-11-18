# Launch checklist: the AI admin assistant

Nothing here has been done for you. The assistant is **off by default**, nothing in this work touches Render, Cloudflare, `main` or `deployment/render-cloudflare`, and **no real request has been made to the AI provider**. Do not call it production-ready until the production checks at the end have actually been run.

## Before it is merged and deployed

1. **Review the branch** `feature/ai-admin-assistant` (base: `feature/ai-project-discovery` @ `419795d`). It adds one migration, `0018_ai_admin_assistant.sql`; it modifies no earlier migration.
2. **Back up the database before the deploy.** Migration 0018 is additive, but a database that has had it applied **cannot be opened by older code** (the migration check refuses a database that is ahead of the code). A rollback therefore means restoring the backup, not just redeploying the old build.
3. Run the whole check yourself on the deployment branch: `npx tsc -b`, `npm run lint`, `npm test`, `npm run i18n:check`, `npm run i18n:validate`, `npm run build`, `npm run check:seo`, `npm audit` (see [TEST_RESULTS.md](TEST_RESULTS.md) for what was run on this branch and what it showed).

## Decisions only the owner can make

| Decision | Why it is yours |
| --- | --- |
| **May customer details be sent to the AI provider at all?** | The assistant sends excerpts of customer records (names, companies, what they wrote) to Anthropic when you ask it about them. Read Anthropic's terms for your account (retention, training, human review, region) and decide. Do not tell customers anything about the provider's retention until you have confirmed it. |
| **The privacy notice.** | One item was added (hu/en/nl) stating the fact of the processing, with no retention period, legal basis or guarantee. Review the wording, add what your own legal review requires, and have the Hungarian and Dutch proofread. |
| **Who may use it.** | Both roles (`admin`, `editor`) have `assistant:use` and, because both may read requests and customers, can ask about everything the system holds. To take it away from editors, remove `assistant:use` from the `editor` row in `server/src/modules/auth/permissions.ts`. There is no per-customer restriction (the permission system has none). |
| **Retention of conversations.** | They follow `AI_RETENTION_DAYS` (7 by default), the same setting as the visitors'. Tool results (customer excerpts) are part of a stored conversation. |
| **The limits.** | 60 questions per administrator per hour, 10 tool steps per answer, 3,000 answer tokens, 4,000 characters per question (AI screen → Admin assistant). The daily/monthly budgets and the operator's ceilings are shared with the visitors' assistant. |
| **Proofreading** of the Hungarian and Dutch screen texts (`src/admin/i18n/assistant.ts`). | They were not read by a native speaker. |

## Safe activation, in order

1. The server already has `ANTHROPIC_API_KEY` for the visitors' assistant. If not, set it in the environment (never in the browser, never in the repository).
2. AI screen → **Model** tab → run the **connection test**. It must verify Claude Haiku 5.5. (The admin assistant cannot be switched on before this; the switch is disabled and says why.)
3. AI screen → **Admin assistant** tab → read the limits → **Switch the admin assistant on**. It is recorded in the audit log.
4. Open `/admin/ai-assistant`. Ask something harmless first ("What needs my attention today?"). Check the **Admin assistant** tab's numbers afterwards: the estimated cost, the average response time, any failures.
5. Try a **record** context (a project) and ask for something about another customer: the answer must be "not available". Try "send the customer an e-mail": it must say it can only prepare a draft. Open a draft: it must say nothing was sent, and nothing may appear in the customer's conversation or inbox.
6. Compare a report's facts with the record pages it links to.
7. After any change of key or provider address, run the connection test again; a provider that answers as another model switches the assistant off by itself until you do.

To **switch it off** at any moment: the same switch (always possible), or `AI_ASSISTANT_ENABLED=false` in the environment (the operator's master switch for all AI).

## Known limitations

- **Never run against the real model.** The tests use a scripted mock; the browser journey uses a local stand-in that speaks Anthropic's API. How the real Haiku 5.5 handles these instructions and tools (quality of summaries, obedience to "Answer in Dutch", resistance to an injected instruction) is **unknown**. The design limits what a misbehaving model can do to *giving a wrong or unhelpful answer*: it has no tool that writes.
- **General context reaches everything the administrator may read.** Confidentiality between customers is enforced only in record contexts (in SQL); in the general context it is conduct (the prompt). Use a record context for sensitive work.
- **No per-record permissions** exist, so none is applied.
- **Private notes are not read**, so the assistant cannot take them into account — by design.
- **A general-context conversation that merely mentions a person is not removed by erasing that person**; retention removes it (default 7 days) and backups may hold it until they expire.
- **Customer text is untrusted data, handled by instruction as well as by design.** A model that obeyed an injected instruction still could not send, change, fetch or run anything.
- **Tool results are large relative to a chat message** and are part of the stored conversation and of the context sent on later questions (the history window is 20 messages): costs may be higher than a visitor's chat. Watch the numbers.
- **The cost shown is an estimate**, from reported tokens and the configured prices.
- **Report data field names are English** (stored names); a few reused administration words follow the administration's language, not the assistant's ([LOCALIZATION.md](LOCALIZATION.md)).
- **Printing** uses the browser's print dialog with a print style; it was checked with print-media emulation, not on paper or in every browser.
- **No scheduled briefing, no e-mail, no background job**: by design.

## Production checks that have **not** been done

- Nothing was deployed or run on Render/Cloudflare; the Content-Security-Policy, the proxy and the host's logging were not exercised with the assistant.
- No real Anthropic request, key, billing or rate limit was exercised.
- No real e-mail was sent; the e-mail provider/DNS items of earlier prompts are unchanged and still open.
- The behaviour with the real database size, real customer text and real response times is unknown.
