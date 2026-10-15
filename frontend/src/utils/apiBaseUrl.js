export function resolveApiBaseUrl(input) {
  const value = String(input || "")
    .trim()
    .replace(/\/+$/, "");
  if (!value) return "/api";
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.pathname === "/" || url.pathname === "") return value + "/api";
  }
  return value;
}
