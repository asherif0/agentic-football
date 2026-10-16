# Agentic Football Lab

A local, formation-aware research and evaluation dashboard for the Agentic Football Cup. Seeded with authoritative FIFA/UEFA source references, five exact original 1–1–2 baseline prompts, and five provisional research prompts. None are assumed validated.

## Run

Requires Node.js 22+ and npm. A project-local Node 22 runtime is installed for npm scripts. SQLite uses `better-sqlite3` (native module).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. For production: `npm run build` then `npm start`. Bind to localhost only: this is a personal workspace without authentication.

```sh
npm test
npm run typecheck
npm run build
```

## Workflow

1. Review Sources → Principles → Hypotheses. Source summaries and engine adaptations are separate. Manual sections whose complete PDFs were unavailable have explicit limitations.
2. Review the formation. Portal labels stay fixed; placements, phase duties, relationships and questions are editable data. Create a revision to confirm portal compatibility. Active revisions require complete duties for all five players.
3. Create prompt versions for the exact revision; retain parent IDs when adapting earlier prompts. Create a team containing one matching prompt for each player. Prompt text is capped at 6,000 characters.
4. Create an experiment with exact models, opponent, starting setup, shouts, and the intended variable. Export the manual preparation manifest and copy/download prompts. No portal API calls occur. A manifest with unconfirmed compatibility is explicitly marked unready.
5. Run matches manually. Enter known statistics, leaving unavailable values blank. Upload original setup JSON, reports, screenshots, or replay files; associate them using the attachment checklist. Files over 25 MB should be linked through the replay URL or split externally.
6. Annotate critical events with timestamp, phase, player, observations, diagnosis, and 0/1/2 execution scores. Blank scores mean not assessable. Formation-specific questions follow the exact match configuration.
7. Compare experiments. Differences in recorded conditions are flagged; cross-formation comparison requires opt-in. Synthetic fixtures never contribute to real summaries. Record champion/challenger or validation decisions with evidence and a written reason; promotion is never automatic.

Start with one match against each benchmark: Benchmark FC, Total Attack United, Fort Knox Athletic. Diagnose before changing one variable; repeat close or surprising outcomes.

## Add a formation without code changes

Use **Formations → New**, or **Duplicate as new formation**. Set a unique family (for example `2-1-1`), structure, descriptive placements, all five phase duties, relationships, expected failure, and execution questions. Set status to active when complete; portal compatibility starts unconfirmed. Create fresh prompts and a team referencing this revision. Previous evidence and champion history do not transfer. Creating another revision preserves the old one and all its references.

## Persistence and backups

- `data/lab.sqlite`: append-only records stored in SQLite with transactional validation.
- `data/attachments/<uuid>`: original uploaded bytes, including portal setup JSON; no parsing or rewriting.
- Workspace JSON export: portable schema version 1 records with attachment IDs, **not attachment bytes**. Import merges identical IDs, rejects conflicting immutable IDs, and rolls back invalid imports atomically. References to absent attachment bytes are preserved for later restoration.
- Back up the entire `data/` folder while the app is stopped to retain attachment bytes and the database. Do not commit personal reports.

No remote database, automated tactical judging, or portal runner is included. The optional simulator uses remote OpenAI inference. Portal statistics remain user-provided; source validity does not establish engine effectiveness. Research is linked and paraphrased rather than mirrored wholesale.

## Interfaces

`GET /api/workspace` returns `{schemaVersion:1, records, attachments}`. `POST /api/workspace` accepts `{kind,record}` or `{action:"import",manifest}`. Records cannot be updated or deleted through the API. `GET /api/workspace?experiment=<id>` prepares a manual execution bundle with `ready`, `warnings`, and `manifest`. `POST /api/attachments` accepts multipart `file`; `GET /api/attachments/<id>` downloads the original bytes.

`lib/portal.ts` defines the `PortalAdapter` boundary for a future runner. It is intentionally separate from versioning, research, and evaluation.

## Local simulation

Open **Simulation** for a pitch viewer, saved replays, decision traces, statistics and paired experiments. Read [simulator assumptions and API guide](docs/simulator.md).

1. Start with **Mock · fixture only** to verify the workflow without any API calls. Mock controls are scripted and do not interpret your prompts.
2. Put `OPENAI_API_KEY=...` in ignored `.env.local` (see `.env.example`), or supply it in the server environment. Never paste the key into a player prompt. Restart the app after changing environment settings. The worker reloads `.env.local` before each new run; to restart it explicitly, use `npm run worker:stop` before restarting the dashboard. Configuration status exposes only a boolean.
3. Select Decisions, your immutable team/scenario, duration and ceilings, then explicitly start the match. Decisions defaults to `gpt-6-luna`; Responses is a separate explicit selection. OpenAI SDK 7.30+ and Node 22+ are required.
4. Inspect execution traces, results, bookmarked evidence and repeated seeds. Local simulation evidence and champions are separate from portal validation.

