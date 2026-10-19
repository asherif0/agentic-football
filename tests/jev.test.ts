import test from "node:test";
import assert from "node:assert/strict";
import {
  isJevModel,
  jevDecision,
  jevPayload,
  provider,
  requiredKeys,
  transient,
} from "../lib/simulation/providers";
import { PRICING } from "../lib/simulation/pricing";
import type { DecisionInput } from "../lib/simulation/types";

const input: DecisionInput = {
  player: {
    id: "home-MID",
    side: "home",
    role: "MID",
    x: 20,
    y: 10,
    anchor: { x: 20, y: 10 },
  },
  prompt: "You are MID.",
  model: "jev-1.13.0",
  observation: { time: 1 },
  actions: [
    { id: "hold", type: "hold", description: "Hold current position" },
    { id: "pass-FOR1", type: "pass", description: "Pass to FOR1" },
  ],
};

function fakeFetch(
  status: number,
  body: unknown,
  seen?: { url?: string; init?: RequestInit },
) {
  return (async (url: string, init: RequestInit) => {
    if (seen) Object.assign(seen, { url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

test("Jev payload asks one choice question whose options are the legal actions", () => {
  const p = jevPayload(input);
  assert.equal(p.model, "jev-1.13.0");
  assert.equal(p.questions.player_action.type, "choice");
  assert.deepEqual(p.questions.player_action.criteria, {
    hold: "Hold current position",
    "pass-FOR1": "Pass to FOR1",
  });
  assert.equal((p.state as { rolePrompt: string }).rolePrompt, "You are MID.");
});

test("jevDecision posts to System One with a bearer key and parses the answer", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const r = await jevDecision(
    input,
    new AbortController().signal,
    "test-key",
    fakeFetch(
      200,
      {
        model: "jev-1.13.0",
        answers: {
          player_action: {
            type: "choice",
            choice: "pass-FOR1",
            confidence: 0.8,
            probabilities: { hold: 0.1, "pass-FOR1": 0.9 },
          },
        },
        usage: { input_tokens: 420, output_tokens: 30 },
      },
      seen,
    ),
  );
  assert.equal(seen.url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(
    (seen.init!.headers as Record<string, string>).Authorization,
    "Bearer test-key",
  );
  assert.equal(r.choice, "pass-FOR1");
  assert.equal(r.confidence, 0.8);
  assert.deepEqual(r.probabilities, [
    { value: "hold", probability: 0.1 },
    { value: "pass-FOR1", probability: 0.9 },
  ]);
  assert.equal(r.inputTokens, 420);
});

test("jevDecision reports HTTP failures by status so rate limits are retried", async () => {
  await assert.rejects(
    jevDecision(
      input,
      new AbortController().signal,
      "k",
      fakeFetch(429, { error: "slow down" }),
    ),
    (e: unknown) => (e as { status?: number }).status === 429 && transient(e),
  );
  await assert.rejects(
    jevDecision(input, new AbortController().signal, "k", fakeFetch(401, {})),
    (e: unknown) => (e as { status?: number }).status === 401 && !transient(e),
  );
  await assert.rejects(
    jevDecision(input, new AbortController().signal, ""),
    /JEV_API_KEY/,
  );
});

test("models route per player and require only the keys they use", () => {
  assert.equal(isJevModel("jev-1.13.0"), true);
  assert.equal(isJevModel("gpt-6-sol"), false);
  assert.deepEqual(requiredKeys(["jev-1.13.0", "jev-1.13.0"]), {
    openai: false,
    jev: true,
  });
  assert.deepEqual(requiredKeys(["gpt-6-luna", "jev-1.13.0"]), {
    openai: true,
    jev: true,
  });
  // Per-player routing needs no OpenAI key up front; Decisions still does.
  assert.doesNotThrow(() => provider("responses", ""));
  assert.throws(() => provider("decisions", ""));
  assert.equal(PRICING["jev-1.13.0"].outputPerMillion, 0);
});
