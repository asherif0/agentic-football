import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../lib/store";
import { DIMENSIONS, PHASES, ROLES } from "../lib/domain";
import {
  annotationContext,
  parseProposal,
  proposalInput,
} from "../lib/prompt-proposals";
function fixture() {
  const s = createStore(":memory:");
  s.initialize();
  const e = s.save("experiments", {
    label: "Evidence",
    teamId: "team-baseline",
    opponent: "Test",
    models: Object.fromEntries(ROLES.map((r) => [r, "mock"])),
    setup: "Same",
    variable: "Baseline",
    expectedOutcome: "Observe",
    shouts: "",
    hypothesisIds: [],
    synthetic: true,
  });
  const m = s.save("matches", {
    label: "Play",
    experimentId: e.id,
    synthetic: true,
    goalsFor: null,
    goalsAgainst: null,
    shotsFor: null,
    shotsAgainst: null,
    onTargetFor: null,
    onTargetAgainst: null,
    dangerousTurnovers: null,
    replayUrl: "",
    attachmentIds: [],
  });
  const annotation = (role = "MID") =>
    s.save("annotations", {
      matchId: m.id,
      timestamp: "10s",
      phase: PHASES[0],
      role,
      observation: "Lost cover",
      diagnosis: "Support was too high",
      scores: Object.fromEntries(DIMENSIONS.map((d) => [d, null])),
      evidenceIds: [],
    });
  const a = annotation(),
    b = annotation();
  const collection = {
    label: "Recovery",
    formationId: "formation-112-r1",
    role: "MID",
    parentPromptId: "baseline-MID",
    evidenceOrigin: "test fixture",
    annotationIds: [a.id, b.id],
  };
  return { s, a, b, annotation, collection };
}
test("collections freeze multiple annotations with player and evidence context", () => {
  const { s, a, collection } = fixture();
  const c = s.save("collections", collection),
    w = s.read();
  assert.equal(annotationContext(a, w).testedPromptId, "baseline-MID");
  const input = proposalInput(c, w);
  const parsed = JSON.parse(input.input);
  assert.equal(parsed.annotations.length, 2);
  assert.equal(parsed.annotations[0].match.goalsFor, null);
  assert.ok(parsed.annotations[0].testedPromptText.length);
  assert.ok(input.reservedInputTokens > 0);
  assert.throws(() => s.save("collections", c), /immutable/);
  s.db.close();
});
test("collection rejects mixed player, revision, origin, duplicates and empty evidence", () => {
  const { s, a, annotation, collection } = fixture();
  const gk = annotation("GK");
  for (const bad of [
    { annotationIds: [] },
    { annotationIds: [a.id, a.id] },
    { annotationIds: [gk.id] },
    { evidenceOrigin: "portal" },
    { formationId: "unknown" },
    { annotationIds: ["missing"] },
  ])
    assert.throws(() => s.save("collections", { ...collection, ...bad }));
  s.db.close();
});
test("reviewed prompt keeps collection provenance through a fresh import", () => {
  const { s, collection } = fixture(),
    c = s.save("collections", collection),
    p = s.read().prompts.find((p) => p.id === "baseline-MID")!;
  const { id, createdAt, ...base } = p;
  const revision = s.save("prompts", {
    ...base,
    label: "Reviewed",
    parentId: p.id,
    collectionId: c.id,
    text: p.text + "\nRecover behind the ball.",
    aiProposal: { model: "test", originalProposal: { text: "Proposed" } },
  });
  const t = createStore(":memory:");
  t.importData({ schemaVersion: 1, records: s.read() });
  assert.equal(
    t.read().prompts.find((p) => p.id === revision.id)?.collectionId,
    c.id,
  );
  assert.equal(t.importData({ schemaVersion: 1, records: s.read() }), 0);
  assert.throws(
    () =>
      s.save("prompts", {
        ...base,
        parentId: "provisional-MID",
        collectionId: c.id,
      }),
    /collection must match/,
  );
  s.db.close();
  t.db.close();
});
test("legacy manifests without collections still import; invalid evidence rolls back", () => {
  const { s } = fixture();
  const old: any = s.read();
  delete old.collections;
  const t = createStore(":memory:");
  assert.ok(t.importData({ schemaVersion: 1, records: old }) > 0);
  const count = t.read().prompts.length;
  const records = s.read();
  records.collections.push({
    id: "bad",
    createdAt: new Date().toISOString(),
    label: "Bad",
    formationId: "formation-112-r1",
    role: "MID",
    parentPromptId: "baseline-MID",
    evidenceOrigin: "test fixture",
    annotationIds: ["unknown"],
  });
  assert.throws(() => t.importData({ schemaVersion: 1, records }));
  assert.equal(t.read().collections.length, 0);
  assert.equal(t.read().prompts.length, count);
  s.db.close();
  t.db.close();
});
test("proposal parsing rejects refusals, excessive text and invented citations", () => {
  const p = {
    text: "Recover with cover.",
    rationale: "Two observed plays",
    changes: [{ instruction: "Recover", annotationIds: ["a"] }],
    uncertainties: ["Small sample"],
    evaluationPlan: "Paired seeds",
  };
  assert.equal(parseProposal(JSON.stringify(p), ["a"]).text, p.text);
  for (const bad of [
    { ...p, text: "x".repeat(6001) },
    { ...p, changes: [{ instruction: "Invented", annotationIds: ["bad"] }] },
    { ...p, changes: [{ instruction: "Unsupported", annotationIds: [] }] },
    { refusal: "No" },
  ])
    assert.throws(() => parseProposal(JSON.stringify(bad), ["a"]));
  assert.throws(() => parseProposal("", ["a"]));
});
test("collection input ceiling fails before any provider call", () => {
  const { s, collection } = fixture();
  const c = s.save("collections", collection);
  const w = s.read();
  w.annotations[0].observation = "x".repeat(50_001);
  assert.throws(() => proposalInput(c, w), /ceiling|reservation/);
  s.db.close();
});

