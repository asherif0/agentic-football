/** Saves text or JSON in the browser via a temporary object URL. */
export function download(name: string, value: unknown, mime?: string) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const blob = new Blob([text], {
    type:
      mime ?? (typeof value === "string" ? "text/plain" : "application/json"),
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
