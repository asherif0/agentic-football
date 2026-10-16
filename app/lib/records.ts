import {
  DIMENSIONS,
  PHASES,
  ROLES,
  type Kind,
  type RecordData,
  type Workspace,
} from "../../lib/domain";

export const KIND_LABELS: Record<Kind, string> = {
  formations: "Formations",
  sources: "Sources",
  principles: "Principles",
  hypotheses: "Hypotheses",
  prompts: "Player prompts",
  teams: "Team versions",
  experiments: "Experiments",
  matches: "Match evidence",
  annotations: "Critical events",
  decisions: "Promotion history",
  collections: "Annotation collections",
};

export const REF_KINDS: Record<string, Kind> = {
  formationId: "formations",
  teamId: "teams",
  comparatorTeamId: "teams",
  experimentId: "experiments",
  matchId: "matches",
  sourceIds: "sources",
  principleIds: "principles",
  hypothesisIds: "hypotheses",
  matchIds: "matches",
};

export const recordName = (x: RecordData) =>
  x.label ||
  x.title ||
  x.name ||
  (x.timestamp ? `${x.role} · ${x.phase} · ${x.timestamp}` : x.id);

/** Where a record lives in the new information architecture. */
export function hrefFor(kind: Kind, id: string) {
  return kind === "prompts"
    ? `/prompts?prompt=${encodeURIComponent(id)}`
    : `/library/${kind}?record=${encodeURIComponent(id)}`;
}

/** Records of a kind that belong to the selected formation family ("all" keeps everything). */
export function relevant(kind: Kind, w: Workspace, family = "all") {
  const formationIds = w.formations
    .filter((f) => family === "all" || f.family === family)
    .map((f) => f.id);
  return w[kind].filter((x) => {
    if (family === "all" || ["sources", "principles"].includes(kind))
      return true;
    if (kind === "formations") return formationIds.includes(x.id);
    if (kind === "decisions") return x.family === family;
    if (x.formationId) return formationIds.includes(x.formationId);
    const team =
      kind === "teams"
        ? x
        : kind === "experiments"
          ? w.teams.find((t) => t.id === x.teamId)
          : w.teams.find(
              (t) =>
                t.id ===
                w.experiments.find(
                  (e) =>
                    e.id ===
                    (kind === "matches"
                      ? x.experimentId
                      : w.matches.find((m) => m.id === x.matchId)
                          ?.experimentId),
                )?.teamId,
            );
    return !!team && formationIds.includes(team.formationId);
  });
}

