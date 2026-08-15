/**
 * Normalizes Directus relation values across the numeric, string, and expanded
 * object shapes returned by different catalog queries.
 */
export function normalizeProductRelationId(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isSafeInteger(value) && value > 0 ? value : null;
    }

    if (typeof value === "string") {
        const normalized = Number(value.trim());
        return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
    }

    if (value && typeof value === "object") {
        const relation = value as { product_id?: unknown; id?: unknown };
        return normalizeProductRelationId(relation.product_id ?? relation.id);
    }

    return null;
}

export function resolveProductParentId(product: {
    product_id?: unknown;
    parent_id?: unknown;
} | null | undefined): number | null {
    if (!product) return null;
    return normalizeProductRelationId(product.parent_id) ?? normalizeProductRelationId(product.product_id);
}
