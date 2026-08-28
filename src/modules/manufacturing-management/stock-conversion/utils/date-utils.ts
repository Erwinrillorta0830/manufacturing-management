/**
 * Philippine Timezone (Asia/Manila) Date & Time Utilities
 * Timezone Offset: UTC+8
 */

export const PH_TIMEZONE = "Asia/Manila";

/**
 * Returns current Philippine local time formatted specifically for direct database storage:
 * 'YYYY-MM-DD HH:mm:ss' (e.g. '2026-08-27 01:14:41')
 */
export function getPhDbTimestamp(dateInput?: Date | string | number | null): string {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(date.getTime())) return "";
  
  // Format to Asia/Manila (PHT) as 'YYYY-MM-DD HH:mm:ss'
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return formatter.format(date).replace("T", " ");
}

/**
 * Returns current Philippine local time in ISO-like string format (YYYY-MM-DDTHH:mm:ss)
 */
export function getPhCurrentTimestamp(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat("en-CA", options).formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "00";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
}

/**
 * Formats any date string or Date object into Philippine Standard Time (PHT) for UI/PDF display
 */
export function formatPhDateTime(
  dateInput: string | Date | null | undefined,
  options?: {
    formatType?: "full" | "short" | "dateOnly" | "timeOnly" | "isoDate";
  }
): string {
  if (!dateInput) return "-";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const formatType = options?.formatType || "full";

  switch (formatType) {
    case "short":
      return new Intl.DateTimeFormat("en-US", {
        timeZone: PH_TIMEZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);

    case "dateOnly":
      return new Intl.DateTimeFormat("en-US", {
        timeZone: PH_TIMEZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);

    case "timeOnly":
      return new Intl.DateTimeFormat("en-US", {
        timeZone: PH_TIMEZONE,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(date);

    case "isoDate":
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: PH_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

    case "full":
    default:
      return new Intl.DateTimeFormat("en-US", {
        timeZone: PH_TIMEZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(date);
  }
}
