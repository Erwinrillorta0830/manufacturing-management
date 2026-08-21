import { DIRECTUS_URL, headers } from "../_directus";
import { resolveParentSharedAttributes } from "@/modules/manufacturing-management/procurement/raw-materials/parent-inheritance";

export const RAW_MATERIAL_PRODUCT_TYPE = 389;
export const PACKAGING_MATERIAL_PRODUCT_TYPE = 390;

type ProductRecord = {
    product_id?: unknown;
    product_type?: unknown;
    product_brand?: unknown;
    product_category?: unknown;
    product_class?: unknown;
    product_segment?: unknown;
    product_section?: unknown;
    item_group_id?: unknown;
    tax_rate_id?: unknown;
    regulatory_code?: unknown;
    regulatory_notes?: unknown;
    parent_id?: unknown;
    isActive?: unknown;
};

type ClassificationOperation = "create" | "update";

export class RawMaterialClassificationError extends Error {
    constructor(
        public readonly status: 400 | 409 | 503,
        public readonly code: string,
        message: string,
        public readonly details: Record<string, unknown> = {}
    ) {
        super(message);
    }
}

function asPositiveId(value: unknown): number | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "object" && value !== null) {
        const record = value as Record<string, unknown>;
        return asPositiveId(record.product_id ?? record.id ?? record.value);
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasField(value: Record<string, unknown>, field: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, field);
}

function parseClassification(value: unknown, field: string): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    if (parsed !== RAW_MATERIAL_PRODUCT_TYPE && parsed !== PACKAGING_MATERIAL_PRODUCT_TYPE) {
        throw new RawMaterialClassificationError(
            400,
            "INVALID_PRODUCT_TYPE",
            `${field} must be Raw Material / Ingredient or Packaging Material.`,
            { receivedProductType: value }
        );
    }
    return parsed;
}

function productIdOf(product: ProductRecord): number {
    const productId = asPositiveId(product.product_id);
    if (!productId) throw new RawMaterialClassificationError(503, "INVALID_PRODUCT_DATA", "A product returned an invalid product ID.");
    return productId;
}

function parentIdOf(product: ProductRecord): number | null {
    return asPositiveId(product.parent_id);
}

function isActiveProduct(product: ProductRecord): boolean {
    const value = product.isActive;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) && value !== 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized !== "" && normalized !== "0" && normalized !== "false";
    }
    return false;
}

function productTypeOf(product: ProductRecord, label: string): number {
    const productType = parseClassification(product.product_type, label);
    if (!productType) {
        throw new RawMaterialClassificationError(
            409,
            "PARENT_CLASSIFICATION_CONFLICT",
            `${label} does not have a supported classification.`,
            { productId: productIdOf(product) }
        );
    }
    return productType;
}

async function fetchProduct(productId: number): Promise<ProductRecord> {
    const response = await fetch(
        `${DIRECTUS_URL}/items/products/${productId}?fields=product_id,product_type,product_brand,product_category,product_class,product_segment,product_section,item_group_id.item_group_id,item_group_id.group_code,item_group_id.group_name,tax_rate_id.TaxID,tax_rate_id.VATRate,tax_rate_id.WithholdingRate,regulatory_code,regulatory_notes,parent_id,isActive`,
        { headers, cache: "no-store" }
    );
    if (response.status === 404) {
        throw new RawMaterialClassificationError(409, "INVALID_PARENT_RELATIONSHIP", `Product ${productId} does not exist.`, { productId });
    }
    if (!response.ok) {
        throw new RawMaterialClassificationError(503, "CLASSIFICATION_LOOKUP_FAILED", "Unable to validate the product classification relationship.");
    }
    const body = await response.json();
    if (!body?.data || typeof body.data !== "object") {
        throw new RawMaterialClassificationError(503, "INVALID_PRODUCT_DATA", "The product classification response was invalid.");
    }
    return body.data as ProductRecord;
}

