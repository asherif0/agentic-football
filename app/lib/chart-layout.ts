/**
 * Direct labels for scatter points without overlaps: try right, left, above
 * and below each mark; a label that fits nowhere is left to the tooltip and
 * the table view rather than drawn on top of another.
 */
export function placeTags(
  points: { id: string; tag?: string; x: number; y: number }[],
  width: number,
  height: number,
  left = 0,
) {
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const hit = (a: Box, b: Box) =>
    a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const taken: Box[] = points.map((p) => ({
    x0: p.x - 8,
    y0: p.y - 8,
    x1: p.x + 8,
    y1: p.y + 8,
  }));
  const out = new Map<
    string,
    { x: number; y: number; anchor: "start" | "end" | "middle" }
  >();
  for (const p of [...points].sort((a, b) => a.x - b.x)) {
    if (!p.tag) continue;
    const w = p.tag.length * 6.6 + 4,
      h = 13;
    const options = [
      {
        x: p.x + 11,
        y: p.y,
        anchor: "start" as const,
        box: {
          x0: p.x + 10,
          y0: p.y - h / 2,
          x1: p.x + 10 + w,
          y1: p.y + h / 2,
        },
      },
      {
        x: p.x - 11,
        y: p.y,
        anchor: "end" as const,
        box: {
          x0: p.x - 10 - w,
          y0: p.y - h / 2,
          x1: p.x - 10,
          y1: p.y + h / 2,
        },
      },
      {
        x: p.x,
        y: p.y - 15,
        anchor: "middle" as const,
        box: {
          x0: p.x - w / 2,
          y0: p.y - 15 - h / 2,
          x1: p.x + w / 2,
          y1: p.y - 15 + h / 2,
        },
      },
      {
        x: p.x,
        y: p.y + 15,
        anchor: "middle" as const,
        box: {
          x0: p.x - w / 2,
          y0: p.y + 15 - h / 2,
          x1: p.x + w / 2,
          y1: p.y + 15 + h / 2,
        },
      },
    ];
    const pick = options.find(
      (o) =>
        o.box.x0 >= left &&
        o.box.x1 <= width &&
        o.box.y0 >= 0 &&
        o.box.y1 <= height &&
        !taken.some((t) => hit(t, o.box)),
    );
    if (!pick) continue;
    taken.push(pick.box);
    out.set(p.id, { x: pick.x, y: pick.y, anchor: pick.anchor });
  }
  return out;
}
