import type { Pricing } from "./types";
export const PRICING: Record<string, Pricing> = Object.fromEntries(
  [
    ["gpt-6-luna", 0.1, 0.5],
    ["gpt-6-sol", 2, 10],
    ["gpt-6.1-sol", 2, 10],
  ].map(([model, input, output]) => [
    model,
    {
      date: "2026-10-16",
      source:
        model === "gpt-6-sol"
          ? "https://developers.openai.com/api/docs/models/gpt-6-sol"
          : "https://developers.openai.com/api/docs/pricing",
      inputPerMillion: Number(input),
      outputPerMillion: Number(output),
    },
  ]),
);
// TypeSafe Jev: input tokens only; output tokens are free.
for (const model of ["jev-1.13.0", "jev-1.14.0", "jev-latest", "jev-preview"])
  PRICING[model] = {
    date: "2026-10-19",
    source: "https://docs.typesafe.ai/models",
    inputPerMillion: 0.042,
    outputPerMillion: 0,
  };
export function estimatedCost(
  rate: Pricing,
  input: number,
  output: number,
  reserve = false,
) {
  return (
    (input * rate.inputPerMillion * (reserve ? 1.25 : 1) +
      output * rate.outputPerMillion) /
    1e6
  );
}
