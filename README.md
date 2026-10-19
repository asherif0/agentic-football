# Agentic Football Lab

A local lab for building, simulating and evaluating five-a-side football teams whose players are LLM agents. Give each of the five players its own prompt and model, replay every match decision by decision, compare configurations, and export the prompts that win.

It ships with FIFA/UEFA and futsal source references, two formations (1–1–2 and 2–1–1), and baseline, research and adaptive prompt versions for every position. None of them are assumed to be validated: the point of the lab is to collect evidence.

- **Squad**: pick a prompt version, model, reasoning effort and output limit per player. Models include OpenAI's GPT models and TypeSafe's Jev, and one team can mix them.
- **Simulate**: a 2D match engine with an animated pitch replay and each player's decision at every moment.
- **Analytics**: results, goal difference, decision latency, cost and per-position contributions across configurations.
- **Prompts**: version history with evidence, diffs against parent versions, and a one-click export of all five prompts (Markdown, JSON or text).

## Getting started

### Prerequisites

- **Node.js 22 or newer** and npm. With nvm, run `nvm use` (the repo has an `.nvmrc`). `npm install` also adds a project-local Node 22 runtime that the npm scripts use.
- **macOS, Linux or Windows (WSL).** The database uses `better-sqlite3`, which downloads a prebuilt binary for most platforms. If none matches yours it compiles from source, which needs Python 3 and a C++ toolchain (Xcode Command Line Tools on macOS, `build-essential` on Debian/Ubuntu).
- **Optional: model API keys.** An OpenAI key runs the GPT models; a [TypeSafe](https://docs.typesafe.ai) key runs **Jev**, TypeSafe's decision model. You only need keys for the models you use. Browsing, replays, analytics, prompt editing and export work without any.

### Install and run

```sh
git clone https://github.com/asherif0/agentic-football.git
cd agentic-football
nvm use              # optional, selects Node 22
npm install
cp .env.example .env.local   # optional: add OPENAI_API_KEY / JEV_API_KEY to run real matches
npm run dev
```

Open http://127.0.0.1:3000.

On first start the app creates `data/lab.sqlite` and seeds it with the formations, sources, prompts and team versions. A fresh install has **no matches yet**, so Simulate and Analytics start empty.

### Your first match

- **Without an API key:** open **Simulate → New match**, set the provider to **Mock**, and start. Mock matches use scripted controllers that do not read your prompts; they are labelled *test fixtures* and appear in Analytics under **Test fixtures**. Use them to try the replay and the workflow.
- **With an API key:** add `OPENAI_API_KEY` and/or `JEV_API_KEY` to `.env.local` and restart. Choose a prompt and model for each player on **Squad**, then **Simulate → New match**. Every match makes real, billed model calls. The setup drawer shows the planned number of calls and an estimated cost, and request and token ceilings stop a match cleanly.
- **Take the prompts with you:** **Prompts → Export squad** downloads all five prompts with their model settings and evidence.

Matches run in a background worker that the app starts when needed, so closing the browser tab does not stop them.

### Production build

```sh
npm run build
npm start
```

Both commands bind to `127.0.0.1`. There is no authentication, so do not expose the app on a public network.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://127.0.0.1:3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests (Node test runner) |
| `npm run typecheck` | TypeScript check |
| `npm run worker` / `npm run worker:stop` | Run or stop the simulation worker explicitly |
| `npm run benchmark` | Model × formation benchmark CLI (`start`, `status`, `export`) |
| `npm run improvement:smoke` | End-to-end mock campaign against a production build, no paid calls |

### Configuration

Set these in `.env.local` or the server environment.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enables the GPT models for matches and benchmarks, plus campaigns and AI prompt proposals. Never put it in a prompt. |
| `JEV_API_KEY` | Enables TypeSafe's Jev models (`jev-1.13.0`, `jev-1.14.0`) through `https://api.typesafe.ai/v1/systemone`. |
| `JEV_API_BASE` | Optional override for the TypeSafe API base URL. |
| `PROMPT_REVISION_MODEL` | Model used to draft prompt revisions (default `gpt-6-luna`). |
| `FOOTBALL_DATA_DIR` | Directory for the SQLite database and attachments (default `data/`). Useful for a separate test workspace. |
| `NEXT_DIST_DIR` | Build output directory (default `.next`), for running a second build next to a live one. |

### Project layout

```
app/(lab)/        pages: Home, Squad, Simulate, Analytics, Prompts, Library
app/components/   UI: shell, pitch replay, charts, page views
app/lib/          client helpers: data cache, playback, evidence, export
app/api/          API routes (runs, simulation, analytics, workspace, campaigns…)
lib/              match engine, providers, SQLite store, analytics, campaigns
scripts/          worker and CLI tools
tests/            unit tests
docs/simulator.md simulator assumptions and API guide
```

### Troubleshooting

- **`better-sqlite3` fails to load or build:** make sure you are on Node 22 (`node -v`), then run `npm rebuild better-sqlite3`.
- **Port 3000 is taken:** `npm run dev -- -p 3001`.
- **A match stays queued:** the worker may have stopped. Click **Wake simulator** (it appears in the sidebar while a match is waiting), or run `npm run worker`. `npm run worker:stop` stops it.
- **Start over:** stop the app and delete `data/lab.sqlite*`; it is re-seeded on the next start. Back up `data/` first if you want to keep your matches.

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

Use **Library → Formations → New formation**, or **Duplicate as new formation** on an existing one. Set a unique family (for example `2-1-1`), structure, descriptive placements, all five phase duties, relationships, expected failure, and execution questions. Set status to active when complete; portal compatibility starts unconfirmed. Create fresh prompts and a team referencing this revision. Previous evidence and champion history do not transfer. Creating another revision preserves the old one and all its references.

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

Open **Simulate** for the pitch replay, stored matches, per-player decision traces and statistics; **New match** opens the setup drawer. Read [simulator assumptions and API guide](docs/simulator.md).

1. Start with **Mock · fixture only** to verify the workflow without any API calls. Mock controls are scripted and do not interpret your prompts.
2. Put `OPENAI_API_KEY=...` in ignored `.env.local` (see `.env.example`), or supply it in the server environment. Never paste the key into a player prompt. Restart the app after changing environment settings. The worker reloads `.env.local` before each new run; to restart it explicitly, use `npm run worker:stop` before restarting the dashboard. Configuration status exposes only a boolean.
3. Build the squad on **Squad** (team version, starting positions and a model per player), then use **Simulate → New match** to set the opponent, duration and ceilings and explicitly start it. Decisions supports `gpt-6-luna` for every player; any other model mix runs on Responses automatically. OpenAI SDK 7.30+ and Node 22+ are required.
4. Inspect execution traces, results, bookmarked evidence and repeated seeds. Local simulation evidence and champions are separate from portal validation.

The dashboard launches a detached local worker automatically. `npm run worker` can run it explicitly; its SQLite lease prevents duplicate workers. Closing the tab leaves jobs running. Pause waits for the current decision batch; stop cancels pending requests where possible. A crashed worker marks active jobs interrupted when it restarts. Back up the entire `data/` directory for jobs and replays; workspace record exports contain evidence references, while **Full replay + decisions (JSON)** in the Simulate inspector contains one complete simulation snapshot.

## Interface

The app follows one journey, shown as numbered steps in the black navigation rail, with everything else under **Library**. Every page has a URL, so links and the back button work.

- **Home** replays the strongest stored match, shows the status of each step, a goal-difference leaderboard and recent matches.
- **01 Squad** builds a multi-model team: formation, team version, starting positions, and for each player a prompt version (with its evidence), a model, reasoning effort and output limit. Players are ringed in their model's colour; the provider follows the model mix. Prompt swaps can be saved as a new team version. The squad is remembered per browser and used by Simulate, campaigns and export.
- **02 Simulate** puts the pitch in the centre: a 60 fps interpolated replay with ball trail, intent lines to each player's chosen target, and goal/shot pulses. Your squad is always lime, whichever side it played. The inspector shows the selected player's decision at the current moment (chosen option, legal options, latency, tokens), the event feed and match statistics. Space plays/pauses and arrow keys step. Paused positions are kept in the URL (`?run=…&t=…`).
- **03 Analytics** compares configurations: results, goal difference per 60 s, decision latency, speed against result, cost per match and a per-position contribution heatmap. Filters live in the URL and every chart has a table view.
- **04 Prompts** shows each position's version history with honest evidence labels (untested, only tested, best observed with sample size), a line-numbered prompt view, a diff against the parent version, per-model evidence and traceability. **Export squad** packages all five prompts with model settings and evidence as Markdown, JSON (`agentic-football.squad/v1`) or plain text, from the current squad, the best observed versions, or any team version.
- **Library** holds sources, principles, hypotheses, formations, team versions, portal experiments and match evidence, comparisons, promotion history, critical events, annotation collections, improvement campaigns, benchmarks and paired series, and workspace backup/attachments.

The theme follows the system setting, with a light/dark/system toggle in the top bar. Type is Geist and Geist Mono; motion uses GSAP and respects reduced-motion preferences. Browsing never starts the simulation worker: pages read `GET /api/runs` (run summaries) and `GET /api/simulation/:id?view=replay|frames` (replays without observation payloads).

### Critical events from the replay

On **Simulate**, click **Annotate this moment** on a timeline marker, or **+** next to an event in the inspector's Events tab. The moment is saved to **Library → Critical events** straight away, with the match, time, phase of play, our player involved and a description filled in. A diagnosis is optional: add it in the dialog that opens, or later from the event's page in the Library. Records are immutable, so a diagnosis is saved as a reviewed version linked to the original, and lists show only the newest version. Annotated moments show ✓, and clicking them again opens the diagnosis form instead of creating a duplicate. Mock (test fixture) matches can't be annotated.

### Revising prompts from annotation collections

Open **Library → Collections**, or **Prompts → Revise from annotations**. Choose a formation revision, player, parent prompt and evidence origin. Select up to 50 critical-event annotations from any matching matches, name the collection and save it. Collections are immutable; **Revise collection** creates a new one. Portal, local simulation and test fixture evidence stay separate. Different tested prompt versions are identified in the evidence sent to the model.

**Generate AI proposal** sends one bounded Responses API request using the server-side `OPENAI_API_KEY`. The model defaults to `gpt-6-luna`; override it with `PROMPT_REVISION_MODEL` in `.env.local` or the visible model field. Each click allows a conservative 50,000 input-token reservation, at most 4,096 output tokens, and a 60-second timeout, without retries or provider switching. Annotation text, exact prompts and match context are sent; replay files and attachments are not analyzed. Decisions remains the match-action provider; prompt drafting uses Responses for text generation. See [OpenAI structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Review evidence citations, uncertainties, the evaluation plan and parent differences. Edit the proposal before **Save reviewed prompt revision**. The saved draft retains the collection link, generation details and original AI proposal. Browser-session drafts restore when returning to the collection workspace. Saving does not update a team or promote a champion; create a new team version and run controlled comparisons. Portable workspace manifests include collections; older manifests without collections remain importable.

## Analytics and model benchmarks

**Squad** exposes independent models and inference settings for all five positions; **Simulate → New match** configures an optional agent opponent. Decisions remains restricted to `gpt-6-luna`. Settings and dated pricing are frozen in each new run. Existing runs retain their original observation/provider semantics.

The starter catalog adds **2–1–1** with GK + two defenders (DEF/MID), a connector (FOR1), and a high outlet (FOR2). The same labels remain stable across formations. Each formation also has five **adaptive v1** prompt revisions and a separate team version, all untested. Version 2 observations provide time remaining, match progress and ten-second rolling possession/shots/turnover summaries; physics and legal candidate generation are unchanged.

**Library → Benchmarks & series → New benchmark** previews a model × formation matrix before starting it. The default pilot uses three models, two formations, seeds 42/43, both sides, 20 seconds, and a balanced scripted opponent: 24 matches / 2,400 normal requests. Its ceilings are 3,000 requests (including retries), 30 million reserved input tokens, and $5 estimated spend. Before each request, SQLite atomically reserves conservative input/output cost across the whole benchmark. Unknown usage retains its reservation. Pricing snapshots are dated and linked to official documentation; costs are estimates rather than invoice reconciliation. Models are never silently substituted.

Analytics defaults to completed **local simulation** evidence. Fixtures need explicit selection; partial/active/failed matches are separate. Charts have data-table alternatives and report pooled decision/request percentiles, round waiting, passing, shots, dangerous losses, support/cover/recovery, individual contributions, usage and estimated cost. Mixed-model teams are separate configurations. Formation comparisons describe the formation-and-prompt system; small samples do not establish general model intelligence or portal performance.

New APIs:

- `GET /api/analytics` supports benchmark, formation, team, prompt, model assignment, provider, opponent, origin, status, from/to filters; `export=json` downloads the result.
- `GET /api/benchmarks` lists jobs. `POST` with `action: "preview"` freezes a preview; `action: "create"` schedules it.
- `GET /api/benchmarks/:id` returns the manifest and runs; `POST` with `command: "run" | "pause" | "stop"` controls active jobs.

For the explicitly authorized pilot, `node --import tsx scripts/benchmark.ts start` creates the dated pilot once; `status` reports progress and `export` writes the manifest/results/insights under ignored `data/`. The worker executes independently of browser viewers. The pre-redesign database backup is `data/before-analytics-redesign.sqlite`.

### Improvement campaigns

Start an autonomous campaign from **Library → Improvement campaigns**: it uses your current squad and starting positions plus a strategy chosen on that page. Enter a dollar ceiling, review the request/token/generation ceilings, preview, then start. No campaign starts just by opening the application. Optional existing runs must match the baseline's exact model map, inference, formation, positions, duration, provider and engine versions; selected in-progress runs are awaited. Human annotations are optional. Changes to strategy create a new revision; existing campaign manifests stay frozen.

A campaign first gathers discovery evidence if needed, then generates one player's revision with a single structured Responses request. It creates an immutable team version reusing the other four prompts. Machine evidence bundles cite real run IDs and contain bounded trace/event samples and raw outcomes; they are separate from human annotations. Protected strategy instructions must be preserved verbatim. Sources are never invented. The generator may decline to propose a change when evidence is insufficient.

Screening uses three scripted styles, one seed, both sides and both teams (12 matches). A candidate earning more match points advances to three fresh validation seeds (36 matches). Adoption requires complete matching evidence, ≤1% failed decisions per arm, more match points, and a one-sided exact paired sign-permutation test with `alpha = 0.05 / maxGenerations`. The nine opponent/seed blocks each group both starting sides. This is a local operational selection rule, not proof of competition-engine performance; remote inference is stochastic even when physics seeds match. Goal difference, possession and safety statistics remain diagnostic.

At 60 seconds, a full generation plans 14,400 player requests and one proposal request; cold discovery adds 1,800 player requests. The default three-generation maximum is 45,003 normal requests including cold discovery, before retries. Lower budgets can end the campaign with incomplete comparisons and no adoption. All actual proposal/player attempts share atomic request, input-token and estimated-spend reservations. Unknown usage retains its reservation; provider errors do not trigger substitutions or hidden proposal retries. Default stopping rules are three generations, two consecutive generations without adoption, a ceiling, or an operational failure. Review-before-adoption is optional.

Pause/resume/stop, reviewed adoption, manual active-team selection, and rollback are available in campaign details. Manual changes append history and invalidate stale automatic adoption. New single matches can use the locally adopted team when settings match; uncheck this option to run an exact selected team. Existing jobs and replays never change. Fixtures cannot adopt real active teams, and portal champions are independent.

Workspace and campaign JSON exports include linked strategies, generations, evidence, assessments, reservations, simulation manifests and replays. Imports preserve history, leave campaigns/jobs paused, and never deploy imported active-team pointers. Back up `data/` separately for original attachment bytes. Set `FOOTBALL_DATA_DIR` to use an isolated SQLite directory for local testing (the default is `data/`).

Campaign endpoints: `POST /api/campaigns` with `action: "preview"` for preview, otherwise creation; `GET /api/campaigns`; `GET/POST /api/campaigns/:id` for detail/controls (`run`, `pause`, `stop`, `approve`, `reject`); `/api/campaigns/:id/events` for SSE; `?export=1` for portable history. `GET/POST /api/strategies` handles immutable strategy revisions; `POST /api/local-team` records overrides/rollback with an expected active revision.

Run `npm run improvement:smoke` after a production build for an isolated production-HTTP/worker mock campaign. It verifies pause/resume, generation, paired screening, evidence separation, replay frames, SSE and export without paid calls, writing `data/improvement-smoke-report.json`.

## License

[MIT](LICENSE). Use it, change it and share it; keep the copyright notice.
