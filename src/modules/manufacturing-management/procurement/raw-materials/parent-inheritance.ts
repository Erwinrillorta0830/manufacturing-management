export interface ParentSharedAttributes {
    product_type: number | null;
    product_brand: number | null;
    product_category: number | null;
    product_class: number | null;
    product_segment: number | null;
    product_section: number | null;
    item_group_id: number | null;
    tax_rate_id: number | null;
    regulatory_code: string | null;
    regulatory_notes: string | null;
    price_control: {
        priceTypeId: number;
        priceTypeName: string;
    } | null;
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

function normalizedText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized || null;
}

function resolvePriceControl(productType: unknown, explicit: unknown): ParentSharedAttributes["price_control"] {
    const productTypeRecord = productType && typeof productType === "object"
        ? productType as Record<string, unknown>
        : null;
    const directRecord = explicit && typeof explicit === "object"
        ? explicit as Record<string, unknown>
        : null;
    const priceType = directRecord
        ?? (productTypeRecord?.default_purchase_price_type_id && typeof productTypeRecord.default_purchase_price_type_id === "object"
            ? productTypeRecord.default_purchase_price_type_id as Record<string, unknown>
            : null);
    const priceTypeId = relationId(priceType, ["price_type_id", "priceTypeId", "id"]);
    const priceTypeName = normalizedText(priceType?.price_type_name ?? priceType?.priceTypeName ?? priceType?.name);
    return priceTypeId && priceTypeName
        ? { priceTypeId, priceTypeName }
        : null;
}

export function resolveParentSharedAttributes(product: {
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
    price_control?: unknown;
}): ParentSharedAttributes {
    const productType = relationId(product.product_type, ["id", "product_type"]);

    return {
        product_type: productType,
        product_brand: relationId(product.product_brand, ["brand_id", "id"]),
        product_category: relationId(product.product_category, ["category_id", "id"]),
        product_class: classificationId(product.product_class),
        product_segment: classificationId(product.product_segment),
        product_section: classificationId(product.product_section),
        item_group_id: relationId(product.item_group_id, ["item_group_id", "id"]),
        tax_rate_id: relationId(product.tax_rate_id, ["TaxID", "tax_id", "id"]),
        regulatory_code: normalizedText(product.regulatory_code),
        regulatory_notes: normalizedText(product.regulatory_notes),
        price_control: resolvePriceControl(product.product_type, product.price_control)
    };
}
