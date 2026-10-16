# Simulator mechanics and evaluation

This is a local experimental 2D simulator, not the competition game engine. OpenAI inference runs remotely; orchestration, physics, rendering and SQLite persistence run locally. Mock runs are test fixtures and use scripted controls, ignoring prompt wording. Balanced, pressing and counterattacking opponents are local approximations, not reproductions of benchmark portal teams.

## Decisions

The default adapter uses [OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions), SDK 7.30+, model `gpt-6-luna`. The provider/model configuration is frozen in each run. Each player receives its exact stored role prompt plus a simulator contract, full team-relative observation and finite unranked action menu. No coordinate-generation call follows the choice. Five (or ten in head-to-head) independent calls run concurrently against one frozen state. Requests finish before simultaneous physics advances; network latency cannot improve simulated performance. Confidence/probabilities are saved as diagnostics without overriding actions.

Legal menus include hold, eight movement directions, eight dribble directions for the owner, teammate passes, three goal targets, and a tackle against the reachable opposing owner. Out-of-bounds destinations are excluded. Movement distance is speed × decision interval. Passes target the teammate’s frozen position, so receivers can move away. Actions are generated without reading prompts or ranking tactical merit. A separate explicitly selected Responses adapter chooses from the identical menu. Errors never switch providers.

Timeout: 30 seconds per request, SDK retries disabled. HTTP 429, 5xx and connection errors can receive one additional logged attempt within the ceilings. Refusals, invalid choices, cancellations and exhausted retries hold. Errors are sanitized; API response bodies and keys are not logged. Both attempted requests and retries consume budget. Before dispatch, reserve UTF-8 payload byte length + 2,048 as a conservative input-token allowance; known usage replaces the reservation. Unknown usage retains its reservation, rather than pretending it is zero. This bound is intentionally conservative, not a tokenizer or billing estimate. Only input is ceiling-controlled; output usage is recorded. A partially dispatched batch is logged but never advances physics when the ceiling prevents completing it.

Default 60 seconds / one decision per second plans 300 calls against bots, 600 head-to-head. A 12-match series plans 3,600 or 7,200 before retries; ceilings may stop it sooner. The UI displays planned calls and ceilings before starting. No cost or 10× speedup is assumed: median/p95 decision duration, per-round waiting time, failure rate, attempt usage and throughput are measured.

## Versioned rules: local-2d-v1 / eight-direction-v1 / event-stats-v1

- Pitch 40 × 20 local units, goal mouth y=8.5..11.5; fixed steps ≤0.05 seconds. The final step may be shorter. All players share movement speed 4 and dribble speed 3.2 units/second. A keeper differs only in save/control radius near its goal.
- Pass speed 13, shot speed 20. Seeded angular error is ±0.025 radians for passes, ±0.07 for shots. Ball speed decays by 0.985 each 0.05 seconds. No walls, rebounds, aerial play, fouls, offside, stamina or substitutions.
- Move while owning releases the ball; dribble retains it. The releasing player cannot immediately reclaim for 0.35 seconds. Segment collisions transfer free-ball possession within 0.5 units, or 0.85 for a keeper in its defending 18%. The earliest hit wins; distance and stable ID resolve exact ties. Tackles within 1.25 units have 55% seeded success and are resolved in seeded order independent of response order.
- Goal-line crossings inside the mouth score and reset anchor positions. The conceding MID takes the kickoff; the seeded first kickoff also uses MID. Boundary exits give the other team a nearest-player restart, inset 0.5 units. Movement is cleared after goals/restarts for the rest of that decision interval. These are simplifications, including no collision avoidance between players.
- Layouts are immutable normalized coordinates from each team’s attacking perspective. Away coordinates rotate 180°. Existing portal formations have no implied engine-coordinate mapping. Create a scenario for any new formation revision and assign all five labels by dragging dots. Suggested 1–1–2 positions are local assumptions.

## Statistics and raw measurements

Goals reflect actual goal-line crossings. Shots and passes count releases. Shots on target count a release whose perturbed initial trajectory projects into the goal mouth, including later blocks; this is a simulator definition, not a professional data vendor definition. A save is a goalkeeper’s interception of an opposing shot. A completed pass is an own-team reception by a player other than the passer. An interception is an opposing flight reception, excluding goalkeeper shot saves. Tackle attempts and successes are distinct. Possession time counts controlled-ball physics time; loose-ball time belongs to neither team.

