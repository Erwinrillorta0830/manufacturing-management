import { pickId, type ProductRow } from "./_productGroups";
import { fetchDirectusPricesByProductIds } from "./_fetchProductPrices";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const PRICE_TYPES = "price_types";

export const LIST_TIER_KEY = "LIST";
export const PRINT_MATRIX_MAX_GROUP_IDS = 100;

export type ServerPriceType = {
    price_type_id: number;
    price_type_name: string;
    sort: number | null;
};

export type ServerPriceRow = {
    id: number;
    product_id: number;
    price_type_id: number;
    price: number | null;
    status: string;
    updated_at: string | null;
};

export type PrintMatrixProductRow = {
    product_id: number;
    parent_id: number | null;
    product_code: string | null;
    barcode: string | null;
    product_name: string;
    isActive: number;
    product_category: number | null;
    product_brand: number | null;
    unit_of_measurement: number | null;
    price_per_unit: number | null;
    priceA: number | null;
    priceB: number | null;
    priceC: number | null;
    priceD: number | null;
    priceE: number | null;
    cost_per_unit: number | null;
};

export type PrintMatrixVariantCell = {
    product: PrintMatrixProductRow;
    tiers: Record<string, number | null>;
};

export type PrintMatrixRow = {
    group_id: number;
    display: PrintMatrixProductRow;
    variantsByUnitId: Record<number, PrintMatrixVariantCell>;
    category_name: null;
    brand_name: null;
};

function directusToken() {
    return process.env.DIRECTUS_STATIC_TOKEN || process.env.DIRECTUS_SERVICE_TOKEN || "";
}

function directusHeaders(): Record<string, string> {
    const token = directusToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function fetchDirectus<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        cache: "no-store",
        ...init,
        headers: {
            ...directusHeaders(),
            ...(init?.headers ?? {}),
        },
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
}

function toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function toNumberOrZero(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function toClientProductRow(row: ProductRow): PrintMatrixProductRow | null {
    const productId = pickId(row.product_id);
    if (!productId) return null;

    const productName = String(row.product_name ?? "").trim();
    if (!productName) return null;

    return {
        product_id: productId,
        parent_id: pickId(row.parent_id),
        product_code: row.product_code != null ? String(row.product_code) : null,
        barcode: row.barcode != null ? String(row.barcode) : null,
        product_name: productName,
        isActive: toNumberOrZero(row.isActive),
        product_category: toNullableNumber(row.product_category),
        product_brand: toNullableNumber(row.product_brand),
        unit_of_measurement: toNullableNumber(row.unit_of_measurement),
        price_per_unit: toNullableNumber(row.price_per_unit),
        priceA: toNullableNumber(row.priceA),
        priceB: toNullableNumber(row.priceB),
        priceC: toNullableNumber(row.priceC),
        priceD: toNullableNumber(row.priceD),
        priceE: toNullableNumber(row.priceE),
        cost_per_unit: toNullableNumber(row.cost_per_unit),
    };
}

function priceTierKey(priceTypeId: number): string {
    return String(priceTypeId);
}

export function emptyPivot(priceTypes: ServerPriceType[]): Record<string, number | null> {
    const out: Record<string, number | null> = { [LIST_TIER_KEY]: null };
    for (const pt of priceTypes) {
        out[priceTierKey(pt.price_type_id)] = null;
    }
    return out;
}

export function pivotPricesForAssembly(
    priceTypes: ServerPriceType[],
    rows: ServerPriceRow[],
): Map<number, Record<string, number | null>> {
    const validIds = new Set(priceTypes.map((pt) => pt.price_type_id));
    const out = new Map<number, Record<string, number | null>>();

    for (const row of rows) {
        if (!validIds.has(row.price_type_id)) continue;

        const tierKey = priceTierKey(row.price_type_id);
        if (!out.has(row.product_id)) {
            out.set(row.product_id, emptyPivot(priceTypes));
        }
        out.get(row.product_id)![tierKey] = row.price;
    }

    return out;
}

export async function fetchPricesForProductIds(productIds: number[]): Promise<ServerPriceRow[]> {
    if (productIds.length === 0) return [];

    const rawRows = await fetchDirectusPricesByProductIds(productIds);
    const rows: ServerPriceRow[] = [];

    for (const row of rawRows) {
        const productId = pickId(row.product_id);
        const priceTypeId = pickId(row.price_type_id);
        const id = pickId(row.id);
        if (!productId || !priceTypeId || !id) continue;

        rows.push({
            id,
            product_id: productId,
            price_type_id: priceTypeId,
            price: toNullableNumber(row.price),
            status: String(row.status ?? ""),
            updated_at: row.updated_at != null ? String(row.updated_at) : null,
        });
    }

    return rows;
}

type DirectusPriceTypeRow = {
    price_type_id?: number | string | null;
    price_type_name?: string | null;
    sort?: number | string | null;
};

export async function fetchServerPriceTypes(): Promise<ServerPriceType[]> {
    if (!DIRECTUS_URL) return [];

    const params = new URLSearchParams();
    params.set("limit", "-1");
    params.set("fields", "price_type_id,price_type_name,sort");
    params.set("sort", "sort,price_type_id");

    const url = `${DIRECTUS_URL}/items/${PRICE_TYPES}?${params.toString()}`;
    const json = await fetchDirectus<{ data: DirectusPriceTypeRow[] }>(url);

    const out: ServerPriceType[] = [];
    for (const row of json.data ?? []) {
        const priceTypeId = pickId(row.price_type_id);
        if (!priceTypeId) continue;
        out.push({
            price_type_id: priceTypeId,
            price_type_name: String(row.price_type_name ?? ""),
            sort: toNullableNumber(row.sort),
        });
    }

    return out;
}

export function assemblePrintMatrixRows(args: {
    groupIds: number[];
    variantsByGroup: Map<number, ProductRow[]>;
    priceMap: Map<number, Record<string, number | null>>;
    priceTypes: ServerPriceType[];
}): { rows: PrintMatrixRow[]; usedUnitIds: number[] } {
    const { groupIds, variantsByGroup, priceMap, priceTypes } = args;
    const emptyPivotForPrint = emptyPivot(priceTypes);
    const usedUnitIds = new Set<number>();
    const rows: PrintMatrixRow[] = [];

    for (const groupId of groupIds) {
        const variants = variantsByGroup.get(groupId) ?? [];
        if (variants.length === 0) continue;

        const display =
            variants.find((v) => Number(pickId(v.product_id)) === Number(groupId)) ?? variants[0];
        const displayRow = toClientProductRow(display);
        if (!displayRow) continue;

        const variantsByUnitId: Record<number, PrintMatrixVariantCell> = {};

        for (const variant of variants) {
            const clientVariant = toClientProductRow(variant);
            const productId = clientVariant?.product_id;
            const uomId = clientVariant?.unit_of_measurement;
            if (!clientVariant || !productId || !uomId) continue;

            usedUnitIds.add(uomId);
            variantsByUnitId[uomId] = {
                product: clientVariant,
                tiers: {
                    ...(priceMap.get(productId) ?? emptyPivotForPrint),
                    [LIST_TIER_KEY]: clientVariant.cost_per_unit,
                },
            };
        }

        if (Object.keys(variantsByUnitId).length === 0) continue;

        rows.push({
            group_id: groupId,
            display: displayRow,
            variantsByUnitId,
            category_name: null,
            brand_name: null,
        });
    }

    rows.sort((a, b) => a.display.product_name.localeCompare(b.display.product_name));

    return {
        rows,
        usedUnitIds: Array.from(usedUnitIds),
    };
}
