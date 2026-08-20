export interface ParentSharedAttributes {
    product_type: number | null;
    product_brand: number | null;
    product_category: number | null;
    product_class: number | null;
    product_segment: number | null;
    product_section: number | null;
}

function relationId(value: unknown, keys: string[]): number | null {
    if (typeof value === "number") {
        return Number.isSafeInteger(value) && value > 0 ? value : null;
    }

    if (typeof value === "string") {
        const parsed = Number(value.trim());
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }

    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const resolved = relationId(record[key], keys);
            if (resolved !== null) return resolved;
        }
    }

    return null;
}

function classificationId(value: unknown): number | null {
    return relationId(value, ["id", "class_id", "segment_id", "section_id"]);
}

export function resolveParentSharedAttributes(product: {
    product_type?: unknown;
    product_brand?: unknown;
    product_category?: unknown;
    product_class?: unknown;
    product_segment?: unknown;
    product_section?: unknown;
}): ParentSharedAttributes {
    const productType = relationId(product.product_type, ["id", "product_type"]);

    return {
        product_type: productType,
        product_brand: relationId(product.product_brand, ["brand_id", "id"]),
        product_category: relationId(product.product_category, ["category_id", "id"]),
        product_class: classificationId(product.product_class),
        product_segment: classificationId(product.product_segment),
        product_section: classificationId(product.product_section)
    };
}
