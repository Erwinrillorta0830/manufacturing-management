// Keep percent as string (Directus returns decimals as string anyway)

export function normalizePercentString(v: string | number | null | undefined): string {
  const s = String(v ?? "").trim();
  if (!s) return "0";
  // allow decimals like "6.7934652093"
  if (!/^-?\d+(\.\d+)?$/.test(s)) return "0";
  return s;
}

/**
 * Display helper:
 * - keeps ALL decimals you computed
 * - optionally trims trailing zeros (common for Directus decimals)
 */
export function formatPercentExact(
  v: string | number | null | undefined,
  opts?: { trimTrailingZeros?: boolean },
): string {
  const s = normalizePercentString(v);
  if (!opts?.trimTrailingZeros) return s;

  // trim trailing zeros but keep at least one digit after '.' if any
  if (!s.includes(".")) return s;
  const trimmed = s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  return trimmed;
}
