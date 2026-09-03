import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../_directus";
import { formatPhtDateTime, getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { productCreationAuditFields, productUpdateAuditFields } from "@/app/api/manufacturing/product-audit";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
import { verifyOrGetValidWeightUnitId } from "@/app/api/manufacturing/finished-goods/weight-units/weight-units-helper";
import {
    ProductIdentityError,
    ensureProductIdentityAvailable,
    resolveProductIdentity,
    type ProductIdentity
} from "@/app/api/manufacturing/finished-goods/products/product-identity";
import {
    RawMaterialQaError,
    normalizePurchaseQaConfig,
    syncProductQaSpecifications
} from "./_purchase-qa";
import {
    enforceClassificationIntegrity,
    RawMaterialClassificationError
} from "./_classification-integrity";
import {
    ProductWeightValidationError,
    isPackagingMaterialProductType,
    resolveProductWeightBreakdown,
    validateProductWeightForProductType
} from "@/modules/manufacturing-management/procurement/packaging-weight";
import {
    getDensityRequirement,
    normalizeDensityForRequirement,
    validateDensityForRequirement,
    type DensityRequirement
} from "@/modules/manufacturing-management/procurement/raw-materials/density-policy";
import type { PurchaseQaConfig } from "@/modules/manufacturing-management/procurement/raw-materials/types/raw-materials.types";

function isPositiveNumber(value: unknown): boolean {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return false;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0;
}

function hasProvidedValue(value: unknown): boolean {
    return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
}

function resolveUomId(value: unknown): number | null {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return resolveUomId(record.unit_id ?? record.id);
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

type DensityUnitRecord = {
    unit_id: number | string;
    unit_name?: string | null;
    unit_shortcut?: string | null;
};

async function loadDensityPolicies(unitIds: number[]): Promise<Map<number, DensityRequirement>> {
    const uniqueIds = [...new Set(unitIds)];
    const params = new URLSearchParams({
        fields: "unit_id,unit_name,unit_shortcut",
        limit: String(uniqueIds.length)
    });
    params.set("filter[unit_id][_in]", uniqueIds.join(","));

    const response = await fetch(`${DIRECTUS_URL}/items/units?${params.toString()}`, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new RawMaterialQaError(503, "Unable to load UOM density policies.");
    }

    const body = await response.json().catch(() => null) as { data?: unknown } | null;
    if (!Array.isArray(body?.data)) {
        throw new RawMaterialQaError(503, "UOM density policies returned an invalid response.");
    }

    return new Map((body.data as DensityUnitRecord[]).map(unit => {
        const id = resolveUomId(unit.unit_id);
        return id === null ? null : [id, getDensityRequirement(unit)] as const;
    }).filter((entry): entry is readonly [number, DensityRequirement] => entry !== null));
}

type CurrentVariantMeasurement = {
    unit_of_measurement?: unknown;
    density_factor?: unknown;
};

async function loadCurrentVariantMeasurements(productIds: number[]): Promise<Map<number, CurrentVariantMeasurement>> {
    const uniqueIds = [...new Set(productIds)];
    if (uniqueIds.length === 0) return new Map();

    const params = new URLSearchParams({
        fields: "product_id,unit_of_measurement.unit_id,density_factor",
        limit: String(uniqueIds.length)
    });
    params.set("filter[product_id][_in]", uniqueIds.join(","));

    const response = await fetch(`${DIRECTUS_URL}/items/products?${params.toString()}`, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new RawMaterialQaError(503, "Unable to load current packaging variant measurements.");
    }

    const body = await response.json().catch(() => null) as { data?: unknown } | null;
    if (!Array.isArray(body?.data)) {
        throw new RawMaterialQaError(503, "Packaging variant measurements returned an invalid response.");
    }

    return new Map((body.data as Array<{ product_id?: unknown }>)
        .map(row => {
            const productId = resolveUomId(row.product_id);
            return productId === null ? null : [productId, row as CurrentVariantMeasurement] as const;
        })
        .filter((entry): entry is readonly [number, CurrentVariantMeasurement] => entry !== null));
}

function requireUomId(value: unknown, label: string): number {
    const id = resolveUomId(value);
    if (id === null) throw new RawMaterialQaError(400, `${label} UOM is required and must be valid.`);
    return id;
}

function normalizeDensityForUom(
    value: unknown,
    uomId: number,
    policies: Map<number, DensityRequirement>,
    label: string
): number | null {
    const requirement = policies.get(uomId);
    if (requirement === undefined) {
        throw new RawMaterialQaError(400, `${label} UOM is invalid or unavailable.`);
    }

    const validationError = validateDensityForRequirement(value, requirement, label);
    if (validationError) throw new RawMaterialQaError(400, validationError);
    return normalizeDensityForRequirement(value, requirement);
}

function normalizeBarcode(value: unknown, defaultNull: boolean): string | null | undefined {
    if (value === undefined) return defaultNull ? null : undefined;
    if (value === null) return null;
    if (typeof value !== "string") throw new RawMaterialQaError(400, "Barcode must be a text value.");
    const normalized = value.trim();
    return normalized || null;
}

function normalizeProductImage(value: unknown, defaultNull: boolean): string | null | undefined {
    if (value === undefined) return defaultNull ? null : undefined;
    if (value === null) return null;
    if (typeof value !== "string" && typeof value !== "number") {
        throw new RawMaterialQaError(400, "Product image must be a valid uploaded file ID.");
    }
    const normalized = String(value).trim();
    return normalized || null;
}

function normalizeSafetyStock(value: unknown, defaultZero: boolean): number | undefined {
    if (value === undefined || value === null || value === "") return defaultZero ? 0 : undefined;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new RawMaterialQaError(400, "Safety Stock must be a whole number greater than or equal to 0.");
    }
    return parsed;
}

function withoutPurchaseQa(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter(([key]) => ![
        "purchaseQa",
        "price_control",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by"
    ].includes(key)));
}

