// Only for generated educational output. Do not rewrite the OCR transcript.
export function normalizeDisplayText(text: string): string {
  return text.replace(/\\+r\\+n/g, " ").replace(/\\+n/g, " ").replace(/\\+r/g, " ").replace(/[\r\n]+/g, " ");
}

export function normalizeGeneratedResult<T>(value: T): T {
  if (typeof value === "string") return normalizeDisplayText(value) as T;
  if (Array.isArray(value)) return value.map((item) => normalizeGeneratedResult(item)) as T;
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeGeneratedResult(item)]),
  ) as T;
  return value;
}
