import type { IconName } from "../ui/Icon";

export const NAV: {
  href: string;
  label: string;
  icon: IconName;
  step?: string;
  blurb: string;
}[] = [
  { href: "/", label: "Home", icon: "home", blurb: "Overview of your lab" },
  {
    href: "/squad",
    label: "Squad",
    icon: "squad",
    step: "01",
    blurb: "Pick a prompt and a model for each player",
  },
  {
    href: "/simulate",
    label: "Simulate",
    icon: "pitch",
    step: "02",
    blurb: "Replay matches and inspect every decision",
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: "chart",
    step: "03",
    blurb: "Compare models, formations and prompts",
  },
  {
    href: "/prompts",
    label: "Prompts",
    icon: "prompt",
    step: "04",
    blurb: "Choose the best versions and export them",
  },
  {
    href: "/rsi",
    label: "RSI",
    icon: "loop",
    blurb: "Let the lab rewrite, retest and keep the best prompt",
  },
];
export const LIBRARY = {
  href: "/library",
  label: "Library",
  icon: "library" as IconName,
  blurb: "Research, evidence records and automation",
};

export function activeHref(pathname: string) {
  if (pathname === "/") return "/";
  return (
    [...NAV, LIBRARY].find((n) => n.href !== "/" && pathname.startsWith(n.href))
      ?.href ?? null
  );
}
