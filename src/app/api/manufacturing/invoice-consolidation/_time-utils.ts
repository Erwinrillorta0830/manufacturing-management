/**
 * Helper to get Philippine Standard Time (Asia/Manila) timestamps for database operations.
 * Returns formatted string: "YYYY-MM-DD HH:mm:ss"
 */
export function getPhTimestamp(date?: Date | string | null): string {
    const d = date ? (typeof date === "string" ? new Date(date) : date) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    return validDate.toLocaleString("sv-SE", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).replace("T", " ");
}
