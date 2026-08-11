export function generateBatchReferenceNo(date = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);

    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "00";

    return `BATCH-${getPart("year")}${getPart("month")}${getPart("day")}-${getPart("hour")}${getPart("minute")}${getPart("second")}`;
}
