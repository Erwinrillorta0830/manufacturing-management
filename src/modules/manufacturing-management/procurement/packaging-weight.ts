export interface PackagingWeightShareInput {
    key: number;
    lineGrossWeightKg: number;
}

export interface ProductWeightComponentInput {
    netWeight?: number | string | null;
    outerCartonWeight?: number | string | null;
    palletWeight?: number | string | null;
    weightUnit?: unknown;
    legacyGrossWeight?: number | string | null;
}

export interface ProductWeightBreakdown {
    netWeight: number | null;
    outerCartonWeight: number | null;
    palletWeight: number | null;
    grossWeight: number;
    netWeightKg: number | null;
    outerCartonWeightKg: number | null;
    palletWeightKg: number | null;
    grossWeightKg: number;
    weightUnitCode?: string;
    isComponentBased: boolean;
}

export class ProductWeightValidationError extends Error {
    readonly status = 400;
    readonly code = "PRODUCT_WEIGHT_INVALID";
    readonly details: Record<string, unknown> = {};

    constructor(message: string) {
        super(message);
        this.name = "ProductWeightValidationError";
    }
}

export function isPackagingMaterialProductType(productType: unknown): boolean {
    return Number(productType) === 390;
}

export function toStandardKg(value: number | string | null | undefined, unitCodeOrShortcut?: string | null): number {
    const weight = Number(value);
    if (!Number.isFinite(weight) || weight <= 0) return 0;

    const unit = (unitCodeOrShortcut || "kg").toLowerCase().trim();
    switch (unit) {
        case "g":
        case "gram":
        case "grams":
            return weight / 1000;
        case "mg":
        case "milligram":
        case "milligrams":
            return weight / 1000000;
        case "mcg":
        case "microgram":
        case "micrograms":
        case "μg":
        case "î¼g":
            return weight / 1000000000;
        case "lb":
        case "lbs":
        case "pound":
        case "pounds":
            return weight * 0.45359237;
        case "oz":
        case "ounce":
        case "ounces":
            return weight * 0.0283495231;
        case "t":
        case "tonne":
        case "metric ton":
        case "tons":
        case "mt":
            return weight * 1000;
        case "st_ton":
        case "short ton":
            return weight * 907.18474;
        case "lt_ton":
        case "long ton":
            return weight * 1016.0469088;
        case "st":
        case "stone":
            return weight * 6.35029318;
        case "ct":
        case "carat":
        case "carats":
            return weight * 0.0002;
        case "gr":
        case "grain":
        case "grains":
            return weight * 0.00006479891;
        case "dr":
        case "dram":
        case "drams":
            return weight * 0.0017718451953125;
        case "dwt":
        case "pennyweight":
            return weight * 0.00155517384;
        case "oz_t":
        case "troy ounce":
            return weight * 0.0311034768;
        case "lb_t":
        case "troy pound":
            return weight * 0.3732417216;
        case "cwt":
        case "hundredweight":
            return weight * 50.80234544;
        case "kg":
        case "kilogram":
        case "kilograms":
        default:
            return weight;
    }
}

/**
 * Product weight is stored per purchased SKU unit. Convert it to a line
 * weight once at the boundary before the allocation formula is applied.
 */
export function deriveLineGrossWeightKg(
    unitGrossWeight: number | string | null | undefined,
    weightUnit: string | null | undefined,
    quantity: number | string | null | undefined
): number {
    const lineQuantity = Number(quantity);
    if (!Number.isFinite(lineQuantity) || lineQuantity <= 0) return 0;
    return toStandardKg(unitGrossWeight, weightUnit) * lineQuantity;
}

export function productWeightUnitCode(weightUnit: unknown): string | undefined {
    if (typeof weightUnit === "string") return weightUnit;
    if (!weightUnit || typeof weightUnit !== "object") return undefined;

    const value = weightUnit as Record<string, unknown>;
    const code = value.code || value.unit_shortcut || value.unit_name || value.name;
    return code == null ? undefined : String(code);
}

function hasProvidedWeightValue(value: unknown): boolean {
    return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
}

function hasValidWeightUnit(value: unknown): boolean {
    if (!hasProvidedWeightValue(value)) return false;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        return [record.id, record.unit_id, record.code, record.unit_shortcut, record.unit_name, record.name]
            .some(hasProvidedWeightValue);
    }
    return Number.isFinite(Number(value)) && Number(value) > 0;
}

/**
 * Apply the same weight policy to the form and the raw-material API:
 * packaging products require component weights, while raw materials may
 * omit weight data but must provide a complete set when any weight is entered.
 */
