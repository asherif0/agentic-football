const COORD = /\s*(?:to|at)\s*\{"x":(-?[\d.]+),"y":(-?[\d.]+)\}/;

/**
 * Engine action descriptions embed team-relative JSON coordinates
 * ("move back to {"x":0.58,"y":0.34}"). Split them into readable text plus
 * an optional target, shown as percentages of pitch length and width.
 */
export function prettyAction(description: string) {
  const m = description.match(COORD);
  const text = description
    .replace(COORD, "")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  return {
    text,
    target: m
      ? `${Math.round(Number(m[1]) * 100)}% · ${Math.round(Number(m[2]) * 100)}%`
      : null,
  };
}
