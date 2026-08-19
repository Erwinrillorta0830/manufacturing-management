import { clsx, type ClassValue } from "clsx";
import { differenceInDays } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency to Philippine Peso (PHP)
 */
export function formatPHP(amount: number | string | undefined | null): string {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  if (value === undefined || value === null || isNaN(value)) return "₱0.00";

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

/**
 * Calculates depreciated value using: Total Cost / Life Span (year)
 */
export function getDepreciatedValue(
  unitCost: number,
  quantity: number,
  lifeSpanYears: number,
  dateAcquired: string | Date,
  projectionDate: Date = new Date(),
) {
  const totalInitialCost = unitCost * quantity;

  // Guard against division by zero
  if (!lifeSpanYears || lifeSpanYears <= 0) return 0;

  const startDate = new Date(dateAcquired);

  // Calculate years elapsed based on days (365.25 to account for leap years)
  const daysElapsed = Math.max(0, differenceInDays(projectionDate, startDate));
  const yearsElapsed = daysElapsed / 365.25;

  // Formula: (Total Cost / Life Span Year) = Annual Depreciation
  const annualDepreciation = totalInitialCost / lifeSpanYears;

  // Current Value = Initial Cost - (Annual Depreciation * Years Passed)
  const currentValue = totalInitialCost - annualDepreciation * yearsElapsed;

  // Ensure value never drops below ₱0.00
  return Math.max(0, currentValue);
}

/**
 * Safely extracts UUID from an image string (stripping full URLs like http://vtc:3101/assets/...)
 */
export function extractImageUuid(imageVal: string | null | undefined): string | null {
  if (!imageVal || typeof imageVal !== "string") return null;
  const trimmed = imageVal.trim();
  if (!trimmed) return null;

  // Match UUID pattern
  const uuidMatch = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuidMatch) return uuidMatch[0];

  // If it contains /assets/
  if (trimmed.includes("/assets/")) {
    const parts = trimmed.split("/assets/");
    const last = parts[parts.length - 1].split("?")[0].split("/")[0];
    if (last) return last;
  }

  return trimmed;
}

/**
 * Returns proxy image URL hiding any internal hostnames/ports
 */
export function getAssetImageUrl(imageId: string | null | undefined): string | null {
  const uuid = extractImageUuid(imageId);
  if (!uuid) return null;
  return `/api/manufacturing/asset-management/asset-image-view?id=${uuid}`;
}

