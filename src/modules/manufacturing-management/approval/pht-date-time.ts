const PHT_WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

const PHT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short"
});

/**
 * Formats both canonical PHT DATETIME values and legacy ISO instants in PHT.
 * A value without an offset is a MySQL DATETIME wall-clock value, not browser
 * local time, so it is converted from Asia/Manila explicitly before display.
 */
export function formatPhtDateTime(value?: string | null): string {
    if (!value) return "-";

    const raw = String(value).trim();
    if (!raw) return "-";

    const wallClock = PHT_WALL_CLOCK_PATTERN.exec(raw);
    const date = wallClock
        ? new Date(Date.UTC(
            Number(wallClock[1]),
            Number(wallClock[2]) - 1,
            Number(wallClock[3]),
            Number(wallClock[4] || 0) - 8,
            Number(wallClock[5] || 0),
            Number(wallClock[6] || 0),
            Number((wallClock[7] || "").padEnd(3, "0") || 0)
        ))
        : new Date(raw);

    return Number.isNaN(date.getTime()) ? "-" : PHT_DATE_TIME_FORMATTER.format(date);
}
