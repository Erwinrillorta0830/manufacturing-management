/**
 * Utility functions for date and timestamp handling in Philippine Standard Time (Asia/Manila).
 */

/**
 * Formats a date/timestamp to Philippine Time (Asia/Manila).
 * Formats:
 * - "db": "2026-08-27 01:14:41" (Database posting format)
 * - "long": "August 27, 2026, 09:18 AM"
 * - "short": "Aug 27, 2026, 09:18 AM"
 * - "pdf": "2026-08-27 9:18 AM"
 * - "dateOnly": "Aug 27, 2026"
 * - "timeOnly": "09:18:27 AM"
 */
function parseToDate(dateStr?: string | Date | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  let str = String(dateStr).trim();
  if (!str) return null;

  // Stored data is already in local Philippine Standard Time (UTC+8).
  // If string format has no timezone or trailing Z, treat as +08:00 to prevent double offset.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    str = str.replace(" ", "T") + "+08:00";
  } else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?Z$/i.test(str)) {
    str = str.replace(/Z$/i, "+08:00").replace(" ", "T");
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export const formatPhDateTime = (
  dateStr?: string | Date | null,
  options?: { formatType?: "long" | "short" | "pdf" | "timeOnly" | "dateOnly" | "db" }
): string => {
  if (!dateStr) return "-";
  try {
    const d = parseToDate(dateStr);
    if (!d) return "-";

    if (options?.formatType === "db") {
      return d.toLocaleString("sv-SE", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).replace("T", " ");
    }

    if (options?.formatType === "short") {
      return new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    }

    if (options?.formatType === "pdf") {
      return new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    }

    if (options?.formatType === "dateOnly") {
      return new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d);
    }

    if (options?.formatType === "timeOnly") {
      return new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(d);
    }

    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "-";
  }
};

/**
 * Returns timestamp formatted for database posting in Philippine Time (Asia/Manila).
 * Format: "2026-08-27 01:14:41" (YYYY-MM-DD HH:mm:ss)
 */
export const getPhDbTimestamp = (date?: Date | string | null): string => {
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
};

/**
 * Returns current timestamp formatted as ISO string in Philippine Time (Asia/Manila).
 * e.g. "2026-08-27T09:18:27"
 */
export const getPhCurrentTimestamp = (): string => {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).replace(" ", "T");
};