export function validateProductWeightForProductType(product: unknown, productType: unknown): string | null {
    const value = product && typeof product === "object"
        ? product as Record<string, unknown>
        : {};
    const isPackagingMaterial = isPackagingMaterialProductType(productType);
    const hasWeight = hasProvidedWeightValue(value.weight) || hasProvidedWeightValue(value.product_weight);
    const hasWeightUnit = hasProvidedWeightValue(value.weight_unit_id);
    const hasWeightComponents = [
        value.net_weight,
        value.outer_carton_weight,
        value.pallet_weight
    ].some(hasProvidedWeightValue);

    if (isPackagingMaterial || hasWeightComponents) {
        try {
            resolveProductWeightBreakdown(value, { requireComplete: true });
            return null;
        } catch (error) {
            return error instanceof ProductWeightValidationError
                ? error.message
                : "Net weight, outer carton weight, pallet weight, and weight unit must be valid.";
        }
    }

    if (hasWeight || hasWeightUnit) {
        if (!hasWeight || !hasWeightUnit) {
            return "Gross weight and weight unit must be provided together when supplied.";
        }
        if (!hasProvidedWeightValue(value.weight) && !hasProvidedWeightValue(value.product_weight)) {
            return "Gross weight must be greater than 0 when supplied.";
        }
        const grossWeight = value.weight ?? value.product_weight;
        if (!Number.isFinite(Number(grossWeight)) || Number(grossWeight) <= 0) {
            return "Gross weight must be greater than 0 when supplied.";
        }
        if (!hasValidWeightUnit(value.weight_unit_id)) {
            return "Weight unit must be valid when supplied.";
        }
    }

    return null;
}

function parseWeightComponent(value: unknown, label: string, required: boolean): number | null {
    if (!hasProvidedWeightValue(value)) {
        if (required) throw new ProductWeightValidationError(`${label} is required.`);
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new ProductWeightValidationError(`${label} must be a non-negative number.`);
    }
    return parsed;
}

export function resolveProductWeightBreakdown(
    product: unknown,
    options: { requireComplete?: boolean; allowIncomplete?: boolean } = {}
): ProductWeightBreakdown {
    const value = product && typeof product === "object"
        ? product as Record<string, unknown>
        : {};
    const requireComplete = options.requireComplete === true;
    const allowIncomplete = options.allowIncomplete === true && !requireComplete;
    const unitCode = productWeightUnitCode(value.weight_unit_id);
    const hasAnyComponent = [
        value.net_weight,
        value.outer_carton_weight,
        value.pallet_weight
    ].some(hasProvidedWeightValue);

    if (requireComplete || hasAnyComponent) {
        if (!hasProvidedWeightValue(value.weight_unit_id) && !allowIncomplete) {
            throw new ProductWeightValidationError("Weight unit is required for weight components.");
        }

        const netWeight = parseWeightComponent(value.net_weight, "Net weight", !allowIncomplete);
        const outerCartonWeight = parseWeightComponent(value.outer_carton_weight, "Outer carton weight", !allowIncomplete);
        const palletWeight = parseWeightComponent(value.pallet_weight, "Pallet weight", !allowIncomplete);
        if (!allowIncomplete && (netWeight === null || outerCartonWeight === null || palletWeight === null)) {
            throw new ProductWeightValidationError("All weight components are required.");
        }
        const grossWeight = (netWeight || 0) + (outerCartonWeight || 0) + (palletWeight || 0);
        if (grossWeight <= 0) {
            throw new ProductWeightValidationError("Gross weight must be greater than 0.");
        }

        return {
            netWeight,
            outerCartonWeight,
            palletWeight,
            grossWeight,
            netWeightKg: toStandardKg(netWeight, unitCode),
            outerCartonWeightKg: toStandardKg(outerCartonWeight, unitCode),
            palletWeightKg: toStandardKg(palletWeight, unitCode),
            grossWeightKg: toStandardKg(grossWeight, unitCode),
            weightUnitCode: unitCode,
            isComponentBased: true
        };
    }

    const legacyGrossWeight = parseWeightComponent(
        value.weight ?? value.product_weight,
        "Gross weight",
        false
    );
    const grossWeight = legacyGrossWeight ?? 0;
    return {
        netWeight: null,
        outerCartonWeight: null,
        palletWeight: null,
        grossWeight,
        netWeightKg: null,
        outerCartonWeightKg: null,
        palletWeightKg: null,
        grossWeightKg: toStandardKg(grossWeight, unitCode),
        weightUnitCode: unitCode,
        isComponentBased: false
    };
}

export function productLineGrossWeightKg(
    product: unknown,
    quantity: number | string | null | undefined,
    options: { requireComplete?: boolean } = {}
): number {
    const breakdown = resolveProductWeightBreakdown(product, options);
    const lineQuantity = Number(quantity);
    if (!Number.isFinite(lineQuantity) || lineQuantity <= 0) return 0;
    return breakdown.grossWeightKg * lineQuantity;
}

export function calculatePackagingWeightShares(
    lines: readonly PackagingWeightShareInput[]
): Map<number, number> {
    const totalWeight = lines.reduce(
        (sum, line) => sum + Math.max(0, Number(line.lineGrossWeightKg) || 0),
        0
    );

    if (totalWeight <= 0) {
        const equalShare = lines.length > 0 ? 1 / lines.length : 0;
        return new Map(lines.map(line => [line.key, equalShare]));
    }

    return new Map(lines.map(line => [
        line.key,
        Math.max(0, Number(line.lineGrossWeightKg) || 0) / totalWeight
    ]));
}
