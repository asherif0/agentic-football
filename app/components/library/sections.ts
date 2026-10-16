import type { Kind } from "../../../lib/domain";
import type { IconName } from "../ui/Icon";

export type Section = {
  id: string;
  label: string;
  blurb: string;
  icon: IconName;
  kind?: Kind;
};

export const SECTION_GROUPS: { group: string; items: Section[] }[] = [
  {
    group: "Research",
    items: [
      {
        id: "sources",
        kind: "sources",
        label: "Sources",
        icon: "library",
        blurb: "FIFA/UEFA and futsal references behind each idea.",
      },
      {
        id: "principles",
        kind: "principles",
        label: "Principles",
        icon: "layers",
        blurb: "Tactical principles adapted from the sources.",
      },
      {
        id: "hypotheses",
        kind: "hypotheses",
        label: "Hypotheses",
        icon: "target",
        blurb: "Testable behaviours per formation and role.",
      },
      {
        id: "formations",
        kind: "formations",
        label: "Formations",
        icon: "pitch",
        blurb: "Shapes, placements and phase duties.",
      },
    ],
  },
  {
    group: "Versions",
    items: [
      {
        id: "teams",
        kind: "teams",
        label: "Team versions",
        icon: "squad",
        blurb: "Immutable sets of five prompts.",
      },
    ],
  },
  {
    group: "Portal evidence",
    items: [
      {
        id: "experiments",
        kind: "experiments",
        label: "Experiments",
        icon: "flag",
        blurb: "Manual portal runs and their conditions.",
      },
      {
        id: "matches",
        kind: "matches",
        label: "Match evidence",
        icon: "table",
        blurb: "Recorded scores, shots and diagnoses.",
      },
      {
        id: "compare",
        label: "Compare",
        icon: "diff",
        blurb: "Two portal experiments side by side.",
      },
      {
        id: "decisions",
        kind: "decisions",
        label: "Promotion history",
        icon: "trophy",
        blurb: "Champion and challenger decisions.",
      },
    ],
  },
  {
    group: "Review",
    items: [
      {
        id: "annotations",
        kind: "annotations",
        label: "Critical events",
        icon: "list",
        blurb: "Annotated moments with execution scores.",
      },
      {
        id: "collections",
        kind: "collections",
        label: "Collections",
        icon: "sparkle",
        blurb: "Group annotations and draft an AI prompt revision.",
      },
    ],
  },
  {
    group: "Automation",
    items: [
      {
        id: "campaigns",
        label: "Improvement campaigns",
        icon: "bolt",
        blurb: "Automatic generate → screen → validate loops.",
      },
      {
        id: "benchmarks",
        label: "Benchmarks & series",
        icon: "chart",
        blurb: "Model × formation runs and paired comparisons.",
      },
    ],
  },
  {
    group: "Data",
    items: [
      {
        id: "data",
        label: "Backup & attachments",
        icon: "download",
        blurb: "Export, import and evidence files.",
      },
    ],
  },
];

export const SECTIONS = SECTION_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.group })),
);