test("generation submits one bounded request and preserves proposal provenance without saving a revision", async () => {
  const { generateProposal } = await import("../lib/prompt-proposals");
  const { s, a, collection } = fixture();
  const c = s.save("collections", collection);
  let calls = 0;
  const text = {
    text: "Cover behind the ball.",
    rationale: "Observed evidence",
    changes: [{ instruction: "Cover", annotationIds: [a.id] }],
    uncertainties: ["Small sample"],
    evaluationPlan: "Paired comparison",
  };
  const result = await generateProposal(
    c,
    s.read(),
    "test-model",
    async (req) => {
      calls++;
      assert.equal(req.model, "test-model");
      assert.equal(req.store, false);
      assert.equal(req.max_output_tokens, 4096);
      assert.equal(req.text.format.strict, true);
      assert.equal(JSON.parse(req.input).annotations.length, 2);
      return {
        status: "completed",
        output_text: JSON.stringify(text),
        model: "test-model",
        id: "mock",
        usage: { input_tokens: 12, output_tokens: 10 },
      };
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.provenance.inputTokens, 12);
  assert.deepEqual(result.provenance.originalProposal, text);
  assert.equal(s.read().prompts.length, 10);
  s.db.close();
});
test("generation failures never retry, save prompts or switch models", async () => {
  const { generateProposal } = await import("../lib/prompt-proposals");
  const { s, collection } = fixture();
  const c = s.save("collections", collection);
  for (const failure of ["refusal", "timeout", "unavailable"]) {
    let calls = 0;
    await assert.rejects(() =>
      generateProposal(c, s.read(), "test-model", async () => {
        calls++;
        if (failure === "refusal")
          return { status: "incomplete", output_text: "" };
        throw new Error(failure);
      }),
    );
    assert.equal(calls, 1);
    assert.equal(s.read().prompts.length, 10);
  }
  s.db.close();
});
