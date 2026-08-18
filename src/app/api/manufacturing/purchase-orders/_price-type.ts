import { procurementDirectusFetch } from "../procurement/_directus";
import { DecimalValue } from "@/modules/manufacturing-management/decimal";

export type PurchaseOrderPriceTypeErrorCode =
    | "PRICE_TYPE_NOT_CONFIGURED"
    | "MIXED_PRICE_TYPES"
    | "PRICE_MATRIX_NOT_CONFIGURED"
    | "PRICE_FALLBACK_REQUIRED"
    | "PRICE_TYPE_LOOKUP_UNAVAILABLE";

export interface PurchaseOrderPriceTypeRule {
    productTypeId: number;
    productTypeName: string;
    priceTypeId: number | null;
    priceTypeName: string | null;
}

export interface ResolvedPurchaseOrderPriceType {
    priceTypeId: number;
    priceTypeName: string;
    productTypeIds: number[];
    pricesByProductId: Record<number, string>;
    missingProductIds: number[];
}

export interface PurchaseOrderPriceControlWarning {
    code: "PRICE_MATRIX_NOT_CONFIGURED";
    priceTypeId: number;
    missingProductIds: number[];
    usingEnteredPrices: true;
}

export class PurchaseOrderPriceTypeError extends Error {
    constructor(
        message: string,
        public readonly code: PurchaseOrderPriceTypeErrorCode,
        public readonly status = 400,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = "PurchaseOrderPriceTypeError";
    }
}

type DirectusRelation = number | string | Record<string, unknown> | null | undefined;

interface DirectusProductTypeRow {
    id?: number | string;
    type_id?: number | string;
    type_name?: string | null;
    name?: string | null;
    default_purchase_price_type_id?: DirectusRelation;
    default_purchase_price_type?: DirectusRelation;
}

interface DirectusProductRow {
    product_id?: number | string;
    product_type?: DirectusRelation;
    parent_id?: DirectusRelation & { product_type?: DirectusRelation };
    parent_product_type?: DirectusRelation;
}

interface DirectusPriceMatrixRow {
    product_id?: DirectusRelation;
    price_type_id?: DirectusRelation;
    price?: number | string | null;
}

interface DirectusPriceTypeRow {
    price_type_id?: number | string;
    price_type_name?: string | null;
}

function relationId(value: DirectusRelation, keys: string[]): number | null {
    if (typeof value === "number" || typeof value === "string") {
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }
    if (!value || typeof value !== "object") return null;
    for (const key of keys) {
        const parsed = Number(value[key]);
        if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }
    return null;
}

function relationName(value: DirectusRelation, keys: string[]): string | null {
    if (!value || typeof value !== "object") return null;
    for (const key of keys) {
        const name = value[key];
        if (typeof name === "string" && name.trim()) return name.trim();
    }
    return null;
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
        throw new PurchaseOrderPriceTypeError(
            directusErrorMessage(body, message),
            "PRICE_TYPE_LOOKUP_UNAVAILABLE",
            response.status >= 500 ? 503 : response.status
        );
    }
    return (await response.json()).data as T;
}

function normalizeRule(row: DirectusProductTypeRow): PurchaseOrderPriceTypeRule | null {
    const productTypeId = relationId(row.id ?? row.type_id, ["type_id", "id"]);
    if (!productTypeId) return null;
    const priceType = row.default_purchase_price_type_id ?? row.default_purchase_price_type;
    return {
        productTypeId,
        productTypeName: String(row.type_name || row.name || `Product Type #${productTypeId}`),
        priceTypeId: relationId(priceType, ["price_type_id", "id"]),
        priceTypeName: relationName(priceType, ["price_type_name", "name"])
    };
}

export async function fetchPurchaseOrderPriceTypeRules(): Promise<PurchaseOrderPriceTypeRule[]> {
    const rows = await directusData<DirectusProductTypeRow[]>(
        "/items/product_type?fields=id,name,default_purchase_price_type_id,default_purchase_price_type_id.price_type_id,default_purchase_price_type_id.price_type_name&sort=name&limit=-1",
        "Unable to load product-type price rules."
    );
    const rules = rows.map(normalizeRule).filter((rule): rule is PurchaseOrderPriceTypeRule => Boolean(rule));
    const priceTypeIds = [...new Set(rules
        .map(rule => rule.priceTypeId)
        .filter((id): id is number => id !== null))];
    if (priceTypeIds.length === 0) return rules;

    const priceTypes = await directusData<DirectusPriceTypeRow[]>(
        "/items/price_types?fields=price_type_id,price_type_name&limit=-1",
        "Unable to load Price Type names."
    );
    const namesById = new Map(
        priceTypes
            .map(priceType => {
                const id = relationId(priceType.price_type_id, ["price_type_id", "id"]);
                const name = priceType.price_type_name?.trim();
                return id && name ? [id, name] as const : null;
            })
            .filter((entry): entry is readonly [number, string] => Boolean(entry))
    );

    return rules.map(rule => ({
        ...rule,
        priceTypeName: rule.priceTypeName || (rule.priceTypeId ? namesById.get(rule.priceTypeId) || null : null)
    }));
}

