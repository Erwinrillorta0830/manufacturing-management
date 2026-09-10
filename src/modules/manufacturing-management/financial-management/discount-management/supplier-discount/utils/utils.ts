import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date string to readable format
 */
export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return "N/A";

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(dateObj);
  } catch {
    return "Invalid date";
  }
}

/**
 * Format phone number to readable format
 */
export function formatPhoneNumber(phone: string | undefined | null): string {
  if (!phone) return "N/A";

  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, "");

  // Format as Philippine number
  if (cleaned.length === 11 && cleaned.startsWith("09")) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }

  return phone;
}

/**
 * TIN Formatter: formats digits as 000-000-000-000
 */
export function formatTIN(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  const groups = [];
  for (let i = 0; i < digits.length; i += 3) {
    groups.push(digits.slice(i, i + 3));
  }
  return groups.join("-");
}