function buildWeightPayload(
    productDetails: Record<string, unknown>,
    requireComplete: boolean
): Record<string, unknown> {
    const breakdown = resolveProductWeightBreakdown(productDetails, { requireComplete });
    if (!breakdown.isComponentBased) {
        return {
            weight: hasProvidedValue(productDetails.weight) ? Number(productDetails.weight) : null,
            product_weight: hasProvidedValue(productDetails.weight)
                ? Number(productDetails.weight)
                : null
        };
    }

    return {
        net_weight: breakdown.netWeight,
        outer_carton_weight: breakdown.outerCartonWeight,
        pallet_weight: breakdown.palletWeight,
        weight: breakdown.grossWeight,
        product_weight: breakdown.grossWeight
    };
}

function weightValidationMessage(error: unknown): string {
    return error instanceof ProductWeightValidationError
        ? error.message
        : "Net weight, outer carton weight, pallet weight, and weight unit must be valid.";
}

async function ensureBarcodeAvailable(value: string | null | undefined, productId?: number): Promise<void> {
    if (!value) return;
    const params = new URLSearchParams({
        "filter[barcode][_eq]": value,
        fields: "product_id",
        limit: "1"
    });
    if (productId) params.set("filter[product_id][_neq]", String(productId));
    const response = await fetch(`${DIRECTUS_URL}/items/products?${params.toString()}`, { headers, cache: "no-store" });
    if (!response.ok) throw new RawMaterialQaError(503, "Unable to verify barcode uniqueness.");
    const body = await response.json();
    if (Array.isArray(body.data) && body.data.length > 0) {
        throw new RawMaterialQaError(400, `Barcode "${value}" is already assigned to another product.`);
    }
}

async function ensureUniqueSubmittedBarcodes(entries: Array<{ value: string | null | undefined; productId?: number }>): Promise<void> {
    const seen = new Set<string>();
    for (const entry of entries) {
        const value = entry.value;
        if (!value) continue;
        const normalized = value.toLowerCase();
        if (seen.has(normalized)) throw new RawMaterialQaError(400, `Barcode "${value}" is duplicated in this submission.`);
        seen.add(normalized);
        await ensureBarcodeAvailable(value, entry.productId);
    }
}

function hasProvidedActiveFlag(value: unknown): boolean {
    return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
}

function isValidActiveFlag(value: unknown): boolean {
    if (!hasProvidedActiveFlag(value)) return true;
    if (typeof value === "boolean") return true;
    if (typeof value === "number") return value === 0 || value === 1;
    return typeof value === "string" && (value.trim() === "0" || value.trim() === "1");
}

function normalizeActiveFlag(value: unknown, fallback = 1): number {
    if (!hasProvidedActiveFlag(value)) return fallback;
    if (typeof value === "boolean") return value ? 1 : 0;
    return Number(value);
}

function validateMeasurementFields(productDetails: Record<string, unknown>, requireAll: boolean): string | null {
    const fields: Array<{ name: string; label: string }> = [
        { name: "unit_of_measurement", label: "UOM is required." },
        { name: "unit_of_measurement_count", label: "UOM ratio is required and must be greater than 0." }
    ];

    for (const field of fields) {
        const isPresent = Object.prototype.hasOwnProperty.call(productDetails, field.name);
        if ((requireAll || isPresent) && !isPositiveNumber(productDetails[field.name])) {
            return field.label;
        }
    }

    return validateProductWeightForProductType(productDetails, productDetails.product_type);
}

function validatePackagingVariants(packagingVariants: unknown, productType: unknown): string | null {
    if (!Array.isArray(packagingVariants) || packagingVariants.length === 0) return null;

    const requireWeightComponents = isPackagingMaterialProductType(productType);
    let weightValidationError: string | null = null;

    const hasInvalidVariant = packagingVariants.some((variant) => {
        if (!variant || typeof variant !== "object") return true;
        const item = variant as Record<string, unknown>;
        const invalidMeasurements = !isPositiveNumber(item.unit_of_measurement) ||
            !isPositiveNumber(item.unit_of_measurement_count);
        if (invalidMeasurements) return true;

        weightValidationError = validateProductWeightForProductType(item, productType);
        return Boolean(weightValidationError);
    });

    return hasInvalidVariant
        ? !requireWeightComponents && weightValidationError
            ? `Variant weight: ${weightValidationError}`
            : requireWeightComponents
            ? "Packaging variants require valid UOM, conversion count, net weight, outer carton weight, pallet weight, and weight unit values."
            : "Variants require valid UOM, conversion count, and any supplied weight components must be complete."
            : null;
}

type ResolvedPackagingVariant = {
    variant: Record<string, unknown>;
    identity: ProductIdentity;
};

async function resolvePackagingVariantIdentities(
    packagingVariants: unknown,
    options: { parentId?: number; parentName?: string }
): Promise<ResolvedPackagingVariant[]> {
    if (!Array.isArray(packagingVariants) || packagingVariants.length === 0) return [];

    return Promise.all(packagingVariants.map(async (rawVariant) => {
        if (!rawVariant || typeof rawVariant !== "object") {
            throw new ProductIdentityError("Packaging variant data is invalid.");
        }

        const variant = rawVariant as Record<string, unknown>;
        const identity = await resolveProductIdentity({
            parentId: options.parentId,
            productName: options.parentName,
            unitId: variant.unit_of_measurement as number | string | null | undefined
        });
        const currentProductId = variant.product_id === undefined || variant.product_id === null
            ? undefined
            : Number(variant.product_id);

        await ensureProductIdentityAvailable(
            identity,
            Number.isFinite(currentProductId) ? currentProductId : undefined
        );

        return { variant, identity };
    }));
}


type SupplierLinkRecord = {
    id?: unknown;
    supplier_id?: unknown;
};

type SupplierRecord = {
    id?: unknown;
    isActive?: unknown;
    supplier_name?: unknown;
    supplier_shortcut?: unknown;
};

