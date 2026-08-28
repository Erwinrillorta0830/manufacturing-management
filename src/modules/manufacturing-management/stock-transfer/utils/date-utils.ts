/**
 * Utility functions for date and timestamp handling in Philippine Standard Time (Asia/Manila).
 */

export const PH_TIMEZONE = "Asia/Manila";

/**
 * Parses a date string safely.
 * Stored data is already in local Philippine Standard Time (UTC+8).
 * If string format has no timezone or trailing Z, treat as +08:00 to prevent double offset.
 */
export function parseToDate(dateStr?: string | Date | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  let str = String(dateStr).trim();
  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    str = str.replace(" ", "T") + "+08:00";
  } else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?Z$/i.test(str)) {
    str = str.replace(/Z$/i, "+08:00").replace(" ", "T");
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    // Date only: treat as midnight local time
    str = str + "T00:00:00+08:00";
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a date/timestamp to Philippine Time (Asia/Manila).
 * Formats:
 * - "short": "Aug 27, 2026, 09:18 AM"
 * - "dateOnly": "Aug 27, 2026"
 * - "timeOnly": "09:18 AM"
 * - "long": "August 27, 2026, 09:18 AM"
 */
export function formatPhDateTime(
  dateStr?: string | Date | null,
  options?: { formatType?: "long" | "short" | "dateOnly" | "timeOnly" | "pdf" }
): string {
  if (!dateStr) return "—";
  try {
    const d = parseToDate(dateStr);
    if (!d) return "—";

    const formatType = options?.formatType || "short";

    if (formatType === "dateOnly") {
      return new Intl.DateTimeFormat("en-PH", {
        timeZone: PH_TIMEZONE,
        month: "short",
        day: "2-digit",
        year: "numeric",
      }).format(d);
    }

    if (formatType === "timeOnly") {
      return new Intl.DateTimeFormat("en-PH", {
        timeZone: PH_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    }

    if (formatType === "long") {
      return new Intl.DateTimeFormat("en-PH", {
        timeZone: PH_TIMEZONE,
        month: "long",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    }

    // Default: "short" (e.g. Aug 28, 2026, 11:27 AM)
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: PH_TIMEZONE,
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return typeof dateStr === "string" ? dateStr : "—";
  }
}
