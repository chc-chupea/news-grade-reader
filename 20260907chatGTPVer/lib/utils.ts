type ClassValue = string | number | false | null | undefined | ClassValue[] | Record<string, boolean | null | undefined>;

function classNames(value: ClassValue): string[] {
  if (!value) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(classNames);
  return Object.entries(value).filter(([, enabled]) => enabled).map(([name]) => name);
}

export function cn(...inputs: ClassValue[]): string {
  return inputs.flatMap(classNames).join(" ");
}
