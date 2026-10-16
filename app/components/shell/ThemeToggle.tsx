"use client";
import { useEffect, useState } from "react";
import { Segmented } from "../ui/Segmented";

type Pref = "system" | "light" | "dark";
const KEY = "afl-theme";

function apply(pref: Pref) {
  const dark =
    pref === "dark" ||
    (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "light" || v === "dark") setPref(v);
    } catch {}
  }, []);
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)"),
      on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);
  function change(next: Pref) {
    setPref(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {}
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    };
    if (
      doc.startViewTransition &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      doc.startViewTransition(() => apply(next));
    else apply(next);
  }
  return (
    <Segmented<Pref>
      label="Colour theme"
      size="sm"
      value={pref}
      onChange={change}
      options={[
        {
          value: "system",
          icon: "monitor",
          label: <span className="sr-only">System</span>,
          title: "Match system",
        },
        {
          value: "light",
          icon: "sun",
          label: <span className="sr-only">Light</span>,
          title: "Light",
        },
        {
          value: "dark",
          icon: "moon",
          label: <span className="sr-only">Dark</span>,
          title: "Dark",
        },
      ]}
    />
  );
}
