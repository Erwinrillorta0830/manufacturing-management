/**
 * Formats a stored `shift_option` value for display. Planning persists shift
 * hours here (e.g. "6.5", "10"), so numeric values are suffixed to remove the
 * ambiguity with shift names/IDs. Named schedules (e.g. "Shift 1 (Day)")
 * render unchanged.
 */
export function formatShiftLabel(value: unknown, fallback = "Shift 1"): string {
    const text = String(value ?? "").trim();
    if (!text) return fallback;
    return Number.isFinite(Number(text)) ? `${text} hrs` : text;
}
