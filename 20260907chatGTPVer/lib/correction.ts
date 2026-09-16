export type Correction = { status: "clear" | "same" | "uncertain"; correctedText: string; reason: string };

export function validateCorrection(value: unknown, original: string): Correction {
  if (!value || typeof value !== "object") throw new Error("Invalid correction");
  const r = value as Correction;
  if (!["clear", "same", "uncertain"].includes(r.status) || typeof r.correctedText !== "string" || typeof r.reason !== "string") throw new Error("Invalid correction");
  // An unreadable crop must never produce an applicable guessed replacement.
  if (r.status !== "clear") return { status: r.status, correctedText: "", reason: r.reason.slice(0, 300) };
  const candidate = r.correctedText.trim();
  if (!candidate || candidate.length > original.length * 2 + 10 || /[\r\n]/.test(candidate)) throw new Error("Invalid correction length");
  if (candidate === original) return { status: "same", correctedText: "", reason: r.reason.slice(0, 300) };
  return { status: "clear", correctedText: candidate, reason: r.reason.slice(0, 300) };
}

// Only replace the exact, unique occurrence from the reviewed text snapshot.
export function applyCorrection(current: string, snapshot: string, original: string, replacement: string): string | null {
  if (current !== snapshot || !original || !replacement) return null;
  const index = current.indexOf(original);
  if (index < 0 || current.indexOf(original, index + 1) >= 0) return null;
  const result = current.slice(0, index) + replacement + current.slice(index + original.length);
  return result.length <= 5000 ? result : null;
}
