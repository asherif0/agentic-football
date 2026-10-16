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
import type { Role } from "../../lib/domain";
import { defaultModels, defaultInference } from "../lib/squad";
const defaults = {
  team: "team-provisional",
  scenario: "",
  provider: "decisions",
  models: defaultModels(),
  inference: defaultInference(),
  /** Unsaved per-position prompt swaps on top of the selected team version. */
  lineup: {} as Partial<Record<Role, string>>,
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
export type Preparation = typeof defaults;
const KEY = "afl-squad-v1",
  LEGACY_KEY = "football-preparation-v1";
const Context = createContext<{
  value: Preparation;
  set: Dispatch<SetStateAction<Preparation>>;
  ready: boolean;
} | null>(null);
/** The current squad and match setup, persisted per browser and shared across pages. */
export function PreparationProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState(defaults),
    [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(KEY) ?? sessionStorage.getItem(LEGACY_KEY);
      if (raw) set({ ...defaults, ...JSON.parse(raw) });
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {}
  }, [ready, value]);
  return (
    <Context.Provider value={{ value, set, ready }}>
      {children}
    </Context.Provider>
  );
}
/** Renders children only after the saved squad has been restored. */
export function PreparationGate({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const c = useContext(Context);
  return <>{c?.ready ? children : fallback}</>;
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
