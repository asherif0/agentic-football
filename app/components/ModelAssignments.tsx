"use client";
import { ROLES, type Role } from "../../lib/domain";
import type { InferenceSettings } from "../../lib/simulation/types";
export const defaultModels = () =>
  Object.fromEntries(ROLES.map((r) => [r, "gpt-6-luna"])) as Record<
    Role,
    string
  >;
export const defaultInference = () =>
  Object.fromEntries(
    ROLES.map((r) => [r, { reasoningEffort: "low", maxOutputTokens: 1024 }]),
  ) as Record<Role, InferenceSettings>;
export default function ModelAssignments({
  title,
  models,
  inference,
  onModels,
  onInference,
}: {
  title: string;
  models: Record<Role, string>;
  inference: Record<Role, InferenceSettings>;
  onModels: (v: Record<Role, string>) => void;
  onInference: (v: Record<Role, InferenceSettings>) => void;
}) {
  return (
    <div className="model-assignments">
      <div className="section-heading">
        <h3>{title}</h3>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            onModels(
              Object.fromEntries(ROLES.map((r) => [r, models.GK])) as Record<
                Role,
                string
              >,
            )
          }
        >
          Apply GK model to all
        </button>
      </div>
      <datalist id={title.replaceAll(" ", "-") + "-models"}>
        {["gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol"].map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <div className="model-role-grid">
        {ROLES.map((r) => (
          <label key={r}>
            {r}
            <input
              aria-label={`${title} ${r} model`}
              list={title.replaceAll(" ", "-") + "-models"}
              value={models[r]}
              onChange={(e) => onModels({ ...models, [r]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <details>
        <summary>Inference settings by player</summary>
        <div className="inference-grid">
          {ROLES.map((r) => (
            <div key={r}>
              <strong>{r}</strong>
              <label>
                Reasoning
                <select
                  aria-label={`${title} ${r} reasoning`}
                  value={inference[r].reasoningEffort}
                  onChange={(e) =>
                    onInference({
                      ...inference,
                      [r]: {
                        ...inference[r],
                        reasoningEffort: e.target
                          .value as InferenceSettings["reasoningEffort"],
                      },
                    })
                  }
                >
                  {["none", "low", "medium", "high", "xhigh", "max"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Output limit
                <input
                  aria-label={`${title} ${r} output token limit`}
                  type="number"
                  min="256"
                  max="4096"
                  value={inference[r].maxOutputTokens}
                  onChange={(e) =>
                    onInference({
                      ...inference,
                      [r]: {
                        ...inference[r],
                        maxOutputTokens: +e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
