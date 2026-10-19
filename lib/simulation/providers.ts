import OpenAI from "openai";
import { DecisionInput, DecisionResult, ProviderKind } from "./types";
export const SIM_INSTRUCTIONS =
  "You control one player in a simplified 2D local football simulator. Choose exactly one supplied legal action using your player role instructions and observed state. Coordinates are normalized from your own goal (x=0) to the opposing goal (x=1). Every player decides simultaneously; do not wait for teammate messages. Hold retains position. Move while possessing releases the ball; dribble retains it. Your role prompt is tactical guidance; this simulator contract governs available actions. The physics engine executes your selected action for one decision interval.";
export interface PlayerDecisionProvider {
  kind: ProviderKind;
  decide(input: DecisionInput, signal: AbortSignal): Promise<DecisionResult>;
}
export function decisionPayload(input: DecisionInput) {
  return {
    model: input.model,
    input: JSON.stringify({
      simulator: SIM_INSTRUCTIONS,
      rolePrompt: input.prompt,
      player: input.player.id,
      observation: input.observation,
    }),
    questions: [
      {
        type: "choice" as const,
        name: "player_action",
        instructions:
          "Select the legal action that best executes this player role in the observed state.",
        choices: input.actions.map((a) => ({
          value: a.id,
          description: a.description,
        })),
      },
    ],
  };
}
export function tokenReservation(input: DecisionInput) {
  return (
    Buffer.byteLength(
      JSON.stringify({
        decision: decisionPayload(input),
        actions: input.actions,
      }),
      "utf8",
    ) + 2048
  );
}
export function transient(error: unknown) {
  const e = error as { status?: number; name?: string };
  return (
    e.status === 429 ||
    (e.status !== undefined && e.status >= 500) ||
    e.name === "APIConnectionError" ||
    e.name === "APIConnectionTimeoutError"
  );
}
export class ProviderFailure extends Error {
  constructor(
    message: string,
    public usage: {
      inputTokens: number | null;
      outputTokens: number;
    } | null = null,
  ) {
    super(message);
  }
}
/** TypeSafe's Jev decision models ("jev-1.13.0", "jev-latest", …). */
export const isJevModel = (model: string) => /^jev-/.test(model);
export const JEV_INSTRUCTIONS =
  "Select the legal action that best executes this player role in the observed state.";

/** Which server-side keys a set of models needs (mock needs none). */
export function requiredKeys(models: string[]) {
  return {
    openai: models.some((m) => !isJevModel(m)),
    jev: models.some(isJevModel),
  };
}

class JevRequestError extends Error {
  constructor(
    message: string,
    public status?: number,
    name?: string,
  ) {
    super(message);
    if (name) this.name = name;
  }
}

export function jevPayload(input: DecisionInput) {
  return {
    model: input.model,
    state: {
      simulator: SIM_INSTRUCTIONS,
      rolePrompt: input.prompt,
      player: input.player.id,
      observation: input.observation,
    },
    questions: {
      player_action: {
        type: "choice" as const,
        instructions: JEV_INSTRUCTIONS,
        criteria: Object.fromEntries(
          input.actions.map((a) => [a.id, a.description]),
        ),
      },
    },
  };
}

/**
 * One decision from TypeSafe's System One API (POST /v1/systemone). Jev
 * returns the chosen option with per-option probabilities; output tokens are
 * free, so only input tokens carry cost.
 */
