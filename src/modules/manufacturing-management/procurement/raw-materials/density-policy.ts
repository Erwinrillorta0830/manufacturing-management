export type DensityRequirement = boolean | null;

export interface DensityPolicyUnit {
    unit_name?: string | null;
    unit_shortcut?: string | null;
}

const DENSITY_REQUIRED_CODES = new Set([
    "ML",
    "L",
    "G",
    "KG",
    "MG",
    "TON"
]);

const DENSITY_REQUIRED_NAMES = new Set([
    "MILLILITER",
    "MILLILITERS",
    "LITER",
    "LITERS",
    "GRAM",
    "GRAMS",
    "KILOGRAM",
    "KILOGRAMS",
    "MILLIGRAM",
    "MILLIGRAMS",
    "TON",
    "TONNE",
    "TONNES"
]);

const DENSITY_NOT_APPLICABLE_CODES = new Set([
    "PCS",
    "IB",
    "BAG",
    "PCK",
    "TIE",
    "JAR",
    "CON",
    "BOX",
    "CSE",
    "EAC",
    "PLT",
    "DRUM",
    "BTL",
    "ROLL"
]);

const DENSITY_NOT_APPLICABLE_NAMES = new Set([
    "PIECE",
    "PIECES",
    "INNERBOX",
    "BAG",
    "PACK",
    "TIE",
    "JAR",
    "CONTAINER",
    "BOX",
    "CASE",
    "EACH",
    "PALETTE",
    "DRUM",
    "BOTTLE",
    "ROLL"
]);

function normalizeUnitToken(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

/**
 * Returns true when density is meaningful for the UOM, false when it is not
 * applicable, and null when the UOM has not been classified yet.
 */
export function getDensityRequirement(unit: DensityPolicyUnit | null | undefined): DensityRequirement {
    if (!unit) return null;

    const shortcut = normalizeUnitToken(unit.unit_shortcut);
    if (DENSITY_REQUIRED_CODES.has(shortcut)) return true;
    if (DENSITY_NOT_APPLICABLE_CODES.has(shortcut)) return false;

    const name = normalizeUnitToken(unit.unit_name);
    if (DENSITY_REQUIRED_NAMES.has(name)) return true;
    if (DENSITY_NOT_APPLICABLE_NAMES.has(name)) return false;

    return null;
}

export function isPositiveFiniteDensity(value: unknown): boolean {
    if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return false;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
}

export function validateDensityForRequirement(
    value: unknown,
    requirement: DensityRequirement,
    label = "Density"
): string | null {
    if (requirement === null) {
        return `${label} cannot be validated because the selected UOM has no configured density policy.`;
    }

    if (requirement && !isPositiveFiniteDensity(value)) {
        return `${label} is required and must be greater than 0.`;
    }

    return null;
}

export function normalizeDensityForRequirement(
    value: unknown,
    requirement: DensityRequirement
): number | null {
    if (requirement !== true) return null;
    return Number(value);
}