function productTypeId(value: DirectusRelation): number | null {
    return relationId(value, ["type_id", "product_type_id", "id"]);
}

function isPositiveDecimal(value: unknown): boolean {
    if (value === null || value === undefined || value === "") return false;
    try {
        return DecimalValue.from(String(value)).compare(0) > 0;
    } catch {
        return false;
    }
}

export function assertEnteredPricesForMissingPriceControl(
    lines: readonly { productId: number; unitPrice: unknown }[],
    missingProductIds: readonly number[]
): void {
    const missingProductIdSet = new Set(missingProductIds);
    const invalidProductIds = lines
        .filter(line => missingProductIdSet.has(line.productId) && !isPositiveDecimal(line.unitPrice))
        .map(line => line.productId);

    if (invalidProductIds.length === 0) return;

    throw new PurchaseOrderPriceTypeError(
        "Enter a positive unit price for each product without a configured Price Control value.",
        "PRICE_FALLBACK_REQUIRED",
        400,
        { missingProductIds: [...new Set(invalidProductIds)] }
    );
}

export function buildPriceControlWarning(
    resolved: ResolvedPurchaseOrderPriceType
): PurchaseOrderPriceControlWarning | null {
    if (resolved.missingProductIds.length === 0) return null;
    return {
        code: "PRICE_MATRIX_NOT_CONFIGURED",
        priceTypeId: resolved.priceTypeId,
        missingProductIds: resolved.missingProductIds,
        usingEnteredPrices: true
    };
}

function resolveProductType(
    product: DirectusProductRow,
    productId: number,
    rulesByProductType: Map<number, PurchaseOrderPriceTypeRule>
) {
    const ownTypeId = productTypeId(product.product_type);
    const parentTypeId = product.parent_product_type
        ? productTypeId(product.parent_product_type)
        : product.parent_id && typeof product.parent_id === "object"
            ? productTypeId(product.parent_id.product_type)
            : null;

    if (ownTypeId && parentTypeId && ownTypeId !== parentTypeId) {
        throw new PurchaseOrderPriceTypeError(
            `Product ${productId} has a conflicting parent and variant classification.`,
            "PRICE_TYPE_NOT_CONFIGURED",
            400,
            { productId, productTypeId: ownTypeId, parentProductTypeId: parentTypeId }
        );
    }

    const resolvedTypeId = ownTypeId || parentTypeId;
    const rule = resolvedTypeId ? rulesByProductType.get(resolvedTypeId) : undefined;
    if (!resolvedTypeId || !rule?.priceTypeId) {
        throw new PurchaseOrderPriceTypeError(
            `Price Type is not configured for product ${productId}.`,
            "PRICE_TYPE_NOT_CONFIGURED",
            400,
            { productId, productTypeId: resolvedTypeId }
        );
    }

    return { productTypeId: resolvedTypeId, rule };
}