function resolvePositiveInteger(value: unknown): number | null {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return resolvePositiveInteger(record.id ?? record.product_id ?? record.supplier_id);
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeSupplierIds(value: unknown): number[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new RawMaterialQaError(400, "supplierIds must be an array.");
    }

    const ids: number[] = [];
    for (const rawId of value) {
        const id = resolvePositiveInteger(rawId);
        if (id === null) {
            throw new RawMaterialQaError(400, "supplierIds must contain only positive integer IDs.");
        }
        if (!ids.includes(id)) ids.push(id);
    }
    return ids;
}

function supplierIdsFromLinks(links: SupplierLinkRecord[], productId: number): number[] {
    const ids: number[] = [];
    for (const link of links) {
        const supplierId = resolvePositiveInteger(link.supplier_id);
        if (supplierId === null) {
            throw new Error(`Supplier link for product ${productId} has an invalid supplier ID.`);
        }
        if (!ids.includes(supplierId)) ids.push(supplierId);
    }
    return ids;
}

async function readProductSupplierLinks(productId: number): Promise<SupplierLinkRecord[]> {
    const params = new URLSearchParams({
        "filter[product_id][_eq]": String(productId),
        fields: "id,supplier_id",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/product_per_supplier?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    const body = await response.json().catch(() => null) as { data?: unknown; error?: unknown } | null;
    if (!response.ok) {
        const detail = typeof body?.error === "string" ? `: ${body.error}` : "";
        throw new Error(`Directus failed to fetch supplier links for product ${productId}: ${response.status}${detail}`);
    }
    if (!Array.isArray(body?.data)) {
        throw new Error(`Directus returned an invalid supplier-link response for product ${productId}.`);
    }
    return body.data as SupplierLinkRecord[];
}

async function readSupplierRecords(supplierIds: number[]): Promise<Map<number, SupplierRecord>> {
    const recordsById = new Map<number, SupplierRecord>();
    if (supplierIds.length === 0) return recordsById;

    const params = new URLSearchParams({
        "filter[id][_in]": supplierIds.join(","),
        fields: "id,isActive,supplier_name,supplier_shortcut",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/suppliers?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    const body = await response.json().catch(() => null) as { data?: unknown; error?: unknown } | null;
    if (!response.ok) {
        const detail = typeof body?.error === "string" ? `: ${body.error}` : "";
        throw new Error(`Directus failed to validate suppliers: ${response.status}${detail}`);
    }
    if (!Array.isArray(body?.data)) {
        throw new Error("Directus returned an invalid supplier response.");
    }

    for (const rawRecord of body.data) {
        if (!rawRecord || typeof rawRecord !== "object") continue;
        const record = rawRecord as SupplierRecord;
        const id = resolvePositiveInteger(record.id);
        if (id !== null) recordsById.set(id, record);
    }

    const missingIds = supplierIds.filter(id => !recordsById.has(id));
    if (missingIds.length > 0) {
        throw new RawMaterialQaError(400, `Supplier record(s) not found: ${missingIds.join(", ")}.`);
    }
    return recordsById;
}

function isActiveSupplier(value: unknown): boolean {
    if (value === true || value === 1) return true;
    return typeof value === "string" && ["true", "1"].includes(value.trim().toLowerCase());
}

async function validateSupplierSelection(supplierIds: number[], existingSupplierIds: number[] = []): Promise<void> {
    const idsToCheck = [...new Set([...supplierIds, ...existingSupplierIds])];
    const recordsById = await readSupplierRecords(idsToCheck);
    const existingSet = new Set(existingSupplierIds);
    const inactiveNewSupplierIds = supplierIds.filter(id => !existingSet.has(id) && !isActiveSupplier(recordsById.get(id)?.isActive));

    if (inactiveNewSupplierIds.length > 0) {
        throw new RawMaterialQaError(
            400,
            `Only active suppliers can be newly linked. Inactive supplier(s): ${inactiveNewSupplierIds.join(", ")}.`
        );
    }
}

async function ensureSupplierMutationSucceeded(response: Response, action: string): Promise<void> {
    if (response.ok) return;
    const detail = (await response.text().catch(() => "")).trim().slice(0, 500);
    throw new Error(`${action} failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
}

async function synchronizeProductSupplierLinks(productId: number, desiredSupplierIds: number[]): Promise<void> {
    const existingLinks = await readProductSupplierLinks(productId);
    const desiredSet = new Set(desiredSupplierIds);
    const retainedSupplierIds = new Set<number>();

    for (const link of existingLinks) {
        const linkId = resolvePositiveInteger(link.id);
        const supplierId = resolvePositiveInteger(link.supplier_id);
        if (linkId === null || supplierId === null) {
            throw new Error(`Supplier link for product ${productId} has invalid relationship data.`);
        }

        const keep = desiredSet.has(supplierId) && !retainedSupplierIds.has(supplierId);
        if (keep) {
            retainedSupplierIds.add(supplierId);
            continue;
        }

        const response = await fetch(`${DIRECTUS_URL}/items/product_per_supplier/${encodeURIComponent(String(linkId))}`, {
            method: "DELETE",
            headers
        });
        await ensureSupplierMutationSucceeded(response, `Removing supplier ${supplierId} from product ${productId}`);
    }

    for (const supplierId of desiredSupplierIds) {
        if (retainedSupplierIds.has(supplierId)) continue;

        const response = await fetch(`${DIRECTUS_URL}/items/product_per_supplier`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                product_id: productId,
                supplier_id: supplierId
            })
        });
        await ensureSupplierMutationSucceeded(response, `Linking supplier ${supplierId} to product ${productId}`);
        retainedSupplierIds.add(supplierId);
    }
}

async function readChildProductIds(parentProductId: number): Promise<number[]> {
    const params = new URLSearchParams({
        "filter[parent_id][_eq]": String(parentProductId),
        fields: "product_id",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/products?${params.toString()}`, { headers, cache: "no-store" });
    const body = await response.json().catch(() => null) as { data?: unknown; error?: unknown } | null;
    if (!response.ok) {
        const detail = typeof body?.error === "string" ? `: ${body.error}` : "";
        throw new Error(`Directus failed to fetch child products for ${parentProductId}: ${response.status}${detail}`);
    }
    if (!Array.isArray(body?.data)) {
        throw new Error(`Directus returned an invalid child-product response for ${parentProductId}.`);
    }

    const childIds: number[] = [];
    for (const rawChild of body.data) {
        const childId = rawChild && typeof rawChild === "object"
            ? resolvePositiveInteger((rawChild as Record<string, unknown>).product_id)
            : null;
        if (childId === null) throw new Error(`Directus returned an invalid child product for ${parentProductId}.`);
        if (!childIds.includes(childId)) childIds.push(childId);
    }
    return childIds;
}

function haveSameIds(left: number[], right: number[]): boolean {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every(id => rightSet.has(id));
}

async function synchronizeFamilySupplierLinks(parentProductId: number, desiredSupplierIds: number[]): Promise<void> {
    await synchronizeProductSupplierLinks(parentProductId, desiredSupplierIds);

    const persistedParentIds = supplierIdsFromLinks(
        await readProductSupplierLinks(parentProductId),
        parentProductId
    );
    if (!haveSameIds(persistedParentIds, desiredSupplierIds)) {
        throw new Error(`Supplier links for parent product ${parentProductId} could not be verified after saving.`);
    }

    const childProductIds = await readChildProductIds(parentProductId);
    for (const childProductId of childProductIds) {
        await synchronizeProductSupplierLinks(childProductId, persistedParentIds);
    }
}


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("productId");

        if (!productId) {
            return NextResponse.json({ error: "productId is required" }, { status: 400 });
        }

        const numericProductId = resolvePositiveInteger(productId);
        if (numericProductId === null) {
            return NextResponse.json({ error: "productId must be a positive integer" }, { status: 400 });
        }

        const links = await readProductSupplierLinks(numericProductId);
        const supplierIds = supplierIdsFromLinks(links, numericProductId);
        return NextResponse.json(supplierIds);
    } catch (e) {
        console.error("API Error fetching product suppliers:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch product suppliers" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { productDetails, supplierIds, packagingVariants } = body;

        if (!productDetails || !productDetails.product_name || !productDetails.product_code) {
            return NextResponse.json({ error: "Missing required fields (product_name, product_code)" }, { status: 400 });
        }

        if (!isValidActiveFlag(productDetails.isActive)) {
            return NextResponse.json({ error: "isActive must be either 0 or 1." }, { status: 400 });
        }

        const requestedSupplierIds = normalizeSupplierIds(supplierIds);
        const parentProductId = resolvePositiveInteger(productDetails.parent_id);
        const normalizedSupplierIds = parentProductId
            ? supplierIdsFromLinks(await readProductSupplierLinks(parentProductId), parentProductId)
            : requestedSupplierIds || [];
        if (!parentProductId) {
            await validateSupplierSelection(normalizedSupplierIds);
        }

        const purchaseQa = await normalizePurchaseQaConfig(productDetails.purchaseQa);
        const normalizedProductBarcode = normalizeBarcode(productDetails.barcode, true);
        const normalizedProductImage = normalizeProductImage(productDetails.product_image, true);
        const normalizedSafetyStock = normalizeSafetyStock(productDetails.maintaining_quantity, true);
        const submittedVariants = Array.isArray(packagingVariants) ? packagingVariants : [];
        const normalizedVariants = await Promise.all(submittedVariants.map(async (rawVariant) => {
            if (!rawVariant || typeof rawVariant !== "object") return rawVariant;
            const variant = rawVariant as Record<string, unknown>;
            return {
                ...variant,
                barcode: normalizeBarcode(variant.barcode, true),
                maintaining_quantity: normalizeSafetyStock(variant.maintaining_quantity, true),
                product_image: normalizeProductImage(variant.product_image, true),
                purchaseQa: await normalizePurchaseQaConfig(variant.purchaseQa)
            };
        }));

        const classification = await enforceClassificationIntegrity({
            operation: "create",
            productDetails,
            packagingVariants: normalizedVariants
        });
        Object.assign(productDetails, classification.productDetails);
        const classifiedVariants = classification.packagingVariants;

        const measurementError = validateMeasurementFields(productDetails, true);
        if (measurementError) {
            return NextResponse.json({ error: measurementError }, { status: 400 });
        }

        const isPackagingMaterial = isPackagingMaterialProductType(productDetails.product_type);
        const variantsError = validatePackagingVariants(classifiedVariants, productDetails.product_type);
        if (variantsError) {
            return NextResponse.json({ error: variantsError }, { status: 400 });
        }

        const primaryUomId = requireUomId(productDetails.unit_of_measurement, "Primary");
        const variantUomIds = classifiedVariants.map((variant, index) =>
            requireUomId((variant as Record<string, unknown>).unit_of_measurement, `Variant ${index + 1}`)
        );
        const densityPolicies = await loadDensityPolicies([primaryUomId, ...variantUomIds]);
        const normalizedDensity = normalizeDensityForUom(
            productDetails.density_factor,
            primaryUomId,
            densityPolicies,
            "Density"
        );
        const normalizedVariantDensities = variantUomIds.map((uomId, index) => normalizeDensityForUom(
            (classifiedVariants[index] as Record<string, unknown>).density_factor,
            uomId,
            densityPolicies,
            `Variant ${index + 1} density`
        ));

        if (classifiedVariants.some(variant => {
            return !variant || typeof variant !== "object" || !isValidActiveFlag((variant as Record<string, unknown>).isActive);
        })) {
            return NextResponse.json({ error: "Packaging variant isActive must be either 0 or 1." }, { status: 400 });
        }

        await ensureUniqueSubmittedBarcodes([
            { value: normalizedProductBarcode },
            ...classifiedVariants.map(variant => ({
                value: variant && typeof variant === "object"
                    ? (variant as Record<string, unknown>).barcode as string | null | undefined
                    : undefined
            }))
        ]);

        const resolvedVariants = await resolvePackagingVariantIdentities(classifiedVariants, {
            parentName: productDetails.product_name
        });

        const weightPayload = buildWeightPayload(productDetails, isPackagingMaterial);
        const rawWeightUnitId = hasProvidedValue(productDetails.weight_unit_id) ? Number(productDetails.weight_unit_id) : null;
        let verifiedWeightUnitId: number | null = null;
        if (rawWeightUnitId !== null) {
            verifiedWeightUnitId = await verifyOrGetValidWeightUnitId(rawWeightUnitId);
            if (!verifiedWeightUnitId) {
                return NextResponse.json({ error: "Selected weight unit is invalid." }, { status: 400 });
            }
        }

        // Get logged in user ID from the secure access token cookie
        const userId = await getUserIdFromToken();

        // Check if a product with the same name already exists in Directus
        const checkRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_name][_eq]=${encodeURIComponent(productDetails.product_name)}&limit=1`, { headers });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.data && checkData.data.length > 0) {
                return NextResponse.json({ error: "A material with this name already exists. Please choose a unique name." }, { status: 400 });
            }
        }

        const todayStr = await getTodayDateString();
        const createdAt = formatPhtDateTime();

        // Create Raw Material / Packaging Product with explicit null overrides for foreign keys to bypass invalid database defaults
        const productPayload = {
            ...withoutPurchaseQa(productDetails),
            ...weightPayload,
            density_factor: normalizedDensity,
            weight_unit_id: verifiedWeightUnitId,
            barcode: normalizedProductBarcode,
            maintaining_quantity: normalizedSafetyStock,
            product_image: normalizedProductImage,
            product_brand: productDetails.product_brand !== undefined ? productDetails.product_brand : null,
            product_category: productDetails.product_category !== undefined ? productDetails.product_category : null,
            product_class: productDetails.product_class !== undefined ? productDetails.product_class : null,
            product_segment: productDetails.product_segment !== undefined ? productDetails.product_segment : null,
            product_section: productDetails.product_section !== undefined ? productDetails.product_section : null,
            item_group_id: productDetails.item_group_id !== undefined ? productDetails.item_group_id : null,
            tax_rate_id: productDetails.tax_rate_id !== undefined ? productDetails.tax_rate_id : null,
            regulatory_code: productDetails.regulatory_code !== undefined ? productDetails.regulatory_code : null,
            regulatory_notes: productDetails.regulatory_notes !== undefined ? productDetails.regulatory_notes : null,
            isActive: normalizeActiveFlag(productDetails.isActive),
            status: "Approved",
            item_type: "regular", // Must be regular due to DB enum constraint
            date_added: productDetails.date_added || todayStr,
            created_by: userId ? Number(userId) : null,
            ...productCreationAuditFields(createdAt)
        };

        const prodRes = await fetch(`${DIRECTUS_URL}/items/products?fields=product_id`, {
            method: "POST",
            headers,
            body: JSON.stringify(productPayload)
        });

        if (!prodRes.ok) {
            const errText = await prodRes.text();
            throw new Error(`Directus failed to create raw material product: ${prodRes.status} - ${errText}`);
        }
        const prodJson = await prodRes.json();
        const productId = prodJson.data?.product_id;

        if (!productId) {
            throw new Error("Directus did not return the created raw material ID.");
        }

        await syncProductQaSpecifications(Number(productId), purchaseQa);

        // Create child packaging variants if passed
        if (resolvedVariants.length > 0) {
            for (const [variantIndex, { variant, identity }] of resolvedVariants.entries()) {
                    const variantWeightPayload = buildWeightPayload(variant, isPackagingMaterial);
                    const variantPayload = {
                        ...withoutPurchaseQa(variant),
                        product_name: identity.productName,
                        description: identity.descriptionKey,
                        short_description: identity.descriptionKey,
                        ...variantWeightPayload,
                        density_factor: normalizedVariantDensities[variantIndex],
                        product_brand: variant.product_brand !== undefined ? variant.product_brand : null,
                        product_category: variant.product_category !== undefined ? variant.product_category : null,
                        product_class: variant.product_class !== undefined ? variant.product_class : null,
                        product_segment: variant.product_segment !== undefined ? variant.product_segment : null,
                        product_section: variant.product_section !== undefined ? variant.product_section : null,
                        item_group_id: variant.item_group_id !== undefined ? variant.item_group_id : null,
                        tax_rate_id: variant.tax_rate_id !== undefined ? variant.tax_rate_id : null,
                        regulatory_code: variant.regulatory_code !== undefined ? variant.regulatory_code : null,
                        regulatory_notes: variant.regulatory_notes !== undefined ? variant.regulatory_notes : null,
                        parent_id: productId,
                        isActive: normalizeActiveFlag(variant.isActive),
                        status: "Approved",
                        item_type: "regular",
                        date_added: todayStr,
                        created_by: userId ? Number(userId) : null,
                        ...productCreationAuditFields(createdAt)
                    };

                    const varRes = await fetch(`${DIRECTUS_URL}/items/products?fields=product_id`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(variantPayload)
                    });

                    if (varRes.ok) {
                        const varJson = await varRes.json();
                        const childId = varJson.data?.product_id;

                        if (!childId) {
                            throw new Error("Directus did not return the created packaging variant ID.");
                        }

                        await syncProductQaSpecifications(
                            Number(childId),
                            variant.purchaseQa as PurchaseQaConfig | undefined
                        );

                    } else {
                        const errText = await varRes.text();
                        throw new Error(`Directus failed to create packaging variant: ${varRes.status} - ${errText}`);
                    }
            }
        }

        if (parentProductId) {
            await synchronizeFamilySupplierLinks(parentProductId, normalizedSupplierIds);
        } else if (supplierIds !== undefined) {
            await synchronizeFamilySupplierLinks(Number(productId), normalizedSupplierIds);
        }

        return NextResponse.json({ success: true, productId });
    } catch (e) {
        if (e instanceof RawMaterialClassificationError) {
            return NextResponse.json(
                { error: e.message, code: e.code, ...e.details },
                { status: e.status }
            );
        }
        if (e instanceof ProductIdentityError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        if (e instanceof ProductWeightValidationError) {
            return NextResponse.json({ error: weightValidationMessage(e) }, { status: e.status });
        }
        if (e instanceof RawMaterialQaError) {
            return NextResponse.json({ error: e.message }, { status: e.status });
        }
        console.error("API Error registering raw material:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to register raw material" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { productId, productDetails, supplierIds, packagingVariants } = body;
        const hasSupplierIds = Object.prototype.hasOwnProperty.call(body, "supplierIds");
        const normalizedSupplierIds = hasSupplierIds ? (normalizeSupplierIds(supplierIds) || []) : undefined;

        if (!productId) {
            return NextResponse.json({ error: "productId is required" }, { status: 400 });
        }

        const numericProductId = Number(productId);
        if (!Number.isInteger(numericProductId) || numericProductId <= 0) {
            return NextResponse.json({ error: "productId must be a positive integer" }, { status: 400 });
        }

        if (!productDetails || typeof productDetails !== "object") {
            return NextResponse.json({ error: "productDetails is required." }, { status: 400 });
        }

        const hasBarcodeField = Object.prototype.hasOwnProperty.call(productDetails, "barcode");
        const hasSafetyStockField = Object.prototype.hasOwnProperty.call(productDetails, "maintaining_quantity");
        const hasProductImageField = Object.prototype.hasOwnProperty.call(productDetails, "product_image");
        const hasPurchaseQaField = Object.prototype.hasOwnProperty.call(productDetails, "purchaseQa");
        const normalizedProductBarcode = hasBarcodeField
            ? normalizeBarcode(productDetails.barcode, false)
            : undefined;
        const normalizedProductImage = hasProductImageField
            ? normalizeProductImage(productDetails.product_image, false)
            : undefined;
        const normalizedSafetyStock = hasSafetyStockField
            ? normalizeSafetyStock(productDetails.maintaining_quantity, false)
            : undefined;
        const purchaseQa = hasPurchaseQaField
            ? await normalizePurchaseQaConfig(productDetails.purchaseQa, Number(productId))
            : undefined;
        const submittedVariants = Array.isArray(packagingVariants) ? packagingVariants : [];
        const normalizedVariants = await Promise.all(submittedVariants.map(async (rawVariant) => {
            if (!rawVariant || typeof rawVariant !== "object") return rawVariant;
            const variant = rawVariant as Record<string, unknown>;
            const hasVariantBarcode = Object.prototype.hasOwnProperty.call(variant, "barcode");
            const hasVariantSafetyStock = Object.prototype.hasOwnProperty.call(variant, "maintaining_quantity");
            const hasVariantImage = Object.prototype.hasOwnProperty.call(variant, "product_image");
            const hasVariantQa = Object.prototype.hasOwnProperty.call(variant, "purchaseQa");
            return {
                ...variant,
                ...(hasVariantBarcode ? { barcode: normalizeBarcode(variant.barcode, false) } : {}),
                ...(hasVariantSafetyStock ? { maintaining_quantity: normalizeSafetyStock(variant.maintaining_quantity, false) } : {}),
                ...(hasVariantImage ? { product_image: normalizeProductImage(variant.product_image, false) } : {}),
                ...(hasVariantQa ? { purchaseQa: await normalizePurchaseQaConfig(variant.purchaseQa, Number(variant.product_id || 0)) } : {})
            };
        }));

        const classification = await enforceClassificationIntegrity({
            operation: "update",
            productId: numericProductId,
            productDetails,
            packagingVariants: normalizedVariants
        });
        Object.assign(productDetails, classification.productDetails);
        const classifiedVariants = classification.packagingVariants;

        const currentProductResponse = await fetch(
            `${DIRECTUS_URL}/items/products/${numericProductId}?fields=parent_id,product_type,unit_of_measurement.unit_id,density_factor,weight,product_weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id`,
            { headers, cache: "no-store" }
        );
        if (!currentProductResponse.ok) {
            throw new RawMaterialQaError(503, "Unable to load the current product weight specification.");
        }
        const currentProduct = (await currentProductResponse.json()).data as Record<string, unknown>;
        const parentProductId = resolvePositiveInteger(currentProduct.parent_id);
        const supplierSyncRootProductId = parentProductId || numericProductId;
        const inheritedSupplierIds = parentProductId
            ? supplierIdsFromLinks(await readProductSupplierLinks(parentProductId), parentProductId)
            : undefined;
        if (!parentProductId && normalizedSupplierIds !== undefined) {
            const existingParentLinks = await readProductSupplierLinks(supplierSyncRootProductId);
            const existingParentSupplierIds = supplierIdsFromLinks(existingParentLinks, supplierSyncRootProductId);
            await validateSupplierSelection(normalizedSupplierIds, existingParentSupplierIds);
        }
        const effectiveUomId = hasProvidedValue(productDetails.unit_of_measurement)
            ? requireUomId(productDetails.unit_of_measurement, "Primary")
            : requireUomId(currentProduct.unit_of_measurement, "Primary");
        const effectiveWeightDetails = {
            ...currentProduct,
            ...productDetails,
            unit_of_measurement: effectiveUomId
        };

        const measurementError = validateMeasurementFields(effectiveWeightDetails, false);
        if (measurementError) {
            return NextResponse.json({ error: measurementError }, { status: 400 });
        }

        const isPackagingMaterial = isPackagingMaterialProductType(effectiveWeightDetails.product_type);
        const variantsError = validatePackagingVariants(classifiedVariants, effectiveWeightDetails.product_type);
        if (variantsError) {
            return NextResponse.json({ error: variantsError }, { status: 400 });
        }

        const currentVariantIds = classifiedVariants
            .map(variant => variant && typeof variant === "object" ? resolveUomId((variant as Record<string, unknown>).product_id) : null)
            .filter((id): id is number => id !== null);
        const currentVariantMeasurements = await loadCurrentVariantMeasurements(currentVariantIds);
        const variantUomIds = classifiedVariants.map((variant, index) => {
            const record = variant as Record<string, unknown>;
            const current = currentVariantMeasurements.get(resolveUomId(record.product_id) || 0);
            const submittedUom = hasProvidedValue(record.unit_of_measurement)
                ? record.unit_of_measurement
                : current?.unit_of_measurement;
            return requireUomId(submittedUom, `Variant ${index + 1}`);
        });
        const densityPolicies = await loadDensityPolicies([effectiveUomId, ...variantUomIds]);
        const normalizedDensity = normalizeDensityForUom(
            Object.prototype.hasOwnProperty.call(productDetails, "density_factor")
                ? productDetails.density_factor
                : currentProduct.density_factor,
            effectiveUomId,
            densityPolicies,
            "Density"
        );
        const normalizedVariantDensities = variantUomIds.map((uomId, index) => {
            const record = classifiedVariants[index] as Record<string, unknown>;
            const current = currentVariantMeasurements.get(resolveUomId(record.product_id) || 0);
            const densityInput = Object.prototype.hasOwnProperty.call(record, "density_factor")
                ? record.density_factor
                : current?.density_factor;
            return normalizeDensityForUom(
                densityInput,
                uomId,
                densityPolicies,
                `Variant ${index + 1} density`
            );
        });

        if (!isValidActiveFlag(productDetails.isActive) || classifiedVariants.some(variant => {
            return !variant || typeof variant !== "object" || !isValidActiveFlag((variant as Record<string, unknown>).isActive);
        })) {
            return NextResponse.json({ error: "isActive must be either 0 or 1." }, { status: 400 });
        }

        await ensureUniqueSubmittedBarcodes([
            ...(hasBarcodeField ? [{ value: normalizedProductBarcode, productId: Number(productId) }] : []),
            ...classifiedVariants.flatMap(variant => {
                if (!variant || typeof variant !== "object") return [];
                const record = variant as Record<string, unknown>;
                return Object.prototype.hasOwnProperty.call(record, "barcode")
                    ? [{ value: record.barcode as string | null | undefined, productId: record.product_id ? Number(record.product_id) : undefined }]
                    : [];
            })
        ]);

        const resolvedVariants = await resolvePackagingVariantIdentities(classifiedVariants, {
            parentId: numericProductId
        });

        const userId = await getUserIdFromToken();
        if (!userId || !Number.isInteger(userId) || userId <= 0) {
            return NextResponse.json({ error: "A valid authenticated user is required to update raw materials." }, { status: 401 });
        }
        const operationTimestamp = formatPhtDateTime();
        const auditFields = productUpdateAuditFields(userId);

        const hasWeightField = Object.prototype.hasOwnProperty.call(productDetails, "weight");
        const hasWeightUnitField = Object.prototype.hasOwnProperty.call(productDetails, "weight_unit_id");
        const hasWeightComponentFields = ["net_weight", "outer_carton_weight", "pallet_weight"]
            .some(field => Object.prototype.hasOwnProperty.call(productDetails, field));
        const shouldPersistWeight = isPackagingMaterial || hasWeightField || hasWeightUnitField || hasWeightComponentFields;

        const rawWeightUnitId = hasWeightUnitField
            ? (hasProvidedValue(productDetails.weight_unit_id) ? Number(productDetails.weight_unit_id) : null)
            : undefined;
        let verifiedWeightUnitId: number | null | undefined;
        if (rawWeightUnitId !== undefined && rawWeightUnitId !== null) {
            verifiedWeightUnitId = await verifyOrGetValidWeightUnitId(rawWeightUnitId);
            if (!verifiedWeightUnitId) {
                return NextResponse.json({ error: "Selected weight unit is invalid." }, { status: 400 });
            }
        }

        // Clean product brand, category, etc., if they are undefined to map to null
        const productPayload = {
            ...withoutPurchaseQa(productDetails),
            ...(shouldPersistWeight ? buildWeightPayload(effectiveWeightDetails, isPackagingMaterial) : {}),
            density_factor: normalizedDensity,
            ...(hasWeightUnitField ? { weight_unit_id: verifiedWeightUnitId ?? null } : {}),
            ...(hasBarcodeField ? { barcode: normalizedProductBarcode } : {}),
            ...(hasSafetyStockField ? { maintaining_quantity: normalizedSafetyStock } : {}),
            ...(hasProductImageField ? { product_image: normalizedProductImage } : {}),
            product_brand: productDetails.product_brand !== undefined ? productDetails.product_brand : null,
            product_category: productDetails.product_category !== undefined ? productDetails.product_category : null,
            product_class: productDetails.product_class !== undefined ? productDetails.product_class : null,
            product_segment: productDetails.product_segment !== undefined ? productDetails.product_segment : null,
            product_section: productDetails.product_section !== undefined ? productDetails.product_section : null,
            item_group_id: productDetails.item_group_id !== undefined ? productDetails.item_group_id : null,
            tax_rate_id: productDetails.tax_rate_id !== undefined ? productDetails.tax_rate_id : null,
            regulatory_code: productDetails.regulatory_code !== undefined ? productDetails.regulatory_code : null,
            regulatory_notes: productDetails.regulatory_notes !== undefined ? productDetails.regulatory_notes : null,
            ...(hasProvidedActiveFlag(productDetails.isActive) ? { isActive: normalizeActiveFlag(productDetails.isActive) } : {}),
            ...auditFields,
        };

        const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${productId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(productPayload)
        });

        if (!prodRes.ok) {
            const errText = await prodRes.text();
            throw new Error(`Directus failed to update raw material: ${prodRes.status} - ${errText}`);
        }

        await syncProductQaSpecifications(Number(productId), purchaseQa);

        // If cascadeToChildren option is selected, sync shared parent metadata only.
        // Child UOM, density, weights, and weight units remain child-specific.
        if (productDetails.cascadeToChildren) {
            try {
                const childrenRes = await fetch(`${DIRECTUS_URL}/items/products?filter[parent_id][_eq]=${productId}&fields=product_id&limit=-1`, { headers });
                if (childrenRes.ok) {
                    const children = (await childrenRes.json()).data || [];
                    const cascadeFields: Record<string, unknown> = {};
                    if (productDetails.product_brand !== undefined) cascadeFields.product_brand = productDetails.product_brand;
                    if (productDetails.product_category !== undefined) cascadeFields.product_category = productDetails.product_category;
                    if (productDetails.product_class !== undefined) cascadeFields.product_class = productDetails.product_class;
                    if (productDetails.product_segment !== undefined) cascadeFields.product_segment = productDetails.product_segment;
                    if (productDetails.product_section !== undefined) cascadeFields.product_section = productDetails.product_section;
                    if (productDetails.item_group_id !== undefined) cascadeFields.item_group_id = productDetails.item_group_id;
                    if (productDetails.tax_rate_id !== undefined) cascadeFields.tax_rate_id = productDetails.tax_rate_id;
                    if (productDetails.regulatory_code !== undefined) cascadeFields.regulatory_code = productDetails.regulatory_code;
                    if (productDetails.regulatory_notes !== undefined) cascadeFields.regulatory_notes = productDetails.regulatory_notes;

                    if (Object.keys(cascadeFields).length > 0) {
                        const cascadePayload = { ...cascadeFields, ...auditFields };
                        for (const child of children) {
                            await fetch(`${DIRECTUS_URL}/items/products/${child.product_id}`, {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify(cascadePayload)
                            }).catch(() => { });
                        }
                    }
                }
            } catch (err) {
                console.error("Error cascading properties to family children:", err);
            }
        }

        // Handle packaging variants (update existing ones if product_id is provided, create new ones if not)
        if (resolvedVariants.length > 0) {
            for (const [variantIndex, { variant, identity }] of resolvedVariants.entries()) {
                    const variantHasActiveFlag = hasProvidedActiveFlag(variant.isActive);
                    const variantActive = normalizeActiveFlag(variant.isActive);
                    const variantWeightPayload = buildWeightPayload(variant, isPackagingMaterial);
                    const variantPayload = {
                        ...withoutPurchaseQa(variant),
                        product_name: identity.productName,
                        description: identity.descriptionKey,
                        short_description: identity.descriptionKey,
                        ...variantWeightPayload,
                        density_factor: normalizedVariantDensities[variantIndex],
                        product_brand: variant.product_brand !== undefined ? variant.product_brand : null,
                        product_category: variant.product_category !== undefined ? variant.product_category : null,
                        product_class: variant.product_class !== undefined ? variant.product_class : null,
                        product_segment: variant.product_segment !== undefined ? variant.product_segment : null,
                        product_section: variant.product_section !== undefined ? variant.product_section : null,
                        item_group_id: variant.item_group_id !== undefined ? variant.item_group_id : null,
                        tax_rate_id: variant.tax_rate_id !== undefined ? variant.tax_rate_id : null,
                        regulatory_code: variant.regulatory_code !== undefined ? variant.regulatory_code : null,
                        regulatory_notes: variant.regulatory_notes !== undefined ? variant.regulatory_notes : null,
                        parent_id: productId,
                        ...(variantHasActiveFlag ? { isActive: variantActive } : {}),
                        status: "Approved",
                        item_type: "regular",
                    };

                    if (variant.product_id) {
                        // Update existing child variant
                        const variantRes = await fetch(`${DIRECTUS_URL}/items/products/${variant.product_id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ ...variantPayload, ...auditFields })
                        });
                        if (!variantRes.ok) {
                            const errText = await variantRes.text();
                            throw new Error(`Directus failed to update packaging variant: ${variantRes.status} - ${errText}`);
                        }
                        await syncProductQaSpecifications(
                            Number(variant.product_id),
                            variant.purchaseQa as PurchaseQaConfig | undefined
                        );
                    } else {
                        // Create new child variant
                        const varRes = await fetch(`${DIRECTUS_URL}/items/products?fields=product_id`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify({
                                ...variantPayload,
                                isActive: variantHasActiveFlag ? variantActive : 1,
                                date_added: await getTodayDateString(),
                                created_by: userId,
                                ...productCreationAuditFields(operationTimestamp)
                            })
                        });

                        if (varRes.ok) {
                            const varJson = await varRes.json();
                            const childId = varJson.data?.product_id;

                            if (!childId) {
                                throw new Error("Directus did not return the created packaging variant ID.");
                            }

                            await syncProductQaSpecifications(
                                Number(childId),
                                variant.purchaseQa as PurchaseQaConfig | undefined
                            );

                        } else {
                            const errText = await varRes.text();
                            throw new Error(`Directus failed to create packaging variant: ${varRes.status} - ${errText}`);
                        }
                    }
            }
        }

        if (parentProductId) {
            await synchronizeFamilySupplierLinks(parentProductId, inheritedSupplierIds || []);
        } else if (normalizedSupplierIds !== undefined) {
            await synchronizeFamilySupplierLinks(supplierSyncRootProductId, normalizedSupplierIds);
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        if (e instanceof RawMaterialClassificationError) {
            return NextResponse.json(
                { error: e.message, code: e.code, ...e.details },
                { status: e.status }
            );
        }
        if (e instanceof ProductIdentityError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        if (e instanceof ProductWeightValidationError) {
            return NextResponse.json({ error: weightValidationMessage(e) }, { status: e.status });
        }
        if (e instanceof RawMaterialQaError) {
            return NextResponse.json({ error: e.message }, { status: e.status });
        }
        console.error("API Error updating raw material:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update raw material" }, { status: 500 });
    }
}