export async function jevDecision(
  input: DecisionInput,
  signal: AbortSignal,
  apiKey = process.env.JEV_API_KEY,
  fetchImpl: typeof fetch = fetch,
): Promise<DecisionResult> {
  if (!apiKey) throw new Error("JEV_API_KEY is not configured on the server.");
  const base = (process.env.JEV_API_BASE || "https://api.typesafe.ai").replace(
    /\/$/,
    "",
  );
  let response: Response;
  try {
    response = await fetchImpl(`${base}/v1/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jevPayload(input)),
      signal,
    });
  } catch (e) {
    if (signal.aborted && (signal.reason as Error)?.name !== "TimeoutError")
      throw e;
    // Never include error details: they can echo request headers.
    throw new JevRequestError(
      "Jev request did not complete",
      undefined,
      (e as Error)?.name === "TimeoutError" || signal.aborted
        ? "APIConnectionTimeoutError"
        : "APIConnectionError",
    );
  }
  if (!response.ok)
    throw new JevRequestError(
      `Jev request failed (${response.status})`,
      response.status,
    );
  const body = (await response.json()) as {
    answers?: Record<
      string,
      {
        type?: string;
        choice?: unknown;
        confidence?: number;
        probabilities?: Record<string, number>;
      }
    >;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const usage = {
    inputTokens: body.usage?.input_tokens ?? null,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
  const answer = body.answers?.player_action;
  if (!answer || answer.type !== "choice" || typeof answer.choice !== "string")
    throw new ProviderFailure("Missing choice answer", usage);
  return {
    choice: answer.choice,
    confidence:
      typeof answer.confidence === "number" ? answer.confidence : null,
    probabilities: answer.probabilities
      ? Object.entries(answer.probabilities).map(([value, probability]) => ({
          value,
          probability,
        }))
      : null,
    ...usage,
  };
}

export function provider(
  kind: ProviderKind,
  apiKey = process.env.OPENAI_API_KEY,
): PlayerDecisionProvider {
  if (kind === "mock")
    return {
      kind,
      async decide(input) {
        return {
          choice: input.actions[0].id,
          confidence: null,
          probabilities: null,
          inputTokens: 0,
          outputTokens: 0,
        };
      },
    };
  // Decisions only serves gpt-6-luna, so a missing key is fatal up front.
  if (kind === "decisions" && !apiKey)
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  let openai: OpenAI | null = null;
  const client = () => {
    if (!apiKey)
      throw new Error("OPENAI_API_KEY is not configured on the server.");
    return (openai ??= new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 }));
  };
  return {
    kind,
    async decide(input, signal) {
      // Models are routed per player, so one team can mix Jev and OpenAI models.
      if (isJevModel(input.model)) return jevDecision(input, signal);
      if (kind === "decisions") {
        const response = await client().decisions.create(
          decisionPayload(input),
          {
            signal,
          },
        );
        const answer = response.answers.find((a) => a.name === "player_action");
        const usage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
        if (
          !answer ||
          answer.type !== "choice" ||
          typeof answer.choice !== "string"
        )
          throw new ProviderFailure(
            answer?.type === "refusal"
              ? "Decision refused"
              : "Missing choice answer",
            usage,
          );
        return {
          choice: answer.choice,
          confidence: answer.confidence,
          probabilities: answer.probabilities,
          ...usage,
        };
      }
      const result = await client().responses.create(
        {
          model: input.model,
          store: false,
          instructions: SIM_INSTRUCTIONS,
          input: JSON.stringify({
            rolePrompt: input.prompt,
            observation: input.observation,
            actions: input.actions,
          }),
          text: {
            format: {
              type: "json_schema",
              name: "player_action",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  choice: {
                    type: "string",
                    enum: input.actions.map((a) => a.id),
                  },
                },
                required: ["choice"],
                additionalProperties: false,
              },
            },
          },
          ...(input.inference
            ? { reasoning: { effort: input.inference.reasoningEffort } }
            : {}),
          max_output_tokens: input.inference?.maxOutputTokens ?? 256,
        },
        { signal },
      );
      const usage = {
        inputTokens: result.usage?.input_tokens ?? null,
        outputTokens: result.usage?.output_tokens ?? 0,
      };
      try {
        const parsed = JSON.parse(result.output_text);
        if (typeof parsed.choice !== "string") throw new Error();
        return {
          choice: parsed.choice,
          confidence: null,
          probabilities: null,
          ...usage,
        };
      } catch {
        throw new ProviderFailure(
          "Response refused, incomplete, or invalid structured choice",
          usage,
        );
      }
    },
  };
}
