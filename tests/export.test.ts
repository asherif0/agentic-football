import test from "node:test";
import assert from "node:assert/strict";
import { squadBundle, type ExportPlayer } from "../app/lib/export";
import { diffLines } from "../app/lib/diff";

const roles = ["FOR2", "GK", "DEF", "MID", "FOR1"] as const;
const players: ExportPlayer[] = roles.map((role) => ({
  role,
  promptId: `p-${role}`,
  promptLabel: `${role} v1`,
  parentId: null,
  text: `You are ${role}.\nKeep shape.`,
  model: role === "MID" ? "gpt-6-sol" : "gpt-6-luna",
  inference: { reasoningEffort: "low", maxOutputTokens: 1024 },
  evidence:
    role === "GK"
      ? { matches: 3, wins: 1, draws: 1, losses: 1, gdPer60: 0.5 }
      : null,
}));
const bundle = squadBundle({
  formation: { id: "f", family: "1–1–2", name: "1–1–2" },
  team: { id: "t", label: "Research candidate v1" },
  source: "Current squad",
  exportedAt: "2026-10-16T12:00:00.000Z",
  players,
});

test("squad JSON export carries every prompt in position order", () => {
  const j = JSON.parse(bundle.json);
  assert.equal(j.schema, "agentic-football.squad/v1");
  assert.deepEqual(
    j.players.map((p: any) => p.role),
    ["GK", "DEF", "MID", "FOR1", "FOR2"],
  );
  assert.equal(j.players[2].model, "gpt-6-sol");
  assert.equal(j.players[0].prompt, "You are GK.\nKeep shape.");
  assert.equal(j.players[0].evidence.matches, 3);
});

test("squad Markdown export fences each prompt and states the evidence", () => {
  assert.equal((bundle.md.match(/```text/g) ?? []).length, 5);
  assert.match(bundle.md, /## MID · MID v1/);
  assert.match(bundle.md, /3 local matches · 1W 1D 1L · GD\/60 \+0\.50/);
  assert.match(bundle.md, /Untested in the local simulator/);
  assert.ok(bundle.txt.indexOf("GK ·") < bundle.txt.indexOf("FOR2 ·"));
});

test("diffLines marks added and removed lines", () => {
  assert.deepEqual(diffLines("a\nb\nc", "a\nc\nd"), [
    { type: "same", text: "a" },
    { type: "del", text: "b" },
    { type: "same", text: "c" },
    { type: "add", text: "d" },
  ]);
});
