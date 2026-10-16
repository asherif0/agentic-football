"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { defaultModels, defaultInference } from "./ModelAssignments";
const defaults = {
  team: "team-provisional",
  scenario: "",
  provider: "decisions",
  models: defaultModels(),
  inference: defaultInference(),
  opponent: "",
  opScenario: "",
  opponentModels: defaultModels(),
  opponentInference: defaultInference(),
  bot: "balanced",
  duration: 60,
  interval: 1,
  limit: 300,
  tokenLimit: 3000000,
  seed: 42,
  side: "home",
  strategy: "",
};
type Preparation = typeof defaults;
const Context = createContext<{
  value: Preparation;
  set: Dispatch<SetStateAction<Preparation>>;
} | null>(null);
export function PreparationProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState(defaults),
    [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("football-preparation-v1");
      if (raw) set({ ...defaults, ...JSON.parse(raw) });
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      sessionStorage.setItem("football-preparation-v1", JSON.stringify(value));
  }, [ready, value]);
  if (!ready)
    return (
      <p role="status" className="muted">
        Loading workspace…
      </p>
    );
  return <Context.Provider value={{ value, set }}>{children}</Context.Provider>;
}
export function usePreparation() {
  const c = useContext(Context);
  if (!c) throw new Error("Preparation provider missing");
  return c;
}
export function usePreparedField<K extends keyof Preparation>(
  key: K,
): [Preparation[K], Dispatch<SetStateAction<Preparation[K]>>] {
  const { value, set } = usePreparation();
  return [
    value[key],
    (next) =>
      set((old) => ({
        ...old,
        [key]:
          typeof next === "function"
            ? (next as (x: Preparation[K]) => Preparation[K])(old[key])
            : next,
      })),
  ];
}
