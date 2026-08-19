import { DIRECTUS_URL, headers } from "./_directus";
import {
    PACKAGING_MATERIAL_PRODUCT_TYPE,
    RAW_MATERIAL_PRODUCT_TYPE
} from "./raw-materials/_classification-integrity";

export const PURCHASE_ORDER_CATEGORY_TYPES = ["RAW_MATERIAL", "PACKAGING"] as const;
export type PurchaseOrderCategoryType = typeof PURCHASE_ORDER_CATEGORY_TYPES[number];

type ProductClassificationRow = {
    product_id?: unknown;
    product_type?: unknown;
    parent_id?: unknown;
};

export class ProductCategoryTypeValidationError extends Error {
    constructor(
        public readonly status: 400 | 409 | 503,
        public readonly code: string,
        message: string,
        public readonly details: Record<string, unknown> = {}
    ) {
        super(message);
    }
}

function relationId(value: unknown, keys: string[] = ["product_id", "id", "value"]): number | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const resolved = relationId(record[key], keys);
            if (resolved !== null) return resolved;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasClassification(value: unknown): boolean {
    return value !== undefined && value !== null && value !== "";
}

function classificationId(value: unknown): number | null {
    return relationId(value, ["type_id", "product_type_id", "id", "value"]);
}

export function purchaseOrderCategoryTypeFromProductType(value: unknown): PurchaseOrderCategoryType | null {
    const id = classificationId(value);
    if (id === RAW_MATERIAL_PRODUCT_TYPE) return "RAW_MATERIAL";
    if (id === PACKAGING_MATERIAL_PRODUCT_TYPE) return "PACKAGING";
    return null;
}

function productTypeDescription(value: unknown): string {
    const id = classificationId(value);
    return id === null ? "an unassigned product type" : `product type ${id}`;
}

async function loadProducts(
    productIds: number[],
    fetchImpl: typeof fetch
): Promise<ProductClassificationRow[]> {
    if (productIds.length === 0) return [];
    const response = await fetchImpl(
        `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${encodeURIComponent(productIds.join(","))}&fields=product_id,product_type,parent_id&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!response.ok) {
        throw new ProductCategoryTypeValidationError(
            503,
            "PRODUCT_CLASSIFICATION_UNAVAILABLE",
            "Unable to validate product Category_Type against the product master.",
            { status: response.status }
        );
    }
    const payload = await response.json() as { data?: unknown };
    return Array.isArray(payload.data) ? payload.data as ProductClassificationRow[] : [];
}

export async function resolveProductCategoryTypes(
    productIds: number[],
    fetchImpl: typeof fetch = fetch
): Promise<Map<number, PurchaseOrderCategoryType>> {
    const uniqueProductIds = [...new Set(productIds.map(Number).filter(id => Number.isInteger(id) && id > 0))];
    const rows = await loadProducts(uniqueProductIds, fetchImpl);
    const rowsById = new Map(rows.map(row => [relationId(row.product_id), row] as const));
    const missingProductIds = uniqueProductIds.filter(productId => !rowsById.has(productId));
    if (missingProductIds.length > 0) {
        throw new ProductCategoryTypeValidationError(
            400,
            "PRODUCT_NOT_FOUND",
            "One or more products do not exist in the product master.",
            { missingProductIds }
        );
    }

    const parentIds = [...new Set(rows
        .map(row => relationId(row.parent_id))
        .filter((id): id is number => id !== null)
        .filter(id => !rowsById.has(id)))];
    const parentRows = await loadProducts(parentIds, fetchImpl);
    const parentById = new Map(parentRows.map(row => [relationId(row.product_id), row] as const));
    const resolved = new Map<number, PurchaseOrderCategoryType>();

    for (const productId of uniqueProductIds) {
        const product = rowsById.get(productId);
        const parentId = relationId(product?.parent_id);
        const parent = parentId === null ? undefined : (rowsById.get(parentId) || parentById.get(parentId));
        const ownHasClassification = hasClassification(product?.product_type);
        const parentHasClassification = hasClassification(parent?.product_type);
        const ownType = purchaseOrderCategoryTypeFromProductType(product?.product_type);
        const parentType = purchaseOrderCategoryTypeFromProductType(parent?.product_type);

        if (ownHasClassification && ownType === null) {
            throw new ProductCategoryTypeValidationError(
                400,
                "PRODUCT_CATEGORY_TYPE_UNSUPPORTED",
                `Product ${productId} has ${productTypeDescription(product?.product_type)}; only RAW_MATERIAL or PACKAGING is allowed.`,
                { productId, productType: product?.product_type }
            );
        }
        if (parentHasClassification && parentType === null) {
            throw new ProductCategoryTypeValidationError(
                400,
                "PARENT_CATEGORY_TYPE_UNSUPPORTED",
                `Parent product ${parentId} for product ${productId} is not classified as RAW_MATERIAL or PACKAGING.`,
                { productId, parentProductId: parentId, productType: parent?.product_type }
            );
        }
        if (ownType && parentType && ownType !== parentType) {
            throw new ProductCategoryTypeValidationError(
                409,
                "PRODUCT_CATEGORY_TYPE_CONFLICT",
                `Product ${productId} has conflicting product and parent Category_Type classifications.`,
                { productId, parentProductId: parentId, productCategoryType: ownType, parentCategoryType: parentType }
            );
        }

        const categoryType = ownType || parentType;
        if (!categoryType) {
            throw new ProductCategoryTypeValidationError(
                400,
                "PRODUCT_CATEGORY_TYPE_REQUIRED",
                `Product ${productId} must have a RAW_MATERIAL or PACKAGING Category_Type in the product master.`,
                { productId, parentProductId: parentId }
            );
        }
        resolved.set(productId, categoryType);
    }

    return resolved;
}

export async function validatePurchaseOrderCategoryTypes(
    lines: ReadonlyArray<{ productId: number; categoryType: unknown }>,
    fetchImpl: typeof fetch = fetch
): Promise<Map<number, PurchaseOrderCategoryType>> {
    for (const [lineIndex, line] of lines.entries()) {
        if (!PURCHASE_ORDER_CATEGORY_TYPES.includes(line.categoryType as PurchaseOrderCategoryType)) {
            throw new ProductCategoryTypeValidationError(
                400,
                "CATEGORY_TYPE_REQUIRED",
                `Line ${lineIndex + 1} must specify Category_Type as RAW_MATERIAL or PACKAGING.`,
                { lineIndex, productId: line.productId, categoryType: line.categoryType ?? null }
            );
        }
    }

    const resolved = await resolveProductCategoryTypes(lines.map(line => Number(line.productId)), fetchImpl);
    for (const [lineIndex, line] of lines.entries()) {
        const productId = Number(line.productId);
        const masterCategoryType = resolved.get(productId);
        if (masterCategoryType !== line.categoryType) {
            throw new ProductCategoryTypeValidationError(
                409,
                "CATEGORY_TYPE_MISMATCH",
                `Line ${lineIndex + 1} Category_Type does not match the product master classification.`,
                { lineIndex, productId, submittedCategoryType: line.categoryType, masterCategoryType }
            );
        }
    }
    return resolved;
}

