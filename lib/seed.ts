import fs from "node:fs";
import path from "node:path";
import { emptyWorkspace, ROLES, PHASES, Workspace } from "./domain";
export function seed(): Workspace {
  const w = emptyWorkspace();
  const createdAt = "2026-10-07T00:00:00.000Z";
  const add = (kind: keyof Workspace, x: any) =>
    w[kind].push({ ...x, createdAt });
  const duties: Record<string, string[]> = {
    GK: [
      "Goal area",
      "Protect goal and distribute safely",
      "Restore goal coverage after distribution",
      "Stay available for a safe return pass.",
      "Cover goal relative to the ball.",
      "Find a clear outlet when safe.",
      "Protect goal before chasing loose balls.",
      "Release through a clear route; restore coverage.",
    ],
    DEF: [
      "Deepest outfield player",
      "Protect central routes and delay counters",
      "Cover behind MID; advance only with visible replacement cover",
      "Offer safe buildup behind MID.",
      "Cover the dangerous route while a teammate pressures.",
      "Offer a secure outlet before optional progression.",
      "Delay the attack while MID recovers.",
      "Offer GK a clear safe passing route.",
    ],
    MID: [
      "Between DEF and forwards",
      "Connect buildup and recover to help DEF",
      "Connect DEF to FOR2 and FOR1; protect DEF on loss",
      "Offer a clear support angle and progress safely.",
      "Cover central routes or pressure with cover.",
      "Connect the recovery to a forward outlet.",
      "Recover goal-side when pressure is not covered.",
      "Offer an outlet separate from DEF.",
    ],
    FOR1: [
      "Highest available outlet",
      "Create and finish credible scoring chances",
      "Keep a different lane or depth from FOR2",
      "Offer forward depth; pass if a teammate has a better chance.",
      "Pressure with cover or block an opposition outlet.",
      "Offer a reachable forward passing option.",
      "Help with an immediate threat; avoid duplicate pressure.",
      "Offer a clear forward route when available.",
    ],
    FOR2: [
      "Wide or below FOR1",
      "Support the ball and complement FOR1",
      "Come short when MID needs help; recover toward MID",
      "Provide width or depth different from FOR1.",
      "Cover a route when another player pressures.",
      "Offer a supporting pass around FOR1.",
      "Recover toward MID unless best placed to pressure with cover.",
      "Offer a supporting outlet when short buildup is blocked.",
    ],
  };
  const roles = Object.fromEntries(
    ROLES.map((r) => [
      r,
      {
        placement: duties[r][0],
        responsibility: duties[r][1],
        relationships: duties[r][2],
        phases: Object.fromEntries(PHASES.map((p, i) => [p, duties[r][i + 3]])),
      },
    ]),
  );
  add("formations", {
    id: "formation-112-r1",
    family: "1-1-2",
    name: "1–1–2",
    revision: 1,
    parentId: null,
    structure: "DEF → MID → FOR1 + FOR2 (GK behind)",
    failureMode: "The lone defender is exposed after possession loss.",
    status: "active",
    compatibility: "unconfirmed",
    roles,
    questions: ROLES.map((r) => ({
      id: `112-${r}`,
      role: r,
      text: `Did ${r} execute: ${duties[r][1].toLowerCase()}?`,
    })),
  });
  const sources = [
    [
      "fifa-manual",
      "FIFA Futsal Coaching Manual",
      "https://www.fifatrainingcentre.com/media/native/community-area-document/resources/futsal/FIFA_GFD_Futsal_Coaching_Manual_EN.pdf",
      "Chapter 11 — Futsal tactics",
      "Systems can change during play; players must understand the purpose of a structural change.",
      "Manual discovery verified; full PDF retrieval unavailable during initial research. No fixed 1–1–2 prescription established.",
    ],
    [
      "uefa-manual",
      "UEFA Futsal Coaching Manual",
      "https://www.uefa.com/MultimediaFiles/Download/uefaorg/CoachingCoachedu/02/50/17/35/2501735_DOWNLOAD.pdf",
      "Section 1.6.2.3 — 2-2 system, printed pp. 120–121",
      "Two attacking lines offer pair combinations and situations with two pivots, while defensive balance needs attention.",
      "2–2 is a reference for complementary attacking positions, not an equivalent of the portal 1–1–2.",
    ],
    [
      "fifa-gk",
      "FIFA Futsal Goalkeeping Coaching Manual",
      "https://www.fifatrainingcentre.com/media/native/community-area-document/resources/futsal/FIFA_GFD_Futsal_Goalkeeper_Manual_EN.pdf",
      "Chapter 4 — Tactical behaviours in possession",
      "Goalkeepers contribute to attack through distribution and choices after recovering possession.",
      "Real futsal permits actions and movement that are not confirmed in this engine; retain goal protection and legal-action constraints.",
    ],
    [
      "fifa-midblock",
      "José Venancio López — Defending in a mid-block",
      "https://www.fifatrainingcentre.com/en/practice/futsal/block-3/defending-in-a-mid-block.php",
      "Coaching points; 28 November 2023",
      "Anticipate play direction and apply pressure to wide ball carriers and receivers as the pass travels.",
      "Exercise constraints and coordinated timing are not engine guarantees. Pressure requires observed cover.",
    ],
    [
      "fifa-blueprint",
      "Performance blueprint: FIFA Futsal World Cup 2024",
      "https://www.fifatrainingcentre.com/en/game/tournaments/ffwc/2024/performance-blueprint-fifa-futsal-world-cup-2024.php",
      "Defensive phases of play; 18 March 2025",
      "FIFA analysis distinguishes pressing, counter-pressing, defensive transition and recovery.",
      "Elite tournament observations describe human teams; they do not prove optimal engine behavior.",
    ],
  ];
  sources.forEach(([id, title, url, locator, summary, limitations]) =>
    add("sources", {
      id,
      title,
      url,
      locator,
      summary,
      limitations,
      accessedAt: "2026-10-07",
    }),
  );
  const principles = [
    [
      "p-security",
      "Cover and recovery",
      ["fifa-midblock", "fifa-blueprint"],
      "Defensive pressure and recovery are distinct tactical tasks.",
      "For this engine, one player pressures only with observed cover; MID helps the lone DEF.",
    ],
    [
      "p-support",
      "Complementary support",
      ["fifa-manual", "uefa-manual"],
      "Futsal structures use relationships and combinations to open attacking options.",
      "FOR1 supplies depth while FOR2 provides an alternate lane or supporting depth.",
    ],
    [
      "p-distribution",
      "Goalkeeper distribution",
      ["fifa-gk"],
      "Possession recovery gives the goalkeeper a distribution decision.",
      "Choose a visible clear passing route while retaining goal protection.",
    ],
  ];
  principles.forEach(([id, title, sourceIds, claim, adaptation]) =>
    add("principles", { id, title, sourceIds, claim, adaptation }),
  );
  ROLES.forEach((r) =>
    add("hypotheses", {
      id: `h-${r}`,
      formationId: "formation-112-r1",
      title: `${r}: ${duties[r][1]}`,
      roles: [r],
      principleIds: [
        r === "GK"
          ? "p-distribution"
          : r === "DEF" || r === "MID"
            ? "p-security"
            : "p-support",
      ],
      behavior: duties[r][2],
      expectedFailure:
        r === "GK"
          ? "Unsafe release exposes goal."
          : r === "DEF" || r === "MID"
            ? "DEF isolated during transition."
            : "Forwards crowd the same lane or remain unreachable.",
      successCriterion: `Replay shows ${duties[r][1].toLowerCase()} without creating the expected failure.`,
    }),
  );
  const context = fs.readFileSync(
    path.join(process.cwd(), "ai_agentic_football_cup_context.md"),
    "utf8",
  );
  const blocks = [
    ...context
      .slice(context.indexOf("## 6."), context.indexOf("## 7."))
      .matchAll(/```text\n([\s\S]*?)\n```/g),
  ];
  if (blocks.length !== 5)
    throw new Error("Expected five original baseline prompts");
  ROLES.forEach((r, i) => {
    add("prompts", {
      id: `baseline-${r}`,
      label: `${r} baseline v0`,
      role: r,
      formationId: "formation-112-r1",
      parentId: null,
      text: blocks[i][1],
      hypothesisIds: [],
      status: "draft",
      rationale: "Exact original context prompt; untested baseline.",
    });
    const text = `You are ${r} in our five-player 1–1–2 team. GK protects goal, DEF anchors, MID links and recovers, FOR1 provides depth, and FOR2 supports.\n\nUse only current observed state, legal actions, and the platform response format. Do not wait for teammate messages. Make decisions promptly. Manager shouts do not override immediate goal protection.\n\nPriorities:\n1. Address an immediate threat to our goal when you can help without exposing a greater threat.\n2. ${duties[r][1]}. ${duties[r][2]}.\n3. In possession: ${duties[r][3]}\n4. Out of possession: ${duties[r][4]}\n5. After regaining possession: ${duties[r][5]}\n6. After losing possession: ${duties[r][6]}\n7. Goalkeeper distribution or restart: ${duties[r][7]}\n\nUse a visible clear route for passes. Avoid crowding a teammate or duplicating an effective press. Prefer a safe available option when progression is blocked. These priorities are provisional and must be tested.`;
    add("prompts", {
      id: `provisional-${r}`,
      label: `${r} research v1`,
      role: r,
      formationId: "formation-112-r1",
      parentId: `baseline-${r}`,
      text,
      hypothesisIds: [`h-${r}`],
      status: "draft",
      rationale:
        "Provisional source-informed role implementation; tactical adaptation, not validated engine evidence.",
    });
  });
  ["baseline", "provisional"].forEach((v) =>
    add("teams", {
      id: `team-${v}`,
      label:
        v === "baseline" ? "Original baseline v0" : "Research candidate v1",
      formationId: "formation-112-r1",
      parentId: v === "baseline" ? null : "team-baseline",
      promptIds: Object.fromEntries(ROLES.map((r) => [r, `${v}-${r}`])),
    }),
  );
  return w;
}
