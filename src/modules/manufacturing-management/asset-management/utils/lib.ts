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
 * Safely parse date or datetime string (with space, T separator, or formatted date) into Date object
 */
export function parseDateTimeSafe(val: Date | string | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  if (!str || str === "null" || str === "undefined") return null;

  // Handle standard ISO or "YYYY-MM-DD HH:mm:ss"
  const normalized = str.includes(" ") && !str.includes("T") ? str.replace(" ", "T") : str;
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;

  // Handle "Aug 13, 2025" or "Aug 13, 2025 11:19 AM"
  const timestamp = Date.parse(str);
  if (!isNaN(timestamp)) return new Date(timestamp);

  // Regex fallback for YYYY-MM-DD or YYYY/MM/DD
  const match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const [, y, m, day, h = "0", min = "0", s = "0"] = match;
    const parsed = new Date(Number(y), Number(m) - 1, Number(day), Number(h), Number(min), Number(s));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

/**
 * Calculates unified asset financial metrics (Acquisition Cost, Depreciable Amount, Accumulated Depreciation, Book Value)
 */
export function calculateAssetFinancials(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assetInput: any,
  projectionDate: Date = new Date()
) {
  if (!assetInput) {
    return {
      acquisitionCost: 0,
      openingBookValue: 0,
      openingAccumulatedDepreciation: 0,
      openingProductionUnits: 0,
      residualValue: 0,
      depreciableAmount: 0,
      totalDepreciableAmount: 0,
      systemProductionDepreciation: 0,
      accumulatedDepreciation: 0,
      bookValue: 0,
      depreciationRate: 0,
      rateUnit: "month",
      usefulMonths: 12,
      usefulYears: 1,
      monthsElapsed: 0,
      isUOP: false,
      isLegacyMigrated: false,
    };
  }

  const asset = assetInput;
  const acqCost =
    asset.acquisition_cost != null && Number(asset.acquisition_cost) > 0
      ? Number(asset.acquisition_cost)
      : asset.acquisitionCost != null && Number(asset.acquisitionCost) > 0
      ? Number(asset.acquisitionCost)
      : Number(asset.cost_per_item || asset.costPerItem || 0) * Number(asset.quantity || 1);

  const resVal = Number(asset.residual_value ?? asset.residualValue ?? 0);
  const totalDepreciableAmount = Math.max(0, acqCost - resVal);

  const rawOpeningBook = asset.opening_book_value ?? asset.openingBookValue;
  const openingBookValue =
    rawOpeningBook != null && !isNaN(Number(rawOpeningBook)) && Number(rawOpeningBook) >= 0
      ? Number(rawOpeningBook)
      : acqCost;

  const rawOpeningAccum = asset.opening_accumulated_depreciation ?? asset.openingAccumulatedDepreciation;
  const openingAccumulatedDep =
    rawOpeningAccum != null && !isNaN(Number(rawOpeningAccum)) && Number(rawOpeningAccum) >= 0
      ? Number(rawOpeningAccum)
      : Math.max(0, acqCost - openingBookValue);

  const openingUnits = Number(asset.opening_production_units ?? asset.openingProductionUnits ?? 0);
  const remainingDepreciableBasis = Math.max(0, openingBookValue - resVal);

  const method = String(asset.depreciation_method ?? asset.depreciationMethod ?? "Straight Line").trim();
  const isUOP = method.toLowerCase() === "units of production" || method.toLowerCase() === "uop";

  if (isUOP) {
    const maxCapacity = Number(asset.maximum_unit_produced_capacity ?? asset.maximumUnitProducedCapacity ?? 0);
    const remainingCapacityAtOpening = Math.max(0, maxCapacity - openingUnits);
    const systemProduced = Number(asset.actual_units_produced ?? asset.actualUnitsProduced ?? asset.productionUnits ?? 0);

    const depPerUnit =
      remainingCapacityAtOpening > 0
        ? remainingDepreciableBasis / remainingCapacityAtOpening
        : maxCapacity > 0
        ? totalDepreciableAmount / maxCapacity
        : 0;

    const systemDepreciation = Math.min(remainingDepreciableBasis, depPerUnit * systemProduced);
    const accumulatedDep = Math.min(totalDepreciableAmount, openingAccumulatedDep + systemDepreciation);
    const bookValue = Math.max(resVal, openingBookValue - systemDepreciation);
    const totalProduced = openingUnits + systemProduced;
    const remainingCapacity = Math.max(0, remainingCapacityAtOpening - systemProduced);

    return {
      acquisitionCost: acqCost,
      openingBookValue,
      openingAccumulatedDepreciation: openingAccumulatedDep,
      openingProductionUnits: openingUnits,
      residualValue: resVal,
      depreciableAmount: remainingDepreciableBasis,
      totalDepreciableAmount,
      systemProductionDepreciation: systemDepreciation,
      accumulatedDepreciation: accumulatedDep,
      bookValue,
      depreciationRate: depPerUnit,
      rateUnit: "unit",
      maxCapacity,
      producedToDate: totalProduced,
      systemProduced,
      remainingCapacity,
      remainingCapacityAtOpening,
      isUOP: true,
      isLegacyMigrated: (asset.asset_origin || asset.assetOrigin) === "Existing" || openingBookValue < acqCost || openingAccumulatedDep > 0 || openingUnits > 0,
    };
  } else {
    const rawMonths = asset.useful_life_months ?? asset.usefulLifeMonths;
    const rawYears = asset.life_span ?? asset.lifeSpan ?? asset.usefulLife ?? asset.useful_life;
    const usefulMonths =
      rawMonths != null && Number(rawMonths) > 0
        ? Number(rawMonths)
        : rawYears != null && Number(rawYears) > 0
        ? Number(rawYears) * 12
        : 12;

    // const isLegacy =
    //   (asset.asset_origin || asset.assetOrigin) === "Existing" ||
    //   (asset.opening_book_value != null && Number(asset.opening_book_value) < acqCost) ||
    //   Number(asset.opening_accumulated_depreciation || asset.openingAccumulatedDepreciation || 0) > 0;

    const explicitDepDate = parseDateTimeSafe(asset.depreciation_start_date || asset.depreciationStartDate);
    const acqDate = parseDateTimeSafe(asset.date_acquired || asset.dateAcquired);

    // Authoritative start date for depreciation is depreciation_start_date (falling back to date_acquired if not set)
    const startDate = explicitDepDate || acqDate || new Date();
    const projDate = projectionDate instanceof Date && !isNaN(projectionDate.getTime()) ? projectionDate : new Date();

    const yearDiff = projDate.getFullYear() - startDate.getFullYear();
    const monthDiff = projDate.getMonth() - startDate.getMonth();
    const dayDiff = projDate.getDate() - startDate.getDate();
    const totalMonthsElapsed = yearDiff * 12 + monthDiff + (dayDiff / 30.4375);
    const monthsElapsed = Math.max(0, totalMonthsElapsed);

    const monthlyDep = usefulMonths > 0 ? remainingDepreciableBasis / usefulMonths : 0;
    const systemDepreciation = Math.min(remainingDepreciableBasis, monthlyDep * monthsElapsed);
    const accumulatedDep = Math.min(totalDepreciableAmount, openingAccumulatedDep + systemDepreciation);
    const bookValue = Math.max(resVal, openingBookValue - systemDepreciation);

    if (typeof window !== "undefined" || process.env.NODE_ENV !== "production") {
      console.group(`[Asset Depreciation Calculation] ${asset.item_name || asset.itemName || "Asset"}`);
      console.log("Raw Input Fields Used:", {
        "item_name / itemName": asset.item_name || asset.itemName,
        "depreciation_start_date / depreciationStartDate": asset.depreciation_start_date || asset.depreciationStartDate,
        "date_acquired / dateAcquired": asset.date_acquired || asset.dateAcquired,
        "acquisition_cost / cost_per_item": acqCost,
        "opening_book_value / openingBookValue": openingBookValue,
        "residual_value / residualValue": resVal,
        "depreciable_basis": remainingDepreciableBasis,
        "useful_life_months / life_span": usefulMonths,
        "depreciation_method": method,
        "as_of_projection_date": projDate.toISOString()
      });
      console.log("Calculation Breakdown (Straight Line):", {
        "1. Depreciable Basis": `${formatPHP(acqCost)} (Cost) - ${formatPHP(resVal)} (Residual) = ${formatPHP(remainingDepreciableBasis)}`,
        "2. Useful Life": `${usefulMonths} months (${(usefulMonths / 12).toFixed(1)} yrs)`,
        "3. Monthly Depreciation Rate": `${formatPHP(remainingDepreciableBasis)} / ${usefulMonths} mos = ${formatPHP(monthlyDep)} / month`,
        "4. Depreciation Start Date": startDate.toLocaleString(),
        "5. As-Of Projection Date": projDate.toLocaleString(),
        "6. Months Elapsed": `${monthsElapsed.toFixed(2)} months (${(monthsElapsed / 12).toFixed(2)} yrs)`,
        "7. Total Accumulated Dep.": `${formatPHP(monthlyDep)} * ${monthsElapsed.toFixed(2)} mos = ${formatPHP(accumulatedDep)}`,
        "8. Current Book Value": `${formatPHP(openingBookValue)} - ${formatPHP(systemDepreciation)} = ${formatPHP(bookValue)}`
      });
      console.groupEnd();
    }

    return {
      acquisitionCost: acqCost,
      openingBookValue,
      openingAccumulatedDepreciation: openingAccumulatedDep,
      residualValue: resVal,
      depreciableAmount: remainingDepreciableBasis,
      totalDepreciableAmount,
      systemProductionDepreciation: systemDepreciation,
      accumulatedDepreciation: accumulatedDep,
      bookValue,
      depreciationRate: monthlyDep,
      rateUnit: "month",
      usefulMonths,
      usefulYears: usefulMonths / 12,
      monthsElapsed,
      isUOP: false,
      isLegacyMigrated: (asset.asset_origin || asset.assetOrigin) === "Existing" || openingBookValue < acqCost || openingAccumulatedDep > 0,
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

