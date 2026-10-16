const nf = new Intl.NumberFormat("en-US");
export const int = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : nf.format(Math.round(n));
export const dec = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toFixed(digits);
export const signed = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(digits);
export const pct = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : (n * 100).toFixed(digits) + "%";
export const ms = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n >= 1000
      ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "s"
      : Math.round(n) + "ms";
export const usd = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n === 0
      ? "$0"
      : n < 0.01
        ? "<$0.01"
        : "$" + n.toFixed(n < 10 ? 2 : 0);
export const compact = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
export const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export const plural = (n: number, one: string, many = one + "s") =>
  `${int(n)} ${n === 1 ? one : many}`;