/** A blank draft for a new record of this kind, prefilled from recent records. */
export function template(k: Kind, w: Workspace, family = "all"): any {
  const formations = w.formations.filter(
    (f) => family === "all" || f.family === family,
  );
  const f = formations.at(-1) || w.formations.at(-1),
    t = relevant("teams", w, family).at(-1) || w.teams.at(-1),
    e = relevant("experiments", w, family).at(-1),
    m = relevant("matches", w, family).at(-1);
  switch (k) {
    case "formations":
      return {
        family: "new-formation",
        name: "New formation",
        revision: 1,
        parentId: null,
        structure: "Describe the outfield structure",
        failureMode: "Expected structural weakness",
        status: "draft",
        compatibility: "unconfirmed",
        roles: Object.fromEntries(
          ROLES.map((r) => [
            r,
            {
              placement: "",
              responsibility: "",
              relationships: "",
              phases: Object.fromEntries(PHASES.map((p) => [p, ""])),
            },
          ]),
        ),
        questions: ROLES.map((r) => ({
          id: `question-${r}`,
          role: r,
          text: `Did ${r} perform the intended duty?`,
        })),
      };
    case "sources":
      return {
        title: "",
        url: "",
        locator: "",
        accessedAt: new Date().toISOString().slice(0, 10),
        summary: "",
        limitations: "",
      };
    case "principles":
      return { title: "", sourceIds: [], claim: "", adaptation: "" };
    case "hypotheses":
      return {
        title: "",
        formationId: f?.id || "",
        roles: ["MID"],
        principleIds: [],
        behavior: "",
        expectedFailure: "",
        successCriterion: "",
      };
    case "prompts":
      return {
        label: "",
        role: "GK",
        formationId: f?.id || "",
        parentId: null,
        text: "",
        hypothesisIds: [],
        status: "draft",
        rationale: "",
      };
    case "teams":
      return {
        label: "",
        formationId: f?.id || "",
        parentId: null,
        promptIds: Object.fromEntries(
          ROLES.map((r) => [
            r,
            w.prompts
              .filter((p) => p.role === r && p.formationId === f?.id)
              .at(-1)?.id || "",
          ]),
        ),
      };
    case "experiments":
      return {
        label: "",
        teamId: t?.id || "",
        comparatorTeamId: null,
        opponent: "Benchmark FC",
        models: Object.fromEntries(ROLES.map((r) => [r, ""])),
        setup: "",
        shouts: "",
        variable: "Baseline mapping",
        expectedOutcome: "",
        hypothesisIds: [],
        synthetic: false,
      };
    case "matches":
      return {
        label: "",
        experimentId: e?.id || "",
        synthetic: e?.synthetic || false,
        evidenceOrigin: e?.evidenceOrigin || "portal",
        goalsFor: null,
        goalsAgainst: null,
        shotsFor: null,
        shotsAgainst: null,
        onTargetFor: null,
        onTargetAgainst: null,
        dangerousTurnovers: null,
        latencyFailures: "",
        executionFailures: "",
        primaryDiagnosis: "",
        nextHypothesis: "",
        replayUrl: "",
        attachmentIds: [],
      };
    case "annotations":
      return {
        matchId: m?.id || "",
        timestamp: "",
        phase: PHASES[0],
        role: "GK",
        observation: "",
        diagnosis: "",
        scores: Object.fromEntries(DIMENSIONS.map((d) => [d, null])),
        evidenceIds: [],
      };
    case "decisions":
      return {
        family: f?.family || "",
        teamId: t?.id || "",
        outcome: "challenger",
        reason: "",
        matchIds: [],
      };
    case "collections":
      return null;
  }
}

/** A new draft that revises an existing record (records are immutable). */
export function reviseDraft(k: Kind, old: RecordData, w: Workspace): any {
  const { id, createdAt, ...copy } = old;
  if (k === "formations") {
    copy.parentId = id;
    copy.revision =
      Math.max(
        ...w.formations
          .filter((f) => f.family === old.family)
          .map((f) => f.revision),
      ) + 1;
    copy.status = "draft";
    copy.compatibility = "unconfirmed";
  }
  if (k === "prompts") {
    copy.parentId = id;
    delete copy.collectionId;
    delete copy.aiProposal;
    delete copy.campaignId;
    delete copy.generationId;
    delete copy.evidenceBundleId;
    delete copy.strategyId;
    copy.status = "draft";
    copy.label += " revision";
  }
  if (k === "teams") {
    delete copy.campaignId;
    delete copy.generationId;
    delete copy.strategyId;
    copy.parentId = id;
    copy.label += " revision";
  }
  return copy;
}

export function duplicateFormationDraft(old: RecordData) {
  const { id, createdAt, ...copy } = old;
  return {
    ...copy,
    family: `${old.family}-copy`,
    name: `${old.name} copy`,
    revision: 1,
    parentId: id,
    status: "draft",
    compatibility: "unconfirmed",
  };
}

/** Sets a draft field and clears dependent fields that would become invalid. */
export function applyFieldChange(d: any, key: string, value: any) {
  const next = { ...d, [key]: value };
  if (key === "formationId") {
    if (next.hypothesisIds) next.hypothesisIds = [];
    if (next.promptIds)
      next.promptIds = Object.fromEntries(ROLES.map((r) => [r, ""]));
  }
  if (key === "role") {
    if (next.hypothesisIds) next.hypothesisIds = [];
    if (next.scores)
      next.scores = Object.fromEntries(
        DIMENSIONS.map((k) => [k, d.scores[k] ?? null]),
      );
  }
  if (key === "matchId")
    next.scores = Object.fromEntries(DIMENSIONS.map((k) => [k, null]));
  if (key === "teamId" && next.hypothesisIds) next.hypothesisIds = [];
  return next;
}
