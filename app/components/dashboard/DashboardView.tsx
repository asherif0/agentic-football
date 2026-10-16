"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useAnalytics, useRunIndex, useWorkspace } from "../../lib/data/hooks";
import { dateTime, ms, pct, signed, usd } from "../../lib/format";
import {
  isUniform,
  modelLabel,
  parseModelMap,
  seriesVar,
} from "../../lib/models";
import { replayable, result } from "../../lib/runs";
import { usePreparation } from "../Preparation";
import { NAV } from "../shell/nav";
import { Icon } from "../ui/Icon";
import { Button, Card, EmptyState, ModelMix, Skeleton } from "../ui/primitives";
import { Stat } from "../ui/Stat";
import { HeroReplay } from "./HeroReplay";
import s from "./dashboard.module.css";

const HEADLINE = [
  "Five",
  "agents.",
  "One",
  "shape.",
  "Find",
  "the",
  "prompts",
  "that",
  "win.",
];

export default function DashboardView() {
  const { data: index } = useRunIndex(),
    { data: analytics } = useAnalytics({}),
    { data: ws } = useWorkspace(),
    { value: p } = usePreparation();
  const replays = index ? replayable(index.runs) : [];
  // The hero shows the most convincing stored local win.
  const best = useMemo(
    () =>
      [...replays]
        .filter(
          (r) =>
            r.status === "completed" && r.evidenceOrigin === "local simulation",
        )
        .sort(
          (a, b) =>
            b.score.for - b.score.against - (a.score.for - a.score.against) ||
            b.score.for - a.score.for ||
            b.played - a.played,
        )[0] ?? replays[0],
    [index],
  );
  const groups = useMemo(
    () =>
      [...(analytics?.groups ?? [])].sort(
        (a, b) =>
          (b.goalDifferencePer60 ?? -99) - (a.goalDifferencePer60 ?? -99),
      ),
    [analytics],
  );
  const runs = analytics?.runs ?? [];
  const totals = useMemo(() => {
    const samples = runs
      .flatMap((r) => r.successfulSamples ?? [])
      .sort((a, b) => a - b);
    return {
      matches: runs.length,
      winRate: runs.length
        ? runs.filter((r) => r.stats.goals > r.against.goals).length /
          runs.length
        : null,
      median: samples.length
        ? samples[Math.ceil(samples.length / 2) - 1]
        : null,
      cost: runs.reduce((n, r) => n + (r.cost ?? 0), 0),
    };
  }, [runs]);
  const team = ws?.records.teams.find((t) => t.id === p.team);
  const top = groups[0];
  const maxAbs = Math.max(
    0.5,
    ...groups.map((g) => Math.abs(g.goalDifferencePer60 ?? 0)),
  );

  const status: Record<string, React.ReactNode> = {
    "/squad": (
      <>
        <span className={s.stepValue}>
          <ModelMix models={p.models} /> {team?.label ?? "No squad yet"}
        </span>
        <span>{modelLabel(p.models)}</span>
      </>
    ),
    "/simulate": (
      <>
        <span className={s.stepValue}>{replays.length} stored replays</span>
        <span>
          {replays[0]
            ? `Latest ${dateTime(replays[0].createdAt)}`
            : "No matches yet"}
        </span>
      </>
    ),
    "/analytics": (
      <>
        <span className={s.stepValue}>
          {groups.length} configurations compared
        </span>
        <span>
          {top
            ? `Leader ${signed(top.goalDifferencePer60, 1)} GD/60 · ${modelLabel(top.modelMap)}`
            : "No completed matches"}
        </span>
      </>
    ),
    "/prompts": (
      <>
        <span className={s.stepValue}>
          {ws?.records.prompts.length ?? "—"} prompt versions
        </span>
        <span>Export all five as Markdown or JSON</span>
      </>
    ),
  };

  return (
    <>
      <section className={s.hero} aria-labelledby="hero-title">
        <div className={s.heroText}>
          <span className={s.heroEyebrow}>
            <span className={s.pulse} /> Agentic Football Lab · 5v5
          </span>
          <h1 id="hero-title" className={s.headline}>
            {HEADLINE.map((w, i) => (
              <span key={i}>
                <span
                  className={`${s.word} ${i >= 6 ? s.lime : ""}`}
                  style={{ ["--i" as string]: i }}
                >
                  {w}
                </span>{" "}
              </span>
            ))}
          </h1>
          <p className={s.lede}>
            Give each of five players its own prompt and model, replay every
            stored match decision by decision, and take the strongest prompts
            with you.
          </p>
          <div className={s.heroCtas}>
            {best || !index ? (
              <Button
                variant="primary"
                size="lg"
                href={best ? `/simulate?run=${best.id}` : "/simulate"}
                icon="play"
              >
                Watch the best match
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                href="/simulate?new=1"
                icon="plus"
              >
                Start your first match
              </Button>
            )}
            <Button
              size="lg"
              href="/prompts?export=1"
              icon="download"
              className={s.ghostDark}
            >
              Export prompts
            </Button>
          </div>
        </div>
        <div className={s.heroPitch}>
          <HeroReplay runId={best?.id ?? null} />
          {index && !best && (
            <div className={s.caption}>
              <span>
                No matches yet. A Mock match runs without an API key and shows
                how replays work.
              </span>
            </div>
          )}
          {best && (
            <div className={s.caption}>
              <span>
                <span className={s.heroScore}>
                  {best.score.for}–{best.score.against}
                </span>{" "}
                · {modelLabel(best.team.models)} · {best.team.family} ·{" "}
                {best.team.label}
              </span>
              <Link href={`/simulate?run=${best.id}`}>
                Inspect decisions <Icon name="arrowUpRight" size={13} />
              </Link>
            </div>
          )}
        </div>
      </section>

      <nav className={s.journey} aria-label="Workflow" data-reveal>
        {NAV.filter((n) => n.step).map((n) => (
          <Link key={n.href} href={n.href} className={s.step}>
            <span className={s.stepTop}>
              <span className={s.stepNum}>{n.step}</span>
              <span className={s.stepIcon}>
                <Icon name={n.icon} size={17} />
              </span>
            </span>
            <span>
              <span className={s.stepTitle}>{n.label}</span>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                {n.blurb}
              </p>
            </span>
            <span className={s.stepStatus}>{status[n.href]}</span>
          </Link>
        ))}
      </nav>

      <div className={s.kpis} data-reveal>
        <Stat
          label="Completed matches"
          value={analytics ? totals.matches : null}
        />
        <Stat label="Win rate" value={totals.winRate} format={(n) => pct(n)} />
        <Stat
          label="Median decision"
          value={totals.median}
          format={(n) => ms(n)}
        />
        <Stat
          label="Estimated spend"
          value={analytics ? totals.cost : null}
          format={(n) => usd(n)}
        />
      </div>

      <div className={s.two}>
        <Card
          title="Leaderboard"
          sub="Goal difference per 60 s against the scripted opponent. Small samples; a lead, not a verdict."
          actions={
            <Button
              size="sm"
              variant="ghost"
              href="/analytics"
              iconRight="arrowRight"
            >
              Analytics
            </Button>
          }
          data-reveal
        >
          {!analytics ? (
            <Skeleton height={220} />
          ) : groups.length ? (
            <ol className={s.board}>
              {groups.slice(0, 6).map((g, i) => {
                const m = parseModelMap(g.modelMap),
                  v = g.goalDifferencePer60 ?? 0,
                  w = (Math.abs(v) / maxAbs) * 50;
                return (
                  <li
                    key={g.teamId + g.modelMap + g.provider + g.duration}
                    className={s.boardRow}
                  >
                    <span className={s.rank}>
                      {i === 0 ? <span className={s.rankTop}>1</span> : i + 1}
                    </span>
                    <span className={s.boardName}>
                      <span>
                        <ModelMix models={m} /> {modelLabel(m)} · {g.formation}
                      </span>
                      <span className={s.boardSub}>
                        {g.wins}W {g.draws}D {g.matches - g.wins - g.draws}L ·{" "}
                        {g.team}
                      </span>
                    </span>
                    <span className={s.gdBar} aria-hidden="true">
                      <span
                        style={{
                          left: v >= 0 ? "50%" : `${50 - w}%`,
                          width: `${w}%`,
                          background: isUniform(m)
                            ? seriesVar(m.GK)
                            : "var(--series-other)",
                        }}
                      />
                    </span>
                    <span className={s.gd}>
                      {signed(g.goalDifferencePer60, 1)}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState icon="chart" title="No completed matches yet" />
          )}
        </Card>
        <Card
          title="Recent matches"
          sub="Every replay is stored; playback never calls a model."
          actions={
            <Button
              size="sm"
              variant="ghost"
              href="/simulate"
              iconRight="arrowRight"
            >
              Simulate
            </Button>
          }
          data-reveal
        >
          {!index ? (
            <Skeleton height={220} />
          ) : (
            <ul className={s.recent}>
              {replays.slice(0, 5).map((r) => {
                const res = result(r);
                return (
                  <li key={r.id}>
                    <Link href={`/simulate?run=${r.id}`} className={s.match}>
                      <span className={`${s.res} ${res === "W" ? s.resW : ""}`}>
                        {r.score.for}–{r.score.against}
                      </span>
                      <span className={s.matchMain}>
                        <span>
                          <ModelMix models={r.team.models} />{" "}
                          {modelLabel(r.team.models)}
                        </span>
                        <span className={s.matchMeta}>
                          {r.team.family} · {r.team.label} ·{" "}
                          {r.evidenceOrigin === "test fixture"
                            ? "fixture"
                            : `seed ${r.seed}, ${r.side}`}
                        </span>
                      </span>
                      <span className={s.when}>{dateTime(r.createdAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
