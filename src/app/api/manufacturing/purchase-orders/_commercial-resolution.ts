import { DecimalValue } from "@/modules/manufacturing-management/decimal";
import { procurementDirectusFetch } from "../procurement/_directus";
import {
    PurchaseOrderPriceTypeError,
    resolvePurchaseOrderPriceType
} from "./_price-type";

export type PurchaseOrderDiscountSource = "supplier" | "manual" | "none";

export interface PurchaseOrderCommercialLine {
    productId: number;
    parentProductId: number | null;
    pricePhp: string | null;
    priceSourceProductId: number | null;
    discountTypeId: number | null;
    discountTypeName: string | null;
    discountPercent: string;
    discountSourceProductId: number | null;
}

export interface PurchaseOrderCommercialResolution {
    priceTypeId: number;
    priceTypeName: string;
    missingPriceProductIds: number[];
    lines: PurchaseOrderCommercialLine[];
}

export class PurchaseOrderCommercialResolutionError extends Error {
    constructor(
        message: string,
        public readonly status = 503,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = "PurchaseOrderCommercialResolutionError";
    }
}

type DirectusRelation = number | string | Record<string, unknown> | null | undefined;

interface DirectusProductRow {
    product_id?: DirectusRelation;
    parent_id?: DirectusRelation;
}

interface DirectusDiscountTypeRow {
    id?: number | string;
    discount_type?: string | null;
    total_percent?: number | string | null;
}

interface DirectusSupplierProductRow {
    product_id?: DirectusRelation;
    discount_type?: DirectusRelation;
}

function relationId(value: unknown, keys = ["id", "product_id"]): number | null {
    if (typeof value === "number" || typeof value === "string") {
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }
    if (!value || typeof value !== "object") return null;
    const relation = value as Record<string, unknown>;
    for (const key of keys) {
        const parsed = Number(relation[key]);
        if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }
    return null;
}

function relationValue(value: unknown, key: string): unknown {
    return value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : undefined;
}

function directusErrorMessage(body: unknown, fallback: string): string {
    if (!body || typeof body !== "object") return fallback;
    const errors = (body as { errors?: Array<{ message?: string }> }).errors;
    return errors?.[0]?.message || fallback;
}

async function directusData<T>(path: string, message: string): Promise<T> {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new PurchaseOrderCommercialResolutionError(
            directusErrorMessage(body, message),
            response.status >= 500 ? 503 : response.status
        );
    }
    return (await response.json()).data as T;
}

function normalizeDiscount(
    value: unknown,
    fallbackRows: Map<number, DirectusDiscountTypeRow>
): { id: number; name: string; percent: string } | null {
    const id = relationId(value);
    if (!id) return null;

    const relation = value && typeof value === "object" ? value : fallbackRows.get(id);
    const name = typeof relationValue(relation, "discount_type") === "string"
        ? String(relationValue(relation, "discount_type")).trim()
        : `Discount Type #${id}`;
    const rawPercent = relationValue(relation, "total_percent") ?? fallbackRows.get(id)?.total_percent;
    try {
        const percent = DecimalValue.from(rawPercent == null ? "" : String(rawPercent));
        if (percent.compare(0) < 0 || percent.compare(100) > 0) throw new Error("out of range");
        return { id, name, percent: percent.toFixed(2) };
    } catch {
        throw new PurchaseOrderCommercialResolutionError(
            `Discount Type ${id} has an invalid percentage configuration.`,
            503,
            { discountTypeId: id }
        );
    }
}

export async function resolvePurchaseOrderDiscountType(discountTypeId: number) {
    const row = await directusData<DirectusDiscountTypeRow>(
        `/items/discount_type/${discountTypeId}?fields=id,discount_type,total_percent`,
        "Unable to validate the selected discount type."
    );
    const normalized = normalizeDiscount(row, new Map([[discountTypeId, row]]));
    if (!normalized) {
        throw new PurchaseOrderCommercialResolutionError(
            `Discount Type ${discountTypeId} was not found.`,
            400,
            { discountTypeId }
        );
    }
    return normalized;
}

