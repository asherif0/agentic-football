"use client";
import { useMemo, useState } from "react";
import {
  ROLES,
  type RecordData,
  type Role,
  type Workspace,
} from "../../../lib/domain";
import { download } from "../../lib/download";
import type { PromptEvidence, VersionRank } from "../../lib/evidence";
import { squadBundle, type ExportPlayer } from "../../lib/export";
import { usePreparation } from "../Preparation";
import { CopyButton } from "../ui/CopyButton";
import { Dialog } from "../ui/Overlay";
import { Badge, Button, Field, ModelChip, Notice } from "../ui/primitives";
import { Segmented } from "../ui/Segmented";
import s from "./prompts.module.css";

type Source = "squad" | "best" | "team";
type Format = "md" | "json" | "txt";
const EXT: Record<Format, string> = { md: "md", json: "json", txt: "txt" };

/** Packages five prompts (plus model settings and evidence) for use outside the lab. */
export function ExportDialog({
  open,
  onClose,
  workspace: w,
  evidence,
  ranks,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
  evidence: Map<string, PromptEvidence>;
  ranks: (ids: string[]) => Record<string, VersionRank>;
}) {
  const { value: p } = usePreparation(),
    squadTeam = w.teams.find((t) => t.id === p.team),
    [source, setSource] = useState<Source>("squad"),
    [format, setFormat] = useState<Format>("md"),
    [teamId, setTeamId] = useState(p.team),
    [formationId, setFormationId] = useState(
      squadTeam?.formationId ?? w.formations[0]?.id,
    );

  const built = useMemo(() => {
    const team =
      source === "team"
        ? w.teams.find((t) => t.id === teamId)
        : source === "squad"
          ? squadTeam
          : undefined;
    const fId = source === "best" ? formationId : team?.formationId;
    const formation = w.formations.find((f) => f.id === fId);
    if (!formation) return null;
    const pick = (role: Role): { prompt?: RecordData; model: string } => {
      if (source === "squad")
        return {
          prompt: w.prompts.find(
            (x) => x.id === (p.lineup?.[role] ?? squadTeam?.promptIds[role]),
          ),
          model: p.models[role],
        };
      if (source === "team")
        return {
          prompt: w.prompts.find((x) => x.id === team?.promptIds[role]),
          model: p.models[role],
        };
      const versions = w.prompts.filter(
        (x) => x.formationId === formation.id && x.role === role,
      );
      const r = ranks(versions.map((v) => v.id));
      const prompt =
        versions.find((v) => r[v.id].best) ??
        [...versions].sort(
          (a, b) =>
            (evidence.get(b.id)?.matches ?? 0) -
              (evidence.get(a.id)?.matches ?? 0) ||
            String(b.createdAt).localeCompare(String(a.createdAt)),
        )[0];
      const best = [...(evidence.get(prompt?.id ?? "")?.byModel ?? [])].sort(
        (a, b) =>
          (b.gdPer60 ?? -99) - (a.gdPer60 ?? -99) || b.matches - a.matches,
      )[0];
      return { prompt, model: best?.model ?? p.models[role] };
    };
    const players: ExportPlayer[] = ROLES.flatMap((role) => {
      const { prompt, model } = pick(role);
      if (!prompt) return [];
      const e = evidence.get(prompt.id);
      return [
        {
          role,
          promptId: prompt.id,
          promptLabel: prompt.label,
          parentId: prompt.parentId ?? null,
          text: prompt.text,
          model,
          inference: p.inference[role],
          evidence: e
            ? {
                matches: e.matches,
                wins: e.wins,
                draws: e.draws,
                losses: e.losses,
                gdPer60: e.gdPer60,
              }
            : null,
        },
      ];
    });
    return {
      players,
      bundle: squadBundle({
        formation: {
          id: formation.id,
          family: formation.family,
          name: formation.name,
        },
        team: team ? { id: team.id, label: team.label } : null,
        source:
          source === "squad"
            ? "Current squad"
            : source === "team"
              ? `Team version ${team?.label}`
              : "Best observed version per position",
        exportedAt: new Date().toISOString(),
        players,
      }),
      family: formation.family,
    };
  }, [source, teamId, formationId, w, p, squadTeam, evidence, ranks]);

  const text = built ? built.bundle[format] : "";
  const name = `agentic-football-${built?.family.replace(/\W+/g, "") ?? "squad"}-prompts.${EXT[format]}`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export squad prompts"
      sub="All five prompts with their model settings and local evidence, ready to use outside the lab."
      footer={
        <>
          <CopyButton text={text} label="Copy all" />
          <Button
            variant="primary"
            icon="download"
            disabled={!text}
            onClick={() =>
              download(
                name,
                text,
                format === "json" ? "application/json" : "text/plain",
              )
            }
          >
            Download .{EXT[format]}
          </Button>
        </>
      }
    >
      <div className={s.exportGrid}>
        <Field label="What to export">
          <Segmented<Source>
            full
            label="Export source"
            value={source}
            onChange={setSource}
            options={[
              { value: "squad", label: "Current squad" },
              { value: "best", label: "Best observed" },
              { value: "team", label: "A team version" },
            ]}
          />
        </Field>
        {source === "team" && (
          <Field label="Team version">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {w.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {source === "best" && (
          <>
            <Field label="Formation">
              <Segmented
                label="Formation"
                value={formationId}
                onChange={setFormationId}
                options={w.formations.map((f) => ({
                  value: f.id,
                  label: f.family,
                }))}
              />
            </Field>
            <Notice icon="info">
              Picks the version with the strongest evidence for each position,
              paired with the model it scored best with. Untested positions keep
              the newest version and your squad's model.
            </Notice>
          </>
        )}
        {source === "squad" && Object.keys(p.lineup ?? {}).length > 0 && (
          <Notice icon="info">
            Includes your unsaved prompt swaps from the Squad page.
          </Notice>
        )}
        <div className={s.squadList}>
          {built?.players.map((pl) => (
            <div key={pl.role} className={s.squadItem}>
              <span
                className="mono"
                style={{ fontSize: 11.5, fontWeight: 600 }}
              >
                {pl.role}
              </span>
              <span
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pl.promptLabel}
                </span>
                <ModelChip model={pl.model} short />
              </span>
              <Badge tone={pl.evidence?.matches ? "good" : "neutral"}>
                {pl.evidence?.matches ? `n=${pl.evidence.matches}` : "untested"}
              </Badge>
            </div>
          ))}
        </div>
        <div className={s.exportRow}>
          <span className="eyebrow">Preview</span>
          <Segmented<Format>
            size="sm"
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "md", label: "Markdown" },
              { value: "json", label: "JSON" },
              { value: "txt", label: "Plain text" },
            ]}
          />
        </div>
        <pre className={s.preview}>{text}</pre>
      </div>
    </Dialog>
  );
}