The dashboard launches a detached local worker automatically. `npm run worker` can run it explicitly; its SQLite lease prevents duplicate workers. Closing the tab leaves jobs running. Pause waits for the current decision batch; stop cancels pending requests where possible. A crashed worker marks active jobs interrupted when it restarts. Back up the entire `data/` directory for jobs and replays; workspace record exports contain evidence references, while **Export replay + decisions** contains one complete simulation snapshot.

## Interface

Navigation highlights Overview, Simulation, Analytics and Player prompts, with supporting Evidence and Research groups. Player prompts use formation/revision selectors, five role tabs, and a version selector; selections persist for the browser session. Copy, download, source traceability, parent differences, and immutable revision creation remain available for the selected prompt.

Simulation bookmarks live on the replay timeline. Nearby events cluster at the current screen width; select a marker to seek, inspect events, or open an annotation draft. The Match library provides searchable Matches/Series tables, evidence/status filters, creation-time sorting, and 20-row pages. Match setup, scenarios, diagnostics, promotions, and workspace backup tools can be expanded when needed. Mobile navigation uses a drawer; interface transitions respect reduced-motion preferences.

### Revising prompts from annotation collections

Open **Evidence → Annotation collections**, or **Player prompts → Revise from annotations**. Choose a formation revision, player, parent prompt and evidence origin. Select up to 50 critical-event annotations from any matching matches, name the collection and save it. Collections are immutable; **Revise collection** creates a new one. Portal, local simulation and test fixture evidence stay separate. Different tested prompt versions are identified in the evidence sent to the model.

