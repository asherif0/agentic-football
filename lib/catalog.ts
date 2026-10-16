import { PHASES, ROLES, RecordData } from "./domain";
import type { createStore } from "./store";
export const ADAPTIVE_GUIDANCE = `\n\nMID-GAME ADAPTATION v1\nRead matchContext and recentTrends each decision. Keep your formation duties and teammate cover throughout. If level or playing effectively, maintain the effective shape rather than changing for its own sake. In the final third of the match (progress >= 0.667), protect a lead with secure passing, available outlets and defensive cover. When trailing late, offer progressive passing angles and credible shots while retaining a goalkeeper and covering the central counter route. After repeated dangerous turnovers (at least two in the recent window), simplify buildup and recover goal-side; a small sample is uncertain. If recent opponent shots increase, restore central cover and avoid duplicate pressure. Adapt through the supplied legal actions only; do not assume new abilities, substitutions or teammates changing formation.`;
export const STARTER_LAYOUTS = {
  "formation-211-r1": {
    GK: { x: 0.06, y: 0.5 },
    DEF: { x: 0.25, y: 0.3 },
    MID: { x: 0.25, y: 0.7 },
    FOR1: { x: 0.5, y: 0.5 },
    FOR2: { x: 0.72, y: 0.5 },
  },
};
export function ensureLabCatalog(s: ReturnType<typeof createStore>) {
  s.db.transaction(() => {
    let w = s.read();
    if (
      !w.formations.some((f) => f.id === "formation-211-r1") &&
      !w.formations.some((f) => f.family === "2-1-1" && f.revision === 1)
    ) {
      const duties = {
        GK: [
          "Goalkeeper",
          "Protect goal and provide safe distribution",
          "Stay behind both defenders and offer a return pass",
        ],
        DEF: [
          "Left/deep defender",
          "Protect central depth and cover the second defender",
          "Stagger with MID; never advance together without replacement cover",
        ],
        MID: [
          "Right/second defender",
          "Provide a second buildup outlet and cover on possession loss",
          "Complement DEF; support FOR1 without abandoning both defensive lanes",
        ],
        FOR1: [
          "Central connector",
          "Link the two defenders to the high forward",
          "Offer an angle below FOR2; recover centrally to help DEF and MID",
        ],
        FOR2: [
          "Highest forward",
          "Provide depth and finish credible chances",
          "Stay reachable from FOR1; pressure with cover and avoid duplicating the connector",
        ],
      };
      s.save("formations", {
        id: "formation-211-r1",
        family: "2-1-1",
        name: "2–1–1",
        revision: 1,
        parentId: null,
        structure: "GK behind DEF + MID → FOR1 → FOR2",
        failureMode:
          "The connector can become isolated; simultaneous defender advances expose the goal.",
        status: "active",
        compatibility: "unconfirmed",
        roles: Object.fromEntries(
          ROLES.map((r) => [
            r,
            {
              placement: duties[r][0],
              responsibility: duties[r][1],
              relationships: duties[r][2],
              phases: Object.fromEntries(
                PHASES.map((p) => [
                  p,
                  p === "In possession"
                    ? `Offer a clear passing lane. ${duties[r][1]}.`
                    : p === "Defensive transition"
                      ? `Recover goal-side and restore cover. ${duties[r][2]}.`
                      : `${duties[r][1]}. ${duties[r][2]}.`,
                ]),
              ),
            },
          ]),
        ),
        questions: ROLES.map((r) => ({
          id: `211-${r}`,
          role: r,
          text: `Did ${r} maintain ${duties[r][0].toLowerCase()} duties and connected cover?`,
        })),
      });
    }
    w = s.read();
    const f = w.formations.find((f) => f.id === "formation-211-r1");
    if (f)
      for (const role of ROLES) {
        const hid = `hypothesis-211-${role}`;
        if (!s.read().hypotheses.some((h) => h.id === hid))
          s.save("hypotheses", {
            id: hid,
            title: `2–1–1 ${role}: connected shape`,
            formationId: f.id,
            roles: [role],
            principleIds: w.principles.slice(0, 1).map((p) => p.id),
            behavior: f.roles[role].responsibility,
            expectedFailure: f.failureMode,
            successCriterion:
              "Review support angles, defensive cover and recoveries across repeated matched simulations. Untested transfer of sourced principles.",
          });
        const pid = `provisional-211-${role}`;
        if (!s.read().prompts.some((p) => p.id === pid))
          s.save("prompts", {
            id: pid,
            label: "2–1–1 provisional v1",
            role,
            formationId: f.id,
            parentId: null,
            text: `You play ${role} in a 2–1–1 with a goalkeeper. Starting duty: ${f.roles[role].placement}. ${f.roles[role].responsibility}. ${f.roles[role].relationships}.\n${PHASES.map((p) => `${p}: ${f.roles[role].phases[p]}`).join("\n")}\nChoose observable safe support and cover before speculative progression.`,
            hypothesisIds: [hid],
            rationale:
              "Provisional formation-specific application of existing sourced principles. No validation transfers from 1–1–2.",
            status: "draft",
          });
      }
    if (f && !s.read().teams.some((t) => t.id === "team-211-provisional"))
      s.save("teams", {
        id: "team-211-provisional",
        label: "2–1–1 · provisional",
        formationId: f.id,
        parentId: null,
        promptIds: Object.fromEntries(
          ROLES.map((r) => [r, `provisional-211-${r}`]),
        ),
      });
    for (const [family, parentTeamId] of [
      ["112", "team-provisional"],
      ["211", "team-211-provisional"],
    ]) {
      w = s.read();
      const parent = w.teams.find((t) => t.id === parentTeamId);
      if (!parent) continue;
      for (const role of ROLES) {
        const p = w.prompts.find((p) => p.id === parent.promptIds[role])!;
        const id = `adaptive-${family}-${role}-v1`;
        if (!s.read().prompts.some((p) => p.id === id))
          s.save("prompts", {
            ...p,
            id,
            createdAt: undefined,
            label: `${family === "112" ? "1–1–2" : "2–1–1"} adaptive v1`,
            parentId: p.id,
            text: p.text + ADAPTIVE_GUIDANCE,
            status: "draft",
            rationale:
              "Untested conditional mid-game strategy revision. Preserve role duties while reacting to score, time and measured recent trends.",
            collectionId: undefined,
            aiProposal: undefined,
          });
      }
      const id = `team-${family}-adaptive-v1`;
      if (!s.read().teams.some((t) => t.id === id))
        s.save("teams", {
          id,
          label: `${family === "112" ? "1–1–2" : "2–1–1"} · adaptive v1`,
          formationId: parent.formationId,
          parentId: parent.id,
          promptIds: Object.fromEntries(
            ROLES.map((r) => [r, `adaptive-${family}-${r}-v1`]),
          ),
        });
    }
  })();
}