async function fetchChildren(parentId: number): Promise<ProductRecord[]> {
    const params = new URLSearchParams({
        "filter[parent_id][_eq]": String(parentId),
        fields: "product_id,product_type,parent_id,isActive",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/products?${params.toString()}`, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new RawMaterialClassificationError(503, "CLASSIFICATION_LOOKUP_FAILED", "Unable to validate existing child classifications.");
    }
    const body = await response.json();
    if (!Array.isArray(body?.data)) {
        throw new RawMaterialClassificationError(503, "INVALID_PRODUCT_DATA", "The child classification response was invalid.");
    }
    return body.data as ProductRecord[];
}

function conflict(
    message: string,
    details: { productId?: number; parentId?: number | null; expectedProductType?: number; receivedProductType?: unknown } = {}
): RawMaterialClassificationError {
    return new RawMaterialClassificationError(409, "PARENT_CLASSIFICATION_CONFLICT", message, details);
}

function ensureParentIsRoot(parent: ProductRecord, parentId: number): void {
    if (parentIdOf(parent)) {
        throw conflict("A child variant cannot be used as the parent of another raw-material family.", { parentId });
    }
}

export async function enforceClassificationIntegrity({
    operation,
    productId,
    productDetails,
    packagingVariants
}: {
    operation: ClassificationOperation;
    productId?: number;
    productDetails: Record<string, unknown>;
    packagingVariants: unknown[];
}): Promise<{
    productDetails: Record<string, unknown>;
    packagingVariants: Record<string, unknown>[];
}> {
    const currentProduct = operation === "update" && productId ? await fetchProduct(productId) : null;
    const currentParentId = currentProduct ? parentIdOf(currentProduct) : null;
    const existingChildren = operation === "update" && productId ? await fetchChildren(productId) : [];

    const hasParentField = hasField(productDetails, "parent_id");
    const requestedParentId = hasParentField ? asPositiveId(productDetails.parent_id) : currentParentId;

    const activeChildren = existingChildren.filter(isActiveProduct);
    if (currentProduct && activeChildren.length > 0 && hasParentField && requestedParentId !== currentParentId) {
        throw new RawMaterialClassificationError(
            409,
            "PARENT_RELATION_LOCKED",
            "Parent selection cannot be changed while active child variants exist.",
            { productId, parentId: currentParentId, activeChildCount: activeChildren.length }
        );
    }

    if (requestedParentId && productId && requestedParentId === productId) {
        throw conflict("A product cannot be its own parent.", { productId, parentId: requestedParentId });
    }

    const requestedParent = requestedParentId ? await fetchProduct(requestedParentId) : null;
    if (requestedParent && requestedParentId) ensureParentIsRoot(requestedParent, requestedParentId);

    const currentProductType = currentProduct
        ? productTypeOf(currentProduct, "The current product")
        : undefined;
    const parentProductType = requestedParent
        ? productTypeOf(requestedParent, "The selected parent")
        : undefined;
    const explicitProductType = parseClassification(productDetails.product_type, "product_type");
    const authoritativeProductType = parentProductType ?? explicitProductType ?? currentProductType;

    if (!authoritativeProductType) {
        throw new RawMaterialClassificationError(
            400,
            "INVALID_PRODUCT_TYPE",
            "A valid product classification is required."
        );
    }

    if (explicitProductType !== undefined && explicitProductType !== authoritativeProductType) {
        throw conflict("The child classification must match its parent classification.", {
            productId,
            parentId: requestedParentId,
            expectedProductType: authoritativeProductType,
            receivedProductType: explicitProductType
        });
    }

    if (currentProduct && existingChildren.length > 0 && currentProductType !== authoritativeProductType) {
        throw conflict("A parent classification cannot be changed while child variants exist.", {
            productId,
            expectedProductType: currentProductType,
            receivedProductType: authoritativeProductType
        });
    }

    for (const child of existingChildren) {
        const childProductType = productTypeOf(child, "An existing child variant");
        if (childProductType !== authoritativeProductType) {
            throw conflict("Existing child variants must match the parent classification before this family can be updated.", {
                productId: productIdOf(child),
                parentId: productId,
                expectedProductType: authoritativeProductType,
                receivedProductType: childProductType
            });
        }
    }

    const existingChildIds = new Set(existingChildren.map(productIdOf));
    const normalizedVariants = packagingVariants.map((rawVariant) => {
        if (!rawVariant || typeof rawVariant !== "object" || Array.isArray(rawVariant)) {
            throw new RawMaterialClassificationError(400, "INVALID_PRODUCT_DATA", "Packaging variant data is invalid.");
        }

        const variant = rawVariant as Record<string, unknown>;
        const variantProductId = asPositiveId(variant.product_id);
        const explicitVariantType = parseClassification(variant.product_type, "variant product_type");
        if (explicitVariantType !== undefined && explicitVariantType !== authoritativeProductType) {
            throw conflict("The child classification must match its parent classification.", {
                productId: variantProductId ?? undefined,
                parentId: productId ?? requestedParentId ?? undefined,
                expectedProductType: authoritativeProductType,
                receivedProductType: explicitVariantType
            });
        }

        if (operation === "create" && variantProductId) {
            throw new RawMaterialClassificationError(
                409,
                "INVALID_PARENT_RELATIONSHIP",
                "New family registration cannot update an existing child variant.",
                { productId: variantProductId }
            );
        }

        if (operation === "update" && variantProductId && !existingChildIds.has(variantProductId)) {
            throw new RawMaterialClassificationError(
                409,
                "INVALID_PARENT_RELATIONSHIP",
                "A packaging variant does not belong to the family being updated.",
                { productId: variantProductId, parentId: productId }
            );
        }

        const sharedAttributes = requestedParent
            ? resolveParentSharedAttributes(requestedParent)
            : resolveParentSharedAttributes({
                ...productDetails,
                product_type: authoritativeProductType
            });

        return {
            ...variant,
            ...sharedAttributes,
            product_type: authoritativeProductType
        };
    });

    const normalizedProductDetails = hasParentField
        ? { ...productDetails, parent_id: requestedParentId }
        : { ...productDetails };
    if (requestedParent) {
        Object.assign(normalizedProductDetails, resolveParentSharedAttributes(requestedParent));
    }

    return {
        productDetails: { ...normalizedProductDetails, product_type: authoritativeProductType },
        packagingVariants: normalizedVariants
    };
}
