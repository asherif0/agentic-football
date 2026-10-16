/** Stable comparison keys: JSON object insertion order is not an experimental condition. */
export function stableJSON(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJSON(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