A turnover is a controlled change to the opposing team after a possession; boundary restarts and kickoffs are separate. A dangerous turnover is such a loss with the ball in the losing team’s defending third. Counter bookmarks mark possession changes into attacking transition, not a human judgment of counter quality. Individual contributions credit the releasing, receiving, tackling, losing or scoring player as appropriate. Own goals count only at team level.

At each decision boundary, retain mean pairwise outfield distance; support options within 12 units and unobstructed by an opponent within 0.8 units of the pass segment; forward outlets on similarly clear segments; outfield players behind the ball; and elapsed time from loss until two outfield players recover behind it. A missing recovery stays null. These geometric measurements are raw evidence, not tactical scores. Formation-specific subjective questions remain available through Critical events annotations linked to the saved simulation match.

## Persistence, comparisons and endpoints

SQLite stores immutable team/prompt/formation snapshots, scenario versions, seed, rule versions, observations, legal menus, selected actions, attempt logs, confidence, probabilities, frames, events, raw measurements, stats, worker lease and mutable job control state. Saved frames play without API calls. Applied action logs reproduce physics with the saved engine version and seed. Empty-frame batches record requests discarded by a ceiling/control event; exclude them when replaying actions.

Paired series require the same formation revision, three consecutive seeds, both starting sides and distinct team versions. All opponent, provider/model, interval and rule settings stay fixed. Each team gets six runs. Summary tables count only completed runs, explicitly label fixtures and never promote automatically. Promotion history is a separate simulator table with manual written reasons. Use repeated evidence before promotion.

Existing experiments/matches acquire an additive evidence-origin classification in `evidence_origins`; their original immutable record bodies are preserved. Origins are portal, local simulation or test fixture. Portal summaries/promotions reject simulation evidence. Simulator evidence references a standard match for human annotations; it does not establish competition-engine performance.

- `GET /api/simulation`: status, key-configured boolean, scenarios, runs, series summaries and simulator promotions.
- `POST /api/simulation`: create a frozen run from team/scenario IDs, provider, per-role models, opponent IDs/style, seed, duration, interval and request/input-token ceilings.
- `GET /api/simulation/:id`: full replay/evidence export; `GET .../:id/events`: reconnectable server-sent state updates.
- `POST .../:id/control`: `{command:"pause"|"run"|"stop"}`.
- `POST /api/simulation/scenarios`: create immutable `{formationId,label,parentId,layout}`.
- `POST /api/simulation/series`: same run settings plus challenger team/scenario and series ceilings; or `{id,command}` for control. `GET .../series?id=...` returns the complete series and round logs.
- `POST /api/simulation/decisions`: manual `{teamId,outcome,reason,runIds}`; champions require completed non-fixture local evidence.

The server automatically starts one detached worker with a heartbeat lease. Viewer disconnection leaves it running. An interrupted worker does not resume an uncertain in-flight batch; it records interruption and allows a fresh repeat. A paused match resumes with the same state and consumed budgets. Change keys by restarting both app and worker; stop the standalone worker with Ctrl-C if you launched it manually. Worker logs are in `data/simulation-worker.log`.

## Model × formation analytics

New run manifests can freeze `team.inference` and opponent inference per role (`reasoningEffort`, `maxOutputTokens`), alongside the existing model maps. Responses supports independent models; Decisions validates its single supported model. Legacy snapshots without inference fields keep their prior provider defaults.

Observation `team-relative-v2` adds duration, time remaining, progress, a final-third indicator, and observed possession/shots/turnovers over the preceding ten simulated seconds. Cumulative statistics at decision boundaries are stored so pause/resume yields the same windows. Legacy v1 configurations do not acquire these fields. Adaptive prompt versions are conditional instructions, not an engine-side strategy switch.

Benchmark jobs share the series persistence/control boundary and freeze a matrix of model assignments, formation teams, scenarios, seeds, sides, provider, inference parameters and pricing. They reserve request count, input tokens and estimated cost in one SQLite transaction before dispatch. Output reservations use the frozen maximum output limit; input reservations assume no cache savings and allow cache-write pricing. Unknown usage keeps its reservation. Jobs stop at any ceiling; unavailable models are blocked without substitution. The initial authorized pilot is limited to 3,000 requests, 30M reserved input tokens and $5 estimated cost.

Analytics aggregates completed local simulation runs by the full model/prompt/provider/formation/opponent/rule configuration. Percentiles pool raw samples. Per-request timing, decision timing including retries, and round waiting time are different measurements. Throughput uses total round waiting time rather than queue time. Mixed-model team results stay attached to the whole assignment. Matched insights require the same conditions and shared seed/side keys; incomplete cells and fixtures are identified explicitly. The versioned summary cache is additive and does not alter immutable workspace evidence.
