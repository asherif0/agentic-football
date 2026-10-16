import type { Event } from "../../lib/simulation/types";
/** Groups events whose markers would sit closer than 30px at the given width. */
export function clusterEvents(
  events: Event[],
  duration: number,
  width: number,
) {
  const groups: Event[][] = [];
  const ordered = [...events].sort((a, b) => a.time - b.time || a.id - b.id);
  for (const e of ordered) {
    const last = groups.at(-1);
    if (last && ((e.time - last[0].time) / Math.max(duration, 1)) * width < 30)
      last.push(e);
    else groups.push([e]);
  }
  return groups;
}
export const eventName = (type: string) =>
  type.replaceAll("-", " ").replace(/^./, (s) => s.toUpperCase());
