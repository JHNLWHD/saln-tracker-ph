export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`).join(",")}}`;
  throw new Error("Canonical metadata must contain only JSON values");
}

/** Match explicit keys only. A differing row needs a new Editorial Correction. */
export function missingRows<S extends object, T extends object>(saved: S[], expected: T[], key: (row: S | T) => string, entity: string, verifyOnly = false): T[] {
  const existing = new Map(saved.map(row => [key(row), row]));
  return expected.filter(row => {
    const current = existing.get(key(row));
    if (!current) {
      if (verifyOnly) throw new Error(`${entity} ${key(row)} is missing from an applied manifest`);
      return true;
    }
    const currentFields = Object.fromEntries(Object.keys(row).map(field => [field, Reflect.get(current, field)]));
    if (canonicalJson(currentFields) !== canonicalJson(row)) throw new Error(`${entity} ${key(row)} already exists with different metadata; use an Editorial Correction`);
    return false;
  });
}
