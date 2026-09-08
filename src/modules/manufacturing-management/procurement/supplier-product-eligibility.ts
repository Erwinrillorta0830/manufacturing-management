export const SUPPLIER_ELIGIBLE_PRODUCT_TYPES = [389, 390] as const;

function productTypeId(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return productTypeId(relation.id ?? relation.type_id ?? relation.product_type_id ?? relation.value);
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isSupplierEligibleProductType(value: unknown): boolean {
    const typeId = productTypeId(value);
    return typeId !== null
        && SUPPLIER_ELIGIBLE_PRODUCT_TYPES.includes(typeId as typeof SUPPLIER_ELIGIBLE_PRODUCT_TYPES[number]);
}
