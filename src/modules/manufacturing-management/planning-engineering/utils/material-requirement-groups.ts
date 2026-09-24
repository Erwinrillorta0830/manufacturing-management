export interface MaterialRequirementGroup<T> {
    productId: number;
    uomId: unknown;
    requiredQuantity: number;
    first: T;
    sourceItems: T[];
}

interface GroupMaterialRequirementsOptions<T> {
    productId: (item: T) => unknown;
    uomId: (item: T) => unknown;
    quantity: (item: T) => unknown;
}

function relationValue(value: unknown, keys: string[]): unknown {
    if (!value || typeof value !== "object") return value;
    const relation = value as Record<string, unknown>;
    return keys.map((key) => relation[key]).find((candidate) => candidate !== undefined && candidate !== null) ?? value;
}

function normalizedReference(value: unknown): string {
    const reference = relationValue(value, ["unit_id", "uom_id", "id", "unit_shortcut", "unit_name"]);
    if (reference === undefined || reference === null || String(reference).trim() === "") return "product-default-uom";
    const text = String(reference).trim();
    const number = Number(text);
    return Number.isFinite(number) ? `id:${number}` : `label:${text.toLocaleLowerCase()}`;
}

/** Groups material demand rows by product and normalized UOM, summing their demand. */
export function groupMaterialRequirements<T>(
    items: T[],
    options: GroupMaterialRequirementsOptions<T>
): MaterialRequirementGroup<T>[] {
    const groups = new Map<string, MaterialRequirementGroup<T>>();

    items.forEach((item, index) => {
        const productId = Number(relationValue(options.productId(item), ["product_id", "id"]));
        const uomId = options.uomId(item);
        const quantity = Number(options.quantity(item));
        const safeQuantity = Number.isFinite(quantity) ? quantity : 0;
        const key = Number.isSafeInteger(productId) && productId > 0
            ? `${productId}|${normalizedReference(uomId)}`
            : `unkeyed:${index}`;
        const existing = groups.get(key);

        if (existing) {
            existing.requiredQuantity += safeQuantity;
            existing.sourceItems.push(item);
            return;
        }

        groups.set(key, {
            productId,
            uomId,
            requiredQuantity: safeQuantity,
            first: item,
            sourceItems: [item]
        });
    });

    return [...groups.values()];
}
