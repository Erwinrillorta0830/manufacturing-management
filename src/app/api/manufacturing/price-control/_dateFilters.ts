/** Inclusive end-of-day for YYYY-MM-DD date_to filters. */
export function toInclusiveDateToEnd(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes("T")) return trimmed;
    return `${trimmed}T23:59:59`;
}
