import type { MatrixRow } from "../../product-pricing/types";
import { getRegisteredUnitIds, resolveRegisteredUnitId } from "../../product-pricing/utils/rowUnits";

export type PriceTypeRef = {
    price_type_id: number;
    price_type_name?: string | null;
    sort?: number | null;
};

export type UnitRef = {
    unit_id?: number | string | null;
    unit_name?: string | null;
    unit_shortcut?: string | null;
    order?: number | null;
};

export type UnitColumn = {
    unitId: number;
    label: string;
    order: number;
};

export type FlatSupplierProductRow = {
    product_id: number;
    product_code: string | null;
    barcode: string | null;
    product_name: string;
    group_id: number;
    parent_id: number | null;
    unit_id: number | null;
    current_list_cost: number | null;
    currentByPriceTypeId: Map<number, number | null>;
};

function priceTypeLabel(priceType: PriceTypeRef): string {
    const name = String(priceType.price_type_name ?? "").trim();
    return name || `#${priceType.price_type_id}`;
}

export function priceTypeColumnLabel(priceType: PriceTypeRef): string {
    return priceTypeLabel(priceType);
}

export function currentColumnHeader(priceType: PriceTypeRef): string {
    return `${priceTypeColumnLabel(priceType)} Current`;
}

export function proposedColumnHeader(priceType: PriceTypeRef): string {
    return `${priceTypeColumnLabel(priceType)} Proposed`;
}

export function flattenPrintMatrixRows(
    rows: MatrixRow[],
    priceTypes: PriceTypeRef[],
): FlatSupplierProductRow[] {
    const flat: FlatSupplierProductRow[] = [];

    for (const row of rows) {
        for (const [variantUnitId, variant] of Object.entries(row.variantsByUnitId)) {
            const product = variant.product;
            const unitId = resolveRegisteredUnitId(variantUnitId, variant);
            if (unitId === null) continue;
            const currentByPriceTypeId = new Map<number, number | null>();

            for (const priceType of priceTypes) {
                const tierKey = String(priceType.price_type_id);
                const value = variant.tiers[tierKey];
                currentByPriceTypeId.set(
                    priceType.price_type_id,
                    value === null || value === undefined ? null : Number(value),
                );
            }

            const listTier = variant.tiers.LIST;
            const listRaw =
                listTier === null || listTier === undefined ? product.cost_per_unit : listTier;
            const currentListCost = listRaw === null || listRaw === undefined ? null : Number(listRaw);

            flat.push({
                product_id: Number(product.product_id),
                product_code: product.product_code ?? null,
                barcode: product.barcode ?? null,
                product_name: product.product_name ?? "",
                group_id: row.group_id,
                parent_id: product.parent_id ? Number(product.parent_id) : null,
                unit_id: unitId,
                current_list_cost: Number.isFinite(currentListCost) ? currentListCost : null,
                currentByPriceTypeId,
            });
        }
    }

    flat.sort((a, b) => a.product_name.localeCompare(b.product_name));
    return flat;
}

export function productIdsFromMatrixRows(rows: MatrixRow[]): number[] {
    const ids = new Set<number>();

    for (const row of rows) {
        for (const variant of Object.values(row.variantsByUnitId)) {
            const id = Number(variant.product.product_id);
            if (Number.isFinite(id) && id > 0) ids.add(id);
        }
    }

    return Array.from(ids);
}

export function buildUnitColumns(rows: MatrixRow[], units: UnitRef[] | undefined): UnitColumn[] {
    const referencedUnitIds = new Set<number>();
    for (const row of rows) {
        for (const unitId of getRegisteredUnitIds(row)) referencedUnitIds.add(unitId);
    }

    const unitsById = new Map<number, UnitRef>();
    for (const unit of units ?? []) {
        const unitId = Number(unit.unit_id);
        if (Number.isFinite(unitId) && unitId > 0) unitsById.set(unitId, unit);
    }

    const columns = Array.from(referencedUnitIds)
        .map((unitId) => {
            const unit = unitsById.get(unitId);
            const name = String(unit?.unit_name ?? "").trim();
            const shortcut = String(unit?.unit_shortcut ?? "").trim();
            const order = Number(unit?.order ?? Number.MAX_SAFE_INTEGER);
            return {
                unitId,
                label: name || shortcut || (unitId > 0 ? `Unit #${unitId}` : "Unit"),
                order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
            };
        });
    const labelCounts = new Map<string, number>();
    for (const column of columns) {
        labelCounts.set(column.label, (labelCounts.get(column.label) ?? 0) + 1);
    }
    return columns
        .map((column) => ({
            ...column,
            label: (labelCounts.get(column.label) ?? 0) > 1
                ? `${column.label} (#${column.unitId})`
                : column.label,
        }))
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.unitId - b.unitId);
}

export type FlatListCostProductRow = {
    product_id: number;
    product_code: string | null;
    barcode: string | null;
    product_name: string;
    group_id: number;
    parent_id: number | null;
    unit_id: number | null;
    current_list_cost: number | null;
};

export function flattenListCostMatrixRows(rows: MatrixRow[]): FlatListCostProductRow[] {
    const flat: FlatListCostProductRow[] = [];

    for (const row of rows) {
        for (const variant of Object.values(row.variantsByUnitId)) {
            const product = variant.product;
            const listTier = variant.tiers.LIST;
            const current =
                listTier === null || listTier === undefined
                    ? product.cost_per_unit === null || product.cost_per_unit === undefined
                        ? null
                        : Number(product.cost_per_unit)
                    : Number(listTier);

            flat.push({
                product_id: Number(product.product_id),
                product_code: product.product_code ?? null,
                barcode: product.barcode ?? null,
                product_name: product.product_name ?? "",
                group_id: row.group_id,
                parent_id: product.parent_id ? Number(product.parent_id) : null,
                unit_id: product.unit_of_measurement ?? null,
                current_list_cost: Number.isFinite(current) ? current : null,
            });
        }
    }

    flat.sort((a, b) => a.product_name.localeCompare(b.product_name));
    return flat;
}
