"use client";
import Link from "next/link";
import { usePreparation } from "../Preparation";
import { useWorkspace } from "../../lib/data/hooks";
import { ModelMix } from "../ui/primitives";
import s from "./shell.module.css";

/** The current squad, always one click from the builder. */
export function SquadChip() {
  const { value: p, ready } = usePreparation(),
    { data } = useWorkspace();
  if (!ready) return null;
  const team = data?.records.teams.find((t) => t.id === p.team),
    formation = data?.records.formations.find(
      (f) => f.id === team?.formationId,
    );
  const dirty = Object.keys(p.lineup ?? {}).length > 0;
  return (
    <Link href="/squad" className={s.squadChip} title="Edit squad">
      <ModelMix models={p.models} />
      <span>{team?.label ?? "Choose a squad"}</span>
      {formation && (
        <span className={s.squadMeta}>
          {formation.family}
          {dirty ? " · edited" : ""}
        </span>
      )}
    </Link>
  );
}
