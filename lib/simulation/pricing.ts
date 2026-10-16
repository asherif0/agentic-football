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