export function resolvePurchaseOrderPriceTypeFromRows(
    productIds: number[],
    products: DirectusProductRow[],
    rules: PurchaseOrderPriceTypeRule[],
    matrixRows: DirectusPriceMatrixRow[]
): ResolvedPurchaseOrderPriceType {
    const productsById = new Map(products.map(product => [relationId(product.product_id, ["product_id", "id"]), product]));
    const rulesByProductType = new Map(rules.map(rule => [rule.productTypeId, rule]));
    const resolutions = productIds.map(productId => {
        const product = productsById.get(productId);
        if (!product) {
            throw new PurchaseOrderPriceTypeError(
                `Product ${productId} could not be resolved for Price Type determination.`,
                "PRICE_TYPE_NOT_CONFIGURED",
                400,
                { productId }
            );
        }
        return { productId, ...resolveProductType(product, productId, rulesByProductType) };
    });

    const priceTypeIds = [...new Set(resolutions.map(resolution => resolution.rule.priceTypeId).filter((id): id is number => id !== null))];
    if (priceTypeIds.length !== 1) {
        throw new PurchaseOrderPriceTypeError(
            "All purchase-order lines must resolve to the same Price Type.",
            "MIXED_PRICE_TYPES",
            400,
            {
                productIds,
                priceTypeIds,
                productTypeIds: [...new Set(resolutions.map(resolution => resolution.productTypeId))]
            }
        );
    }

    const priceTypeId = priceTypeIds[0];
    const matrixByProductId = new Map<number, string>();
    for (const row of matrixRows) {
        const rowProductId = relationId(row.product_id, ["product_id", "id"]);
        const rowPriceTypeId = relationId(row.price_type_id, ["price_type_id", "id"]);
        const price = row.price == null ? "" : String(row.price).trim();
        if (rowProductId && rowPriceTypeId === priceTypeId && price && Number(price) > 0) {
            matrixByProductId.set(rowProductId, price);
        }
    }

    const missingProductIds = productIds.filter(productId => !matrixByProductId.has(productId));
    const rule = resolutions[0].rule;
    const priceTypeName = rule.priceTypeName || `Price Type #${priceTypeId}`;
    return {
        priceTypeId,
        priceTypeName,
        productTypeIds: [...new Set(resolutions.map(resolution => resolution.productTypeId))],
        pricesByProductId: Object.fromEntries(matrixByProductId.entries()),
        missingProductIds
    };
}

export async function resolvePurchaseOrderPriceType(productIds: number[]): Promise<ResolvedPurchaseOrderPriceType> {
    const uniqueProductIds = [...new Set(productIds)];
    const productFilter = uniqueProductIds.join(",");
    const [selectedProducts, rules] = await Promise.all([
        directusData<DirectusProductRow[]>(
            `/items/products?filter[product_id][_in]=${productFilter}&fields=product_id,product_type,parent_id&limit=${uniqueProductIds.length}`,
            "Unable to load products for Price Type determination."
        ),
        fetchPurchaseOrderPriceTypeRules()
    ]);
    const parentProductIds = [...new Set(selectedProducts
        .map(product => relationId(product.parent_id, ["product_id", "id"]))
        .filter((id): id is number => id !== null))];
    let products = selectedProducts;
    if (parentProductIds.length > 0) {
        const parentProducts = await directusData<DirectusProductRow[]>(
            `/items/products?filter[product_id][_in]=${parentProductIds.join(",")}&fields=product_id,product_type&limit=${parentProductIds.length}`,
            "Unable to load parent products for Price Type determination."
        );
        const parentTypes = new Map(parentProducts.map(product => [
            relationId(product.product_id, ["product_id", "id"]),
            product.product_type
        ]));
        products = selectedProducts.map(product => {
            const parentId = relationId(product.parent_id, ["product_id", "id"]);
            return parentId && parentTypes.has(parentId)
                ? { ...product, parent_product_type: parentTypes.get(parentId) }
                : product;
        });
    }
    const rulesByProductType = new Map(rules.map(rule => [rule.productTypeId, rule]));
    const resolvedTypeIds = products.flatMap(product => {
        const ownType = productTypeId(product.product_type);
        const parentType = product.parent_product_type
            ? productTypeId(product.parent_product_type)
            : product.parent_id && typeof product.parent_id === "object"
                ? productTypeId(product.parent_id.product_type)
                : null;
        return [ownType, parentType].filter((id): id is number => id !== null);
    });
    const priceTypeIds = [...new Set(resolvedTypeIds.map(typeId => rulesByProductType.get(typeId)?.priceTypeId).filter((id): id is number => id !== null))];
    if (priceTypeIds.length !== 1) {
        return resolvePurchaseOrderPriceTypeFromRows(uniqueProductIds, products, rules, []);
    }
    const matrixRows = await directusData<DirectusPriceMatrixRow[]>(
        `/items/product_per_price_type?filter[product_id][_in]=${productFilter}&filter[price_type_id][_eq]=${priceTypeIds[0]}&fields=product_id,price_type_id,price&limit=-1`,
        "Unable to load Price Control matrix entries."
    );
    const resolved = resolvePurchaseOrderPriceTypeFromRows(uniqueProductIds, products, rules, matrixRows);
    if (!resolved.priceTypeName || resolved.priceTypeName.startsWith("Price Type #")) {
        const priceType = await directusData<{ price_type_name?: string }>(
            `/items/price_types/${resolved.priceTypeId}?fields=price_type_id,price_type_name`,
            "Unable to load the resolved Price Type."
        );
        return { ...resolved, priceTypeName: priceType.price_type_name || resolved.priceTypeName };
    }
    return resolved;
}
