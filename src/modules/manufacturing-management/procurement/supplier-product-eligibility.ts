export const SUPPLIER_ELIGIBLE_PRODUCT_TYPES = [388, 389, 390] as const;

export function getSupplierProductTypeId(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return getSupplierProductTypeId(relation.id ?? relation.type_id ?? relation.product_type_id ?? relation.value);
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isSupplierEligibleProductType(value: unknown): boolean {
    const typeId = getSupplierProductTypeId(value);
    return typeId !== null
        && SUPPLIER_ELIGIBLE_PRODUCT_TYPES.includes(typeId as typeof SUPPLIER_ELIGIBLE_PRODUCT_TYPES[number]);
}

export function getSupplierProductTypeLabel(value: unknown, productTypeName?: unknown): string {
    if (typeof productTypeName === "string" && productTypeName.trim()) return productTypeName.trim();

    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        const relationName = relation.name ?? relation.type_name;
        if (typeof relationName === "string" && relationName.trim()) return relationName.trim();
    }

    switch (getSupplierProductTypeId(value)) {
        case 388:
            return "Finished Goods";
        case 389:
            return "Raw Materials";
        case 390:
            return "Packaging Items";
        default:
            return "Unclassified";
    }
}

export interface SupplierCatalogProductFilter {
    searchTerm: string;
    productTypeId: string;
    unitId: string;
}

interface SupplierCatalogProductLike {
    product_name?: string | null;
    product_code?: string | null;
    product_type?: unknown;
    unit_of_measurement?: { unit_id?: number | string | null } | null;
}

export function filterSupplierCatalogProducts<T extends SupplierCatalogProductLike>(
    products: T[],
    filters: SupplierCatalogProductFilter
): T[] {
    const query = filters.searchTerm.trim().toLowerCase();

    return products.filter(product => {
        if (filters.productTypeId !== "all"
            && String(getSupplierProductTypeId(product.product_type) ?? "") !== filters.productTypeId) {
            return false;
        }

        if (filters.unitId !== "all"
            && String(product.unit_of_measurement?.unit_id ?? "") !== filters.unitId) {
            return false;
        }

        if (!query) return true;

        return (product.product_name || "").toLowerCase().includes(query)
            || (product.product_code || "").toLowerCase().includes(query);
    });
}

export function getSupplierCatalogUomOptions(
    products: Array<{
        unit_of_measurement?: {
            unit_id?: number | string | null;
            unit_shortcut?: string | null;
            unit_name?: string | null;
        } | null;
    }>
): Array<{ value: string; label: string }> {
    const units = new Map<string, string>();
    products.forEach(product => {
        const unit = product.unit_of_measurement;
        if (!unit) return;
        const unitId = String(unit.unit_id ?? "");
        if (!unitId) return;
        const label = unit.unit_shortcut?.trim() || unit.unit_name?.trim() || `UOM ${unitId}`;
        if (!units.has(unitId)) units.set(unitId, label);
    });

    return Array.from(units, ([value, label]) => ({ value, label }))
        .sort((left, right) => left.label.localeCompare(right.label));
}
