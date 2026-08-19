import type { Unit } from "../types";

type VariantLike = {
    product?: {
        unit_of_measurement?: number | string | null;
    } | null;
};

export type RowWithVariants = {
    variantsByUnitId?: Record<string, VariantLike | null | undefined>;
};

function positiveUnitId(value: unknown): number | null {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * The variant map key is the source of truth because it is the registered
 * UOM used to build the grouped matrix. The product field is only a fallback
 * for malformed or legacy rows whose map key is not numeric.
 */
export function resolveRegisteredUnitId(
    variantUnitId: unknown,
    variant?: VariantLike | null,
): number | null {
    return positiveUnitId(variantUnitId) ?? positiveUnitId(variant?.product?.unit_of_measurement);
}

export function getRegisteredUnitIds(row: RowWithVariants): number[] {
    const ids = new Set<number>();

    for (const [variantUnitId, variant] of Object.entries(row.variantsByUnitId ?? {})) {
        const unitId = resolveRegisteredUnitId(variantUnitId, variant);
        if (unitId !== null) ids.add(unitId);
    }

    return Array.from(ids);
}

export function getUnitsForRow(row: RowWithVariants, availableUnits: Unit[]): Unit[] {
    const registeredIds = getRegisteredUnitIds(row);
    const registeredIdSet = new Set(registeredIds);
    const knownIds = new Set<number>();

    const knownUnits = availableUnits.filter((unit) => {
        const unitId = positiveUnitId(unit.unit_id);
        if (unitId === null || !registeredIdSet.has(unitId)) return false;
        knownIds.add(unitId);
        return true;
    });

    const fallbackUnits = registeredIds
        .filter((unitId) => !knownIds.has(unitId))
        .sort((a, b) => a - b)
        .map((unitId) => ({
            unit_id: unitId,
            unit_name: `Unit ${unitId}`,
            unit_shortcut: `U${unitId}`,
        }));

    return [...knownUnits, ...fallbackUnits];
}
