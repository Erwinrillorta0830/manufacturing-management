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
 * Format date & time to database string format: YYYY-MM-DD HH:mm:ss
 */
export function formatDateTimeForDB(dateInput: Date | string | null | undefined): string {
  if (!dateInput) {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
    const normalized = trimmed.includes(" ") && !trimmed.includes("T") ? trimmed.replace(" ", "T") : trimmed;
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  }
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${dateInput.getFullYear()}-${pad(dateInput.getMonth() + 1)}-${pad(dateInput.getDate())} ${pad(dateInput.getHours())}:${pad(dateInput.getMinutes())}:${pad(dateInput.getSeconds())}`;
  }
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Safely parse date or datetime string (with space or T separator) into Date object
 */
export function parseDateTimeSafe(val: Date | string | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  const normalized = str.includes(" ") && !str.includes("T") ? str.replace(" ", "T") : str;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates unified asset financial metrics (Acquisition Cost, Depreciable Amount, Accumulated Depreciation, Book Value)
 */
export function calculateAssetFinancials(
  asset: {
    cost_per_item?: number | string | null;
    quantity?: number | string | null;
    acquisition_cost?: number | string | null;
    residual_value?: number | string | null;
    depreciation_method?: string | null;
    life_span?: number | string | null;
    useful_life_months?: number | string | null;
    maximum_unit_produced_capacity?: number | string | null;
    actual_units_produced?: number | string | null;
    date_acquired?: string | Date | null;
    depreciation_start_date?: string | Date | null;
  },
  projectionDate: Date = new Date()
) {
  const acqCost =
    asset.acquisition_cost != null && Number(asset.acquisition_cost) > 0
      ? Number(asset.acquisition_cost)
      : Number(asset.cost_per_item || 0) * Number(asset.quantity || 1);
  const resVal = Number(asset.residual_value || 0);
  const depreciableAmount = Math.max(0, acqCost - resVal);

  const isUOP = asset.depreciation_method === "Units of Production";

  if (isUOP) {
    const maxCapacity = Number(asset.maximum_unit_produced_capacity || 0);
    const produced = Number(asset.actual_units_produced || 0);
    const depPerUnit = maxCapacity > 0 ? depreciableAmount / maxCapacity : 0;
    const accumulatedDep = Math.min(depreciableAmount, depPerUnit * produced);
    const bookValue = Math.max(resVal, acqCost - accumulatedDep);
    const remainingCapacity = Math.max(0, maxCapacity - produced);

    return {
      acquisitionCost: acqCost,
      residualValue: resVal,
      depreciableAmount,
      accumulatedDepreciation: accumulatedDep,
      bookValue,
      depreciationRate: depPerUnit,
      rateUnit: "unit",
      maxCapacity,
      producedToDate: produced,
      remainingCapacity,
      isUOP: true,
    };
  } else {
    const usefulMonths =
      asset.useful_life_months != null && Number(asset.useful_life_months) > 0
        ? Number(asset.useful_life_months)
        : Number(asset.life_span || 1) * 12;
    const startDate = asset.depreciation_start_date
      ? new Date(asset.depreciation_start_date)
      : asset.date_acquired
      ? new Date(asset.date_acquired)
      : new Date();

    const daysElapsed = Math.max(0, differenceInDays(projectionDate, startDate));
    const monthsElapsed = daysElapsed / (365.25 / 12);

    const monthlyDep = usefulMonths > 0 ? depreciableAmount / usefulMonths : 0;
    const accumulatedDep = Math.min(depreciableAmount, monthlyDep * monthsElapsed);
    const bookValue = Math.max(resVal, acqCost - accumulatedDep);

    return {
      acquisitionCost: acqCost,
      residualValue: resVal,
      depreciableAmount,
      accumulatedDepreciation: accumulatedDep,
      bookValue,
      depreciationRate: monthlyDep,
      rateUnit: "month",
      usefulMonths,
      usefulYears: usefulMonths / 12,
      isUOP: false,
    };
  }
}

/**
 * Calculates depreciated value using: Total Cost / Life Span (year)
 */
export function getDepreciatedValue(
  unitCost: number,
  quantity: number,
  lifeSpanYears: number,
  dateAcquired: string | Date,
  projectionDate: Date = new Date()
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

