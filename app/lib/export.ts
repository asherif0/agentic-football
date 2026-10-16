import { ROLES, type Role } from "../../lib/domain";
import type { InferenceSettings } from "../../lib/simulation/types";

export type ExportPlayer = {
  role: Role;
  promptId: string;
  promptLabel: string;
  parentId: string | null;
  text: string;
  model: string;
  inference?: InferenceSettings;
  evidence?: {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    gdPer60: number | null;
  } | null;
};

export type SquadExport = {
  formation: { id: string; family: string; name: string };
  team: { id: string; label: string } | null;
  source: string;
  exportedAt: string;
  players: ExportPlayer[];
};

const DISCLAIMER =
  "Evidence comes from the local 2D simulator against scripted opponents. It is not portal validation.";

const evidenceLine = (e: ExportPlayer["evidence"]) =>
  e && e.matches
    ? `${e.matches} local match${e.matches === 1 ? "" : "es"} · ${e.wins}W ${e.draws}D ${e.losses}L · GD/60 ${e.gdPer60 === null ? "—" : (e.gdPer60 > 0 ? "+" : "") + e.gdPer60.toFixed(2)}`
    : "Untested in the local simulator";

const settings = (p: ExportPlayer) =>
  [
    p.model,
    p.inference ? `reasoning ${p.inference.reasoningEffort}` : null,
    p.inference ? `${p.inference.maxOutputTokens} max output tokens` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** One squad, three portable formats. Players are always in GK → FOR2 order. */
export function squadBundle(x: SquadExport) {
  const players = ROLES.map((r) => x.players.find((p) => p.role === r)).filter(
    (p): p is ExportPlayer => !!p,
  );
  const date = x.exportedAt.slice(0, 10);
  const md = [
    `# ${x.formation.family} squad — ${x.team?.label ?? "custom lineup"}`,
    "",
    `Exported ${date} from Agentic Football Lab · ${x.source}`,
    "",
    `> ${DISCLAIMER}`,
    "",
    "| Position | Prompt | Model | Local evidence |",
    "|---|---|---|---|",
    ...players.map(
      (p) =>
        `| ${p.role} | ${p.promptLabel} | ${p.model} | ${evidenceLine(p.evidence)} |`,
    ),
    "",
    ...players.flatMap((p) => [
      `## ${p.role} · ${p.promptLabel}`,
      "",
      `${settings(p)}  `,
      `${evidenceLine(p.evidence)}`,
      "",
      "```text",
      p.text,
      "```",
      "",
    ]),
  ].join("\n");
  const json = JSON.stringify(
    {
      schema: "agentic-football.squad/v1",
      exportedAt: x.exportedAt,
      source: "Agentic Football Lab",
      selection: x.source,
      disclaimer: DISCLAIMER,
      formation: x.formation,
      team: x.team,
      players: players.map((p) => ({
        role: p.role,
        promptId: p.promptId,
        promptLabel: p.promptLabel,
        parentId: p.parentId,
        model: p.model,
        inference: p.inference ?? null,
        prompt: p.text,
        evidence: p.evidence ?? null,
      })),
    },
    null,
    2,
  );
  const txt = players
    .map((p) => `${p.role} · ${p.promptLabel} · ${settings(p)}\n\n${p.text}`)
    .join("\n\n────────\n\n");
  return { md, json, txt };
}
