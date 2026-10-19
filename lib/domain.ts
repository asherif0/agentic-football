export const ROLES = ["GK", "DEF", "MID", "FOR1", "FOR2"] as const;
export const PHASES = [
  "In possession",
  "Out of possession",
  "Attacking transition",
  "Defensive transition",
  "Goalkeeper distribution / restart",
] as const;
export const DIMENSIONS = [
  "Shape",
  "Spacing",
  "Support",
  "Depth",
  "Security",
  "Press / cover",
  "Recovery",
  "Transition attack",
  "Role discipline",
  "Decision quality",
] as const;
export const KINDS = [
  "formations",
  "sources",
  "principles",
  "hypotheses",
  "prompts",
  "teams",
  "experiments",
  "matches",
  "annotations",
  "decisions",
  "collections",
] as const;
export type Kind = (typeof KINDS)[number];
export type Role = (typeof ROLES)[number];
export type RecordData = { id: string; createdAt: string; [key: string]: any };
export type Workspace = Record<Kind, RecordData[]>;
export function emptyWorkspace(): Workspace {
  return Object.fromEntries(KINDS.map((k) => [k, []])) as unknown as Workspace;
}
const required = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const nonempty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
export function validate(kind: Kind, d: RecordData, w: Workspace) {
  required(nonempty(d.id), "ID required");
  const ref = (k: Kind, id: string) => {
    const x = w[k].find((x) => x.id === id);
    required(x, `Unknown ${k} reference: ${id}`);
    return x!;
  };
  const strings = (...keys: string[]) =>
    keys.forEach((k) => required(nonempty(d[k]), `${k} required`));
  const refs = (k: Kind, ids: unknown) => {
    required(Array.isArray(ids), "Reference list required");
    (ids as string[]).forEach((id) => ref(k, id));
  };
  if (kind === "formations") {
    strings("family", "name", "structure", "failureMode");
    required(
      ["draft", "active"].includes(d.status),
      "Invalid formation status",
    );
    required(
      ["unconfirmed", "confirmed"].includes(d.compatibility),
      "Invalid portal compatibility",
    );
    required(
      Number.isInteger(d.revision) && d.revision > 0,
      "Positive revision required",
    );
    required(
      !w.formations.some(
        (x) => x.family === d.family && x.revision === d.revision,
      ),
      "Formation revision already exists",
    );
    if (d.parentId) ref("formations", d.parentId);
    required(
      d.roles && typeof d.roles === "object",
      "Role configuration required",
    );
    if (d.status === "active")
      ROLES.forEach((r) => {
        const role = d.roles[r];
        required(
          role &&
            nonempty(role.placement) &&
            nonempty(role.responsibility) &&
            nonempty(role.relationships),
          `${r}: placement, responsibility and relationships required`,
        );
        PHASES.forEach((p) =>
          required(
            nonempty(role.phases?.[p]),
            `${r}: ${p} responsibility required`,
          ),
        );
      });
    required(
      Array.isArray(d.questions) &&
        d.questions.every(
          (q: any) =>
            nonempty(q.id) && nonempty(q.text) && ROLES.includes(q.role),
        ),
      "Questions need id, text and role",
    );
    required(
      new Set(d.questions.map((q: any) => q.id)).size === d.questions.length,
      "Question IDs must be unique",
    );
  }
  if (kind === "sources") {
    strings("title", "url", "locator", "accessedAt", "summary", "limitations");
    required(/^https?:\/\//.test(d.url), "HTTP source URL required");
  }
  if (kind === "principles") {
    strings("title", "claim", "adaptation");
    refs("sources", d.sourceIds);
    required(d.sourceIds.length, "Source attribution required");
  }
  if (kind === "hypotheses") {
    strings("title", "behavior", "expectedFailure", "successCriterion");
    ref("formations", d.formationId);
    refs("principles", d.principleIds);
    required(d.principleIds.length, "Principle required");
    required(
      Array.isArray(d.roles) &&
        d.roles.length &&
        d.roles.every((r: any) => ROLES.includes(r)),
      "Valid roles required",
    );
  }
  if (kind === "prompts") {
    strings("text", "rationale", "label");
    required(ROLES.includes(d.role), "Invalid player");
    ref("formations", d.formationId);
    required(d.text.length <= 6000, "Prompt exceeds 6,000 characters");
    refs("hypotheses", d.hypothesisIds);
    d.hypothesisIds.forEach((id: string) => {
      const h = ref("hypotheses", id);
      required(
        h.formationId === d.formationId && h.roles.includes(d.role),
        "Hypothesis must match formation and role",
      );
    });
    required(
      d.status === "draft",
      "New prompts must start as draft; evidence and decisions establish validation",
    );
    if (d.parentId) {
      const p = ref("prompts", d.parentId);
      required(p.role === d.role, "Parent must be same player");
    }
    if (d.collectionId) {
      const c = ref("collections", d.collectionId);
      required(
        c.parentPromptId === d.parentId &&
          c.formationId === d.formationId &&
          c.role === d.role,
        "Evidence collection must match the parent prompt, formation and player",
      );
    }
  }
  if (kind === "collections") {
    strings("label", "formationId", "parentPromptId", "evidenceOrigin");
    const p = ref("prompts", d.parentPromptId);
    required(
      p.formationId === d.formationId && p.role === d.role,
      "Collection parent must match formation revision and player",
    );
    refs("annotations", d.annotationIds);
    required(
      d.annotationIds.length > 0 && d.annotationIds.length <= 50,
      "Select between 1 and 50 annotations",
    );
    required(
      new Set(d.annotationIds).size === d.annotationIds.length,
      "Duplicate annotation",
    );
    d.annotationIds.forEach((id: string) => {
      const a = ref("annotations", id),
        m = ref("matches", a.matchId),
        e = ref("experiments", m.experimentId),
        t = ref("teams", e.teamId);
      required(
        a.role === d.role && t.formationId === d.formationId,
        "Annotations must match the collection player and exact formation revision",
      );
      required(
        (m.evidenceOrigin || (m.synthetic ? "test fixture" : "portal")) ===
          d.evidenceOrigin,
        "Keep portal, local simulation and test fixture collections separate",
      );
    });
  }
  if (kind === "teams") {
    strings("label");
    const f = ref("formations", d.formationId);
    required(f.status === "active", "Activate formation first");
    ROLES.forEach((r) => {
      const p = ref("prompts", d.promptIds?.[r]);
      required(
        p.role === r && p.formationId === f.id,
        `Invalid ${r} prompt for formation revision`,
      );
    });
    if (d.parentId) ref("teams", d.parentId);
  }
  if (kind === "experiments") {
    strings("label", "opponent", "setup", "variable", "expectedOutcome");
    ref("teams", d.teamId);
    ROLES.forEach((r) =>
      required(nonempty(d.models?.[r]), `Model required: ${r}`),
    );
    required(
      typeof d.shouts === "string",
      "Shouts must be exact text or empty",
    );
    required(
      !d.evidenceOrigin ||
        ["portal", "local simulation", "test fixture"].includes(
          d.evidenceOrigin,
        ),
      "Invalid evidence origin",
    );
    required(typeof d.synthetic === "boolean", "Synthetic flag required");
    refs("hypotheses", d.hypothesisIds);
    const team = ref("teams", d.teamId);
    d.hypothesisIds.forEach((id: string) =>
      required(
        ref("hypotheses", id).formationId === team.formationId,
        "Experiment hypothesis formation mismatch",
      ),
    );
    if (d.comparatorTeamId) ref("teams", d.comparatorTeamId);
  }
  if (kind === "matches") {
    strings("label");
    const e = ref("experiments", d.experimentId);
    required(
      (d.evidenceOrigin || (d.synthetic ? "test fixture" : "portal")) ===
        (e.evidenceOrigin || (e.synthetic ? "test fixture" : "portal")),
      "Match must inherit evidence origin and synthetic classification",
    );
    required(
      d.synthetic === e.synthetic,
      "Match must inherit experiment synthetic flag",
    );
    [
      "goalsFor",
      "goalsAgainst",
      "shotsFor",
      "shotsAgainst",
      "onTargetFor",
      "onTargetAgainst",
      "dangerousTurnovers",
    ].forEach((k) =>
      required(
        d[k] === null || (Number.isInteger(d[k]) && d[k] >= 0),
        `${k}: nonnegative integer or null required`,
      ),
    );
    for (const side of ["For", "Against"]) {
      if (d["shots" + side] !== null && d["onTarget" + side] !== null)
        required(
          d["onTarget" + side] <= d["shots" + side],
          "On-target shots cannot exceed total shots",
        );
    }
    required(Array.isArray(d.attachmentIds), "Attachment list required");
    required(
      typeof d.replayUrl === "string" &&
        (!d.replayUrl || /^https?:\/\//.test(d.replayUrl)),
      "Replay must be an HTTP URL",
    );
  }
  if (kind === "annotations") {
    strings("timestamp", "observation");
    // A diagnosis is optional; it can be added later as a reviewed version.
    required(typeof d.diagnosis === "string", "diagnosis must be text");
    const m = ref("matches", d.matchId),
      e = ref("experiments", m.experimentId),
      t = ref("teams", e.teamId),
      f = ref("formations", t.formationId);
    if (d.parentId)
      required(
        ref("annotations", d.parentId).matchId === d.matchId,
        "A reviewed annotation must belong to the same match",
      );
    required(PHASES.includes(d.phase), "Invalid phase");
    required(ROLES.includes(d.role), "Invalid player");
    required(d.scores && typeof d.scores === "object", "Scores required");
    const allowed = [
      ...DIMENSIONS,
      ...f.questions
        .filter((q: any) => q.role === d.role)
        .map((q: any) => q.id),
    ];
    Object.entries(d.scores).forEach(([k, v]) =>
      required(
        allowed.includes(k) && (v === null || [0, 1, 2].includes(v as number)),
        `Invalid score: ${k}`,
      ),
    );
    required(
      Array.isArray(d.evidenceIds) &&
        d.evidenceIds.every((id: string) => m.attachmentIds.includes(id)),
      "Evidence must reference match attachments",
    );
  }
  if (kind === "decisions") {
    strings("reason");
    const t = ref("teams", d.teamId);
    const f = ref("formations", t.formationId);
    required(d.family === f.family, "Decision formation family mismatch");
    required(
      ["champion", "challenger", "tested", "validated", "rejected"].includes(
        d.outcome,
      ),
      "Invalid decision",
    );
    refs("matches", d.matchIds);
    if (["tested", "validated", "champion"].includes(d.outcome)) {
      required(d.matchIds.length, "Real match evidence required");
      d.matchIds.forEach((id: string) => {
        const m = ref("matches", id);
        const e = ref("experiments", m.experimentId);
        required(
          !m.synthetic &&
            (!e.evidenceOrigin || e.evidenceOrigin === "portal") &&
            e.teamId === t.id,
          "Evidence must be real and use this team",
        );
      });
    }
  }
}
export function compareConditions(a: RecordData, b: RecordData, w: Workspace) {
  const ta = w.teams.find((t) => t.id === a.teamId)!,
    tb = w.teams.find((t) => t.id === b.teamId)!;
  return {
    crossFormation: ta.formationId !== tb.formationId,
    changedPlayers: ROLES.filter(
      (r) =>
        w.prompts.find((p) => p.id === ta.promptIds[r])?.text !==
        w.prompts.find((p) => p.id === tb.promptIds[r])?.text,
    ),
    mismatches: [
      "opponent",
      "models",
      "setup",
      "shouts",
      "synthetic",
      "evidenceOrigin",
    ].filter((k) =>
      k === "models"
        ? ROLES.some((r) => a.models[r] !== b.models[r])
        : a[k] !== b[k],
    ),
  };
}
export function summarize(teamId: string, w: Workspace) {
  const ids = w.experiments
    .filter(
      (e) =>
        e.teamId === teamId &&
        !e.synthetic &&
        (!e.evidenceOrigin || e.evidenceOrigin === "portal"),
    )
    .map((e) => e.id);
  const matches = w.matches.filter(
    (m) => ids.includes(m.experimentId) && !m.synthetic,
  );
  const events = latestAnnotations(w).filter((a) =>
    matches.some((m) => m.id === a.matchId),
  );
  const keys = [
    ...new Set([
      ...DIMENSIONS,
      ...events.flatMap((a) => Object.keys(a.scores)),
    ]),
  ];
  const execution = Object.fromEntries(
    keys.map((k) => {
      const vals = events
        .map((a) => a.scores[k])
        .filter((v) => typeof v === "number");
      return [
        k,
        {
          n: vals.length,
          mean: vals.length
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : null,
        },
      ];
    }),
  );
  const complete = matches.filter(
    (m) => m.goalsFor !== null && m.goalsAgainst !== null,
  );
  const sum = (key: string) => {
    const known = matches.filter((m) => m[key] !== null);
    return {
      n: known.length,
      total: known.length ? known.reduce((a, m) => a + m[key], 0) : null,
    };
  };
  return {
    execution,
    results: {
      matches: matches.length,
      scored: complete.length,
      wins: complete.filter((m) => m.goalsFor > m.goalsAgainst).length,
      draws: complete.filter((m) => m.goalsFor === m.goalsAgainst).length,
      losses: complete.filter((m) => m.goalsFor < m.goalsAgainst).length,
      goalDifference: complete.length
        ? complete.reduce((a, m) => a + m.goalsFor - m.goalsAgainst, 0)
        : null,
    },
    supporting: {
      onTargetFor: sum("onTargetFor"),
      onTargetAgainst: sum("onTargetAgainst"),
      dangerousTurnovers: sum("dangerousTurnovers"),
    },
    repeatability: Object.fromEntries(
      [
        ...new Set(
          matches.map(
            (m) => w.experiments.find((e) => e.id === m.experimentId)!.opponent,
          ),
        ),
      ].map((o) => [
        o,
        matches.filter(
          (m) =>
            w.experiments.find((e) => e.id === m.experimentId)!.opponent === o,
        ).length,
      ]),
    ),
  };
}
/** Annotations without a later reviewed version (a child naming them as parentId). */
export function latestAnnotations(w: Pick<Workspace, "annotations">) {
  const replaced = new Set(
    w.annotations.map((a) => a.parentId).filter(Boolean) as string[],
  );
  return w.annotations.filter((a) => !replaced.has(a.id));
}
export function promptDiff(before: string, after: string) {
  const a = before.split("\n"),
    b = after.split("\n");
  return {
    removed: a.filter((l) => !b.includes(l)),
    added: b.filter((l) => !a.includes(l)),
  };
}

export function teamStatus(teamId: string, w: Workspace): string {
  const decisions = w.decisions.filter((d) => d.teamId === teamId);
  return decisions.at(-1)?.outcome || "untested";
}
export function promptStatus(promptId: string, w: Workspace): string {
  const teams = w.teams.filter((t) =>
    Object.values(t.promptIds).includes(promptId),
  );
  const statuses = teams.map((t) => teamStatus(t.id, w));
  return statuses.includes("validated")
    ? "validated"
    : statuses.some((s) => ["tested", "champion"].includes(s))
      ? "tested"
      : "draft";
}
export function currentChampion(
  family: string,
  w: Workspace,
): RecordData | undefined {
  const last = w.decisions
    .filter((d) => d.family === family && d.outcome === "champion")
    .at(-1);
  if (!last) return undefined;
  return w.teams.find((t) => t.id === last.teamId);
}