export async function resolvePurchaseOrderCommercialTerms(
    supplierId: number,
    productIds: number[]
): Promise<PurchaseOrderCommercialResolution> {
    const uniqueProductIds = [...new Set(productIds)];
    if (uniqueProductIds.length === 0) {
        throw new PurchaseOrderCommercialResolutionError("At least one product is required for commercial-term resolution.", 400);
    }

    const priceResolution = await resolvePurchaseOrderPriceType(uniqueProductIds);
    const products = await directusData<DirectusProductRow[]>(
        `/items/products?filter[product_id][_in]=${uniqueProductIds.join(",")}&fields=product_id,parent_id&limit=${uniqueProductIds.length}`,
        "Unable to load product relationships for commercial-term resolution."
    );
    const productsById = new Map<number, DirectusProductRow>();
    for (const product of products) {
        const productId = relationId(product.product_id, ["product_id", "id"]);
        if (productId) productsById.set(productId, product);
    }

    const parentProductIds = [...new Set(uniqueProductIds
        .map(productId => relationId(productsById.get(productId)?.parent_id, ["product_id", "id"]))
        .filter((id): id is number => id !== null))];
    const supplierProductIds = [...new Set([...uniqueProductIds, ...parentProductIds])];
    const supplierRows = await directusData<DirectusSupplierProductRow[]>(
        `/items/product_per_supplier?filter[supplier_id][_eq]=${supplierId}&filter[product_id][_in]=${supplierProductIds.join(",")}&fields=product_id,discount_type.*&limit=-1`,
        "Unable to load supplier discount configuration."
    );

    const fallbackDiscountTypeIds = [...new Set(supplierRows
        .map(row => relationId(row.discount_type))
        .filter((id): id is number => id !== null))];
    const fallbackDiscountRows = fallbackDiscountTypeIds.length > 0
        ? await directusData<DirectusDiscountTypeRow[]>(
            `/items/discount_type?filter[id][_in]=${fallbackDiscountTypeIds.join(",")}&fields=id,discount_type,total_percent&limit=-1`,
            "Unable to load supplier discount type details."
        )
        : [];
    const discountTypesById = new Map(
        fallbackDiscountRows
            .map(row => {
                const id = relationId(row.id, ["id"]);
                return id ? [id, row] as const : null;
            })
            .filter((entry): entry is readonly [number, DirectusDiscountTypeRow] => entry !== null)
    );
    const supplierRowsByProductId = new Map<number, DirectusSupplierProductRow>();
    supplierRows.forEach(row => {
        const productId = relationId(row.product_id, ["product_id", "id"]);
        if (productId) supplierRowsByProductId.set(productId, row);
    });

    const lines = uniqueProductIds.map(productId => {
        const parentProductId = relationId(productsById.get(productId)?.parent_id, ["product_id", "id"]);
        const supplierRow = supplierRowsByProductId.has(productId)
            ? supplierRowsByProductId.get(productId)
            : parentProductId
                ? supplierRowsByProductId.get(parentProductId)
                : undefined;
        const discount = normalizeDiscount(supplierRow?.discount_type, discountTypesById);
        return {
            productId,
            parentProductId,
            pricePhp: priceResolution.pricesByProductId[productId] || null,
            priceSourceProductId: priceResolution.priceSourceProductIds[productId] || null,
            discountTypeId: discount?.id || null,
            discountTypeName: discount?.name || null,
            discountPercent: discount?.percent || "0.00",
            discountSourceProductId: discount ? (relationId(supplierRow?.product_id, ["product_id", "id"]) || null) : null
        } satisfies PurchaseOrderCommercialLine;
    });

    return {
        priceTypeId: priceResolution.priceTypeId,
        priceTypeName: priceResolution.priceTypeName,
        missingPriceProductIds: priceResolution.missingProductIds,
        lines
    };
}

export { PurchaseOrderPriceTypeError };
