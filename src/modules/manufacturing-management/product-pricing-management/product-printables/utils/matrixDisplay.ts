import type { PriceType, Unit } from "../types";

export const MATRIX_PRICE_TYPE_COLORS = [
    {
        className: "bg-[#F3F4F6] text-[#374151] border-[#D1D5DB]",
        fill: "FFF3F4F6",
        font: "FF374151",
        border: "FFD1D5DB",
    },
    {
        className: "bg-[#EAF4FF] text-[#1E4D8C] border-[#B8D1F3]",
        fill: "FFEAF4FF",
        font: "FF1E4D8C",
        border: "FFB8D1F3",
    },
    {
        className: "bg-[#F0FFF4] text-[#1D5C2E] border-[#C6F6D5]",
        fill: "FFF0FFF4",
        font: "FF1D5C2E",
        border: "FFC6F6D5",
    },
    {
        className: "bg-[#FFF9E6] text-[#8C6D1E] border-[#FCEFB4]",
        fill: "FFFFF9E6",
        font: "FF8C6D1E",
        border: "FFFCEFB4",
    },
    {
        className: "bg-[#FFF5F5] text-[#8C1E1E] border-[#FED7D7]",
        fill: "FFFFF5F5",
        font: "FF8C1E1E",
        border: "FFFED7D7",
    },
    {
        className: "bg-[#F7F0FF] text-[#4D1E8C] border-[#E9D8FD]",
        fill: "FFF7F0FF",
        font: "FF4D1E8C",
        border: "FFE9D8FD",
    },
] as const;

export function matrixPriceTypeColor(index: number) {
    const resolvedIndex = index >= 0 ? index : 0;
    return MATRIX_PRICE_TYPE_COLORS[resolvedIndex % MATRIX_PRICE_TYPE_COLORS.length];
}

export function getVisibleMatrixPriceTypes(
    priceTypes: PriceType[],
    selectedPriceTypeIds: string[] = [],
): PriceType[] {
    if (selectedPriceTypeIds.length === 0) {
        return priceTypes.filter((priceType) => priceType.sort != null && priceType.sort <= 5);
    }

    const selectedIds = new Set(selectedPriceTypeIds);
    return priceTypes.filter((priceType) => selectedIds.has(String(priceType.price_type_id)));
}

export function getVisibleMatrixUnits(units: Unit[], usedUnitIds: Set<number>): Unit[] {
    return units.filter((unit) => usedUnitIds.has(Number(unit.unit_id)));
}

export function priceTypeTierKey(priceType: Pick<PriceType, "price_type_id">): string {
    return priceType.price_type_id === -1 ? "LIST" : String(priceType.price_type_id);
}
