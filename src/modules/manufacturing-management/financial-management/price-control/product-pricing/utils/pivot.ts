import type { PriceRow, PriceType, PriceViewMode, PricingFilters, ProductTierKey } from "../types";

export const LIST_TIER_KEY = "LIST";
export const PRICE_VIEW_LIST_OPTION_ID = "LIST";

export function sortPriceTypes(priceTypes: PriceType[]): PriceType[] {
    return [...priceTypes].sort((a, b) => {
        const aSort = Number(a.sort ?? Number.MAX_SAFE_INTEGER);
        const bSort = Number(b.sort ?? Number.MAX_SAFE_INTEGER);
        return aSort - bSort || String(a.price_type_name ?? "").localeCompare(String(b.price_type_name ?? ""));
    });
}

export function priceTierKey(priceTypeId: number): string {
    return String(priceTypeId);
}

export function isListTierKey(tier: string): boolean {
    return tier === LIST_TIER_KEY;
}

export function buildMatrixTierKeys(priceTypes: PriceType[]): string[] {
    const sorted = sortPriceTypes(priceTypes);
    return [LIST_TIER_KEY, ...sorted.map((pt) => priceTierKey(pt.price_type_id))];
}

export function priceViewSelectionFromFilters(
    filters: Pick<PricingFilters, "price_view" | "price_type_ids" | "show_list_price">,
): string[] {
    if (filters.price_view === "ALL") return [];
    if (filters.price_view === "LIST") return [PRICE_VIEW_LIST_OPTION_ID];

    const ids: string[] = [];
    if (filters.show_list_price) ids.push(PRICE_VIEW_LIST_OPTION_ID);
    for (const id of filters.price_type_ids) {
        ids.push(String(id));
    }
    return ids;
}

export function filtersFromPriceViewSelection(
    ids: string[],
): Pick<PricingFilters, "price_view" | "price_type_ids" | "show_list_price"> {
    if (ids.length === 0) {
        return { price_view: "ALL", price_type_ids: [], show_list_price: false };
    }

    const hasList = ids.includes(PRICE_VIEW_LIST_OPTION_ID);
    const priceTypeIds = ids
        .filter((id) => id !== PRICE_VIEW_LIST_OPTION_ID)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);

    if (hasList && priceTypeIds.length === 0) {
        return { price_view: "LIST", price_type_ids: [], show_list_price: true };
    }

    return {
        price_view: "FOCUSED",
        price_type_ids: priceTypeIds,
        show_list_price: hasList,
    };
}

export function resolveVisibleTierKeys(args: {
    priceView: PriceViewMode;
    priceTypeIds: number[];
    priceTypes: PriceType[];
    showListPrice?: boolean;
    allTierKeys?: ProductTierKey[];
}): ProductTierKey[] {
    const { priceView, priceTypeIds, priceTypes, showListPrice = false, allTierKeys } = args;

    if (priceView === "ALL") {
        return allTierKeys ?? buildMatrixTierKeys(priceTypes);
    }

    if (priceView === "LIST") {
        return [LIST_TIER_KEY];
    }

    const tiers: ProductTierKey[] = [];
    if (showListPrice) tiers.push(LIST_TIER_KEY);

    const sorted = sortPriceTypes(priceTypes);
    for (const pt of sorted) {
        if (priceTypeIds.includes(pt.price_type_id)) {
            tiers.push(priceTierKey(pt.price_type_id));
        }
    }

    if (tiers.length === 0) return [LIST_TIER_KEY];
    return tiers;
}

export function priceViewFilterLabel(args: {
    priceView: PriceViewMode;
    priceTypeIds: number[];
    priceTypes: PriceType[];
    showListPrice?: boolean;
}): string {
    const { priceView, priceTypeIds, priceTypes, showListPrice = false } = args;

    if (priceView === "ALL") return "All";
    if (priceView === "LIST") return "List Cost";

    const labels: string[] = [];
    const sorted = sortPriceTypes(priceTypes);

    for (const pt of sorted) {
        if (priceTypeIds.includes(pt.price_type_id)) {
            labels.push(tierLabelForTierKey(priceTierKey(pt.price_type_id), priceTypes));
        }
    }

    if (showListPrice) labels.push("List Cost");

    if (labels.length === 0) return "Focused";
    return labels.join(", ");
}

export function emptyPivot(priceTypes: PriceType[]): Record<string, number | null> {
    const out: Record<string, number | null> = { [LIST_TIER_KEY]: null };
    for (const pt of priceTypes) {
        out[priceTierKey(pt.price_type_id)] = null;
    }
    return out;
}

export function pivotPrices(
    priceTypes: PriceType[],
    rows: PriceRow[],
): Map<number, Record<string, number | null>> {
    const validIds = new Set(priceTypes.map((pt) => pt.price_type_id));
    const out = new Map<number, Record<string, number | null>>();

    for (const r of rows) {
        if (!validIds.has(r.price_type_id)) continue;

        const tierKey = priceTierKey(r.price_type_id);
        if (!out.has(r.product_id)) {
            out.set(r.product_id, emptyPivot(priceTypes));
        }
        out.get(r.product_id)![tierKey] = r.price;
    }

    return out;
}

export function tierLabelForTierKey(tier: string, priceTypes: PriceType[]): string {
    if (isListTierKey(tier)) return "List Cost";

    const priceTypeId = Number(tier);
    if (!Number.isFinite(priceTypeId)) return tier;

    const match = priceTypes.find((pt) => pt.price_type_id === priceTypeId);
    return match?.price_type_name ?? tier;
}
