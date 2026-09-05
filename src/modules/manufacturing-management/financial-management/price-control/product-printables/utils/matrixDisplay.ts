import type { PriceType, Unit } from "../types";

export const MATRIX_PRICE_TYPE_COLORS = [
    {
        className: "bg-slate-100 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800",
        fill: "FFF3F4F6",
        font: "FF374151",
        border: "FFE2E8F0",
    },
    {
        className: "bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800/50",
        fill: "FFEAF4FF",
        font: "FF1E4D8C",
        border: "FFBFDBFE",
    },
    {
        className: "bg-green-50 dark:bg-green-950/50 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800/50",
        fill: "FFF0FFF4",
        font: "FF1D5C2E",
        border: "FFBBF7D0",
    },
    {
        className: "bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800/50",
        fill: "FFFFF9E6",
        font: "FF8C6D1E",
        border: "FFFDE68A",
    },
    {
        className: "bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800/50",
        fill: "FFFFF5F5",
        font: "FF8C1E1E",
        border: "FFFECACA",
    },
    {
        className: "bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800/50",
        fill: "FFF7F0FF",
        font: "FF4D1E8C",
        border: "FFE9D5FF",
    },
] as const;

export function matrixPriceTypeColor(index: number) {
    const resolvedIndex = index >= 0 ? index : 0;
    return MATRIX_PRICE_TYPE_COLORS[resolvedIndex % MATRIX_PRICE_TYPE_COLORS.length];
}

export function getVisibleMatrixPriceTypes(
    priceTypes: PriceType[],
    selectedPriceTypeIds: string[] = [],
    usedPriceTypeKeys?: Set<string>,
): PriceType[] {
    if (selectedPriceTypeIds.length > 0) {
        const selectedIds = new Set(selectedPriceTypeIds);
        return priceTypes.filter((priceType) => selectedIds.has(String(priceType.price_type_id)));
    }

    if (usedPriceTypeKeys) {
        return priceTypes.filter(
            (priceType) => priceType.sort != null || usedPriceTypeKeys.has(priceTypeTierKey(priceType))
        );
    }

    return priceTypes.filter((priceType) => priceType.sort != null);
}

export function getVisibleMatrixUnits(units: Unit[], usedUnitIds: Set<number>): Unit[] {
    return units.filter((unit) => usedUnitIds.has(Number(unit.unit_id)));
}

export function priceTypeTierKey(priceType: Pick<PriceType, "price_type_id">): string {
    return priceType.price_type_id === -1 ? "LIST" : String(priceType.price_type_id);
}
