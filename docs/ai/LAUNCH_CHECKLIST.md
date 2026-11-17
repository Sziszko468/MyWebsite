# CONTROL ROOM AI: launch checklist

Everything here is an **owner action** or an honest "not verified". Tick them in order. The code is ready to be activated when these are done; **nothing in this repository does them for you** (no key was created, no host setting changed, no real request made).

## 1. Before anything

- [ ] **Decide where this code goes.** This work is on branch `feature/ai-production-activation` (based on `feature/client-communication`, commit `12e26dd`). It was not merged and not deployed. The deployment branch has a different history; merging is yours to plan. **Migration numbering**: this lineage adds `0016_ai_production_activation.sql`; if another branch also has a `0016`, one must be renumbered before they meet (the migrator refuses a database that has a number the code does not know).
- [ ] **Back up the database** before the first deploy that contains migration 0016 (it is additive, but a backup is the rollback for any schema).

## 2. The key (secret: never in Git, never in a chat)

- [ ] In the Anthropic Console create a **new** API key for this site only, in a **workspace of its own with a spend limit**. If any earlier key was ever pasted into a conversation, a ticket or a file, **revoke it**.
- [ ] Put it in the backend's secret environment as `ANTHROPIC_API_KEY` (Render → Environment). Do **not** put it in `.env.example`, in a `VITE_` variable, or in the administration (there is no field for it).
- [ ] Remove `ANTHROPIC_MODEL` if it is set (it is ignored; a different value keeps the assistant off).
- [ ] Check the **price list** in `server/src/modules/ai/pricing.ts` against <https://platform.claude.com/docs/en/about-claude/pricing> (Claude Haiku 5.5: $0.10 / $0.50 per million tokens up to 100 000 prompt tokens; read 2026-11-17). Override with `AI_PRICE_*` only if Anthropic changed them.
- [ ] Decide the **ceilings** (`AI_CEILING_*`; defaults: $25 a day, $250 a month) and the **starting budgets** (`AI_DAILY_BUDGET` 1, `AI_MONTHLY_BUDGET` 10). Set the matching **spend limit at Anthropic** a little above the monthly ceiling.
- [ ] `TRUST_PROXY` is set correctly for the host (see `docs/backend`), or every visitor shares one address for the per-address limit.
- [ ] Restart the backend; `npm run server:cli -- ai status` shows `apiKey: "set"`.

## 3. The live test (the only thing that calls the real provider)

- [ ] `npm run server:cli -- ai check --live` (or administration → AI → Model and connection → *Run connection test*). It sends **one** tiny request. It must report `ok: true` and `reportedModel: claude-haiku-5-5`. **Keep the output**: it is the evidence that the model answered.
- [ ] If it fails: `invalid_key` (401/403), `billing` (402), `model_not_found` (404: first check `ANTHROPIC_BASE_URL` ends in `/v1`), `network`, `timeout`. See [OPERATIONS.md](OPERATIONS.md#failure-runbook).
- [ ] Have a short real conversation yourself in each language (Hungarian, English, Dutch), including a project plan and (with a test address) a quote request. This is the **only** way to learn how the real model behaves: how it follows the instructions, uses the tools, resists a manipulation attempt, answers in the right language, how fast it is and what a conversation really costs. None of that has been measured.
- [ ] Compare **AI → Operations → Usage** with Anthropic's own usage page. If they differ, the provider is right: correct `pricing.ts`.

## 4. Switch it on

- [ ] AI → Model and connection → switch the assistant **on** (refused until the model is verified). It starts off, and a successful test never switches it on by itself.
- [ ] Open the site as a visitor (a private window): the button appears, the page works, the privacy link works, the deletion works.

## 5. Privacy and legal (yours; this repository gives no legal opinion)

- [ ] Read **Anthropic's terms for your account**: data retention, whether API data is used for training or human review, data location, the data-processing agreement. Then state what applies in the privacy notice (`src/content/privacy.ts`, section "Control Room AI": the last sentence says the owner must do this "before launch"; replace it when done) and in your own records.
- [ ] Decide whether the notice's retention (`AI_RETENTION_DAYS`, default 7 days) is what you want.
- [ ] Have the privacy notice and the interface texts reviewed by someone qualified, and by **native speakers of Hungarian and Dutch** (the wording was written without them; `npm run i18n:validate` checks spelling and structure only).

## 6. Watching it (first week)

- [ ] Look at **AI → Operations** every day: provider status, failures (and their request ids in the log), limits that stopped visitors, budget use, unknown-cost requests.
- [ ] Alerts appear **only in the administration**, not by e-mail. Decide whether you want an e-mail (a separate change), or make looking at the screen a habit.
- [ ] Know the rollback ([PRODUCTION_ACTIVATION.md](PRODUCTION_ACTIVATION.md#rollback)): switch off in the administration, or `AI_ASSISTANT_ENABLED=false`, or remove the key.

## What was not verified in this work

| Not verified | Why |
|---|---|
| any request to the real Anthropic API; the real model's behaviour, latency, token use and cost | no key was available and the rules forbade a paid call without an explicit opt-in |
| that *your* key may use `claude-haiku-5-5` | only the live test can say |
| prompt-injection resistance of the real model in free text | structural protections are tested; the model's own conduct is not |
| a real e-mail for an assistant-created quote request; Cloudflare/Render behaviour; DNS | no provider, no host access |
| physical devices, Safari, Firefox, a screen reader | the browser checks ran in Chromium with emulated phones (see [TEST_RESULTS.md](TEST_RESULTS.md)) |
| native-speaker quality of the Hungarian and Dutch texts | not available |
| behaviour behind several backend instances | the in-memory counters (per-address limit, answers at once) are per process; the deployment is one instance |