**Generate AI proposal** sends one bounded Responses API request using the server-side `OPENAI_API_KEY`. The model defaults to `gpt-6-luna`; override it with `PROMPT_REVISION_MODEL` in `.env.local` or the visible model field. Each click allows a conservative 50,000 input-token reservation, at most 4,096 output tokens, and a 60-second timeout, without retries or provider switching. Annotation text, exact prompts and match context are sent; replay files and attachments are not analyzed. Decisions remains the match-action provider; prompt drafting uses Responses for text generation. See [OpenAI structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Review evidence citations, uncertainties, the evaluation plan and parent differences. Edit the proposal before **Save reviewed prompt revision**. The saved draft retains the collection link, generation details and original AI proposal. Browser-session drafts restore when returning to the collection workspace. Saving does not update a team or promote a champion; create a new team version and run controlled comparisons. Portable workspace manifests include collections; older manifests without collections remain importable.

## Analytics and model benchmarks

The interface follows the local Stitch export with charcoal surfaces, restrained lime accents, compact record tables and icon-based replay controls. Overview, Simulation, Analytics and Player prompts are primary destinations; Evidence and Research contain the supporting workflows. All legacy records and replay actions remain available.

**Simulation → Responses** exposes independent models and inference settings for all five positions, including a separately configured agent opponent. Decisions remains restricted to `gpt-6-luna`. Settings and dated pricing are frozen in each new run. Existing runs retain their original observation/provider semantics.

The starter catalog adds **2–1–1** with GK + two defenders (DEF/MID), a connector (FOR1), and a high outlet (FOR2). The same labels remain stable across formations. Each formation also has five **adaptive v1** prompt revisions and a separate team version, all untested. Version 2 observations provide time remaining, match progress and ten-second rolling possession/shots/turnover summaries; physics and legal candidate generation are unchanged.

**Analytics → New benchmark** previews a model × formation matrix before starting it. The default pilot uses three models, two formations, seeds 42/43, both sides, 20 seconds, and a balanced scripted opponent: 24 matches / 2,400 normal requests. Its ceilings are 3,000 requests (including retries), 30 million reserved input tokens, and $5 estimated spend. Before each request, SQLite atomically reserves conservative input/output cost across the whole benchmark. Unknown usage retains its reservation. Pricing snapshots are dated and linked to official documentation; costs are estimates rather than invoice reconciliation. Models are never silently substituted.

Analytics defaults to completed **local simulation** evidence. Fixtures need explicit selection; partial/active/failed matches are separate. Charts have data-table alternatives and report pooled decision/request percentiles, round waiting, passing, shots, dangerous losses, support/cover/recovery, individual contributions, usage and estimated cost. Mixed-model teams are separate configurations. Formation comparisons describe the formation-and-prompt system; small samples do not establish general model intelligence or portal performance.

New APIs:

- `GET /api/analytics` supports benchmark, formation, team, prompt, model assignment, provider, opponent, origin, status, from/to filters; `export=json` downloads the result.
- `GET /api/benchmarks` lists jobs. `POST` with `action: "preview"` freezes a preview; `action: "create"` schedules it.
- `GET /api/benchmarks/:id` returns the manifest and runs; `POST` with `command: "run" | "pause" | "stop"` controls active jobs.

For the explicitly authorized pilot, `node --import tsx scripts/benchmark.ts start` creates the dated pilot once; `status` reports progress and `export` writes the manifest/results/insights under ignored `data/`. The worker executes independently of browser viewers. The pre-redesign database backup is `data/before-analytics-redesign.sqlite`.

### Prepare → Simulate → Evaluate → Prompts

The sidebar now has four stages. **Prepare** contains team setup, formation/scenario configuration, immutable strategy revisions, team versions, and sources. Principles and formation hypotheses are available from sources. **Simulate** offers a single match or an improvement campaign. **Evaluate** contains analytics, campaign results, match evidence, annotations/collections, and the existing portal tools. **Prompts** retains role/version selection, manual revisions and annotation-based proposals, plus campaign provenance.

Start an autonomous campaign by selecting a team, saved scenario and strategy in Prepare. In Simulate → Improvement campaign, enter a dollar ceiling, review the request/token/generation ceilings, preview, then start. No campaign starts just by opening the application. Optional existing runs must match the baseline's exact model map, inference, formation, positions, duration, provider and engine versions; selected in-progress runs are awaited. Human annotations are optional. Changes to strategy create a new revision; existing campaign manifests stay frozen.

A campaign first gathers discovery evidence if needed, then generates one player's revision with a single structured Responses request. It creates an immutable team version reusing the other four prompts. Machine evidence bundles cite real run IDs and contain bounded trace/event samples and raw outcomes; they are separate from human annotations. Protected strategy instructions must be preserved verbatim. Sources are never invented. The generator may decline to propose a change when evidence is insufficient.

Screening uses three scripted styles, one seed, both sides and both teams (12 matches). A candidate earning more match points advances to three fresh validation seeds (36 matches). Adoption requires complete matching evidence, ≤1% failed decisions per arm, more match points, and a one-sided exact paired sign-permutation test with `alpha = 0.05 / maxGenerations`. The nine opponent/seed blocks each group both starting sides. This is a local operational selection rule, not proof of competition-engine performance; remote inference is stochastic even when physics seeds match. Goal difference, possession and safety statistics remain diagnostic.

At 60 seconds, a full generation plans 14,400 player requests and one proposal request; cold discovery adds 1,800 player requests. The default three-generation maximum is 45,003 normal requests including cold discovery, before retries. Lower budgets can end the campaign with incomplete comparisons and no adoption. All actual proposal/player attempts share atomic request, input-token and estimated-spend reservations. Unknown usage retains its reservation; provider errors do not trigger substitutions or hidden proposal retries. Default stopping rules are three generations, two consecutive generations without adoption, a ceiling, or an operational failure. Review-before-adoption is optional.

Pause/resume/stop, reviewed adoption, manual active-team selection, and rollback are available in campaign details. Manual changes append history and invalidate stale automatic adoption. New single matches can use the locally adopted team when settings match; uncheck this option to run an exact selected team. Existing jobs and replays never change. Fixtures cannot adopt real active teams, and portal champions are independent.

Workspace and campaign JSON exports include linked strategies, generations, evidence, assessments, reservations, simulation manifests and replays. Imports preserve history, leave campaigns/jobs paused, and never deploy imported active-team pointers. Back up `data/` separately for original attachment bytes. Set `FOOTBALL_DATA_DIR` to use an isolated SQLite directory for local testing (the default is `data/`).

Campaign endpoints: `POST /api/campaigns` with `action: "preview"` for preview, otherwise creation; `GET /api/campaigns`; `GET/POST /api/campaigns/:id` for detail/controls (`run`, `pause`, `stop`, `approve`, `reject`); `/api/campaigns/:id/events` for SSE; `?export=1` for portable history. `GET/POST /api/strategies` handles immutable strategy revisions; `POST /api/local-team` records overrides/rollback with an expected active revision.

Run `npm run improvement:smoke` after a production build for an isolated production-HTTP/worker mock campaign. It verifies pause/resume, generation, paired screening, evidence separation, replay frames, SSE and export without paid calls, writing `data/improvement-smoke-report.json`.
