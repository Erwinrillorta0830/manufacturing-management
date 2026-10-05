const PHT_TIME_ZONE = "Asia/Manila";
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getPhtDateInputValue(value: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: PHT_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(value);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function addCalendarDaysToDateInput(value: string, days: number): string {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match || !Number.isInteger(days)) return value;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const sourceDate = new Date(Date.UTC(year, month - 1, day));
    if (
        sourceDate.getUTCFullYear() !== year
        || sourceDate.getUTCMonth() !== month - 1
        || sourceDate.getUTCDate() !== day
    ) {
        return value;
    }

    const result = new Date(Date.UTC(year, month - 1, day + days));
    const resultParts = [
        result.getUTCFullYear().toString().padStart(4, "0"),
        (result.getUTCMonth() + 1).toString().padStart(2, "0"),
        result.getUTCDate().toString().padStart(2, "0")
    ];
    return resultParts.join("-");
}

type WallClockParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
};

function wallClockParts(value: string): WallClockParts | null {
    const match = value.trim().match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?$/
    );
    if (!match) return null;

    const [, year, month, day, hour = "0", minute = "0", second = "0", milliseconds = "0"] = match;
    const parts: WallClockParts = {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: Number(second),
        millisecond: Number(milliseconds.padEnd(3, "0").slice(0, 3))
    };

    const calendarCheck = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (
        calendarCheck.getUTCFullYear() !== parts.year
        || calendarCheck.getUTCMonth() !== parts.month - 1
        || calendarCheck.getUTCDate() !== parts.day
        || parts.hour > 23
        || parts.minute > 59
        || parts.second > 59
        || parts.millisecond > 999
    ) {
        return null;
    }

    return parts;
}

function toInstant(value: string | Date): Date | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const normalized = value.trim();
    if (!normalized) return null;

    // A DATETIME value has no timezone marker and is already a PHT wall-clock
    // value. Convert it to an instant only for sorting/formatting purposes.
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
        const parts = wallClockParts(normalized);
        if (!parts) return null;
        return new Date(
            Date.UTC(
                parts.year,
                parts.month - 1,
                parts.day,
                parts.hour,
                parts.minute,
                parts.second,
                parts.millisecond
            ) - PHT_OFFSET_MS
        );
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formattedParts(value: string | Date) {
    const instant = toInstant(value);
    if (!instant) return null;

    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: PHT_TIME_ZONE,
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(instant);
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

/** Returns the epoch represented by a PHT DATETIME wall-clock value. */
export function phtTimestampToEpoch(value?: string | null): number {
    if (!value) return 0;
    return toInstant(value)?.getTime() || 0;
}

/** Returns the start/end instant for a YYYY-MM-DD PHT date filter. */
export function phtDateBoundaryToEpoch(value: string, endOfDay = false): number {
    const parts = wallClockParts(value);
    if (!parts) return 0;

    const date = new Date(
        Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            endOfDay ? 23 : 0,
            endOfDay ? 59 : 0,
            endOfDay ? 59 : 0,
            endOfDay ? 999 : 0
        ) - PHT_OFFSET_MS
    );
    return date.getTime();
}

export function formatPhtTimestamp(value?: string | Date | null): string {
    if (!value) return "N/A";
    const parts = formattedParts(value);
    if (!parts) return String(value);
    return `${parts.month} ${parts.day}, ${parts.year} ${parts.hour}:${parts.minute}:${parts.second} PHT`;
}

export function formatPhtDate(value?: string | Date | null): string {
    if (!value) return "N/A";
    const parts = formattedParts(value);
    if (!parts) return String(value);
    return `${parts.month} ${parts.day}, ${parts.year}`;
}

export function formatPhtTime(value?: string | Date | null): string {
    if (!value) return "";
    const parts = formattedParts(value);
    if (!parts) return String(value);
    return `${parts.hour}:${parts.minute}:${parts.second}`;
}
