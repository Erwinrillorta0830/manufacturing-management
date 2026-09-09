/**
 * Utility functions for Philippine Standard Time (PHT, UTC+8 / Asia/Manila).
 */

export const PHT_TIMEZONE = "Asia/Manila";

/**
 * Returns the current date-time formatted as a local wall-clock string in Philippine Standard Time.
 * Example: "2026-09-09T10:03:00"
 */
export function getNowInPhtISO(): string {
    const now = new Date();
    const phtDateStr = new Intl.DateTimeFormat("sv-SE", {
        timeZone: PHT_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).format(now);

    return phtDateStr.replace(" ", "T");
}
