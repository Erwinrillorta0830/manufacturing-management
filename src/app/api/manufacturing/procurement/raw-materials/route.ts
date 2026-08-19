/* eslint-disable */
import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../_directus";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { getManilaTimeString, getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
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
    resolveProductWeightBreakdown
} from "@/modules/manufacturing-management/procurement/packaging-weight";
import type { PurchaseQaConfig } from "@/modules/manufacturing-management/procurement/raw-materials/types/raw-materials.types";

function isPositiveNumber(value: unknown): boolean {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return false;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0;
}

function hasProvidedValue(value: unknown): boolean {
    return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
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
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "purchaseQa"));
}

function hasWeightComponentValue(value: Record<string, unknown>): boolean {
    return [value.net_weight, value.outer_carton_weight, value.pallet_weight]
        .some(hasProvidedValue);
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
        { name: "unit_of_measurement_count", label: "UOM ratio is required and must be greater than 0." },
        { name: "density_factor", label: "Density is required and must be greater than 0." }
    ];

    for (const field of fields) {
        const isPresent = Object.prototype.hasOwnProperty.call(productDetails, field.name);
        if ((requireAll || isPresent) && !isPositiveNumber(productDetails[field.name])) {
            return field.label;
        }
    }

    const isPackagingMaterial = Number(productDetails.product_type) === 390;
    const hasWeight = hasProvidedValue(productDetails.weight);
    const hasWeightUnit = hasProvidedValue(productDetails.weight_unit_id);
    const hasWeightComponents = hasWeightComponentValue(productDetails);

    if (isPackagingMaterial) {
        try {
            resolveProductWeightBreakdown(productDetails, { requireComplete: true });
        } catch (error) {
            return weightValidationMessage(error);
        }
    } else if (hasWeightComponents) {
        try {
            resolveProductWeightBreakdown(productDetails, { requireComplete: true });
        } catch (error) {
            return weightValidationMessage(error);
        }
    } else if (hasWeight || hasWeightUnit) {
        if (!hasWeight || !hasWeightUnit) {
            return "Gross weight and weight unit must be provided together when supplied.";
        }
        if (!isPositiveNumber(productDetails.weight)) {
            return "Gross weight must be greater than 0 when supplied.";
        }
        if (!isPositiveNumber(productDetails.weight_unit_id)) {
            return "Weight unit must be valid when supplied.";
        }
    }

    return null;
}

function validatePackagingVariants(packagingVariants: unknown, requireWeightComponents: boolean): string | null {
    if (!Array.isArray(packagingVariants) || packagingVariants.length === 0) return null;

    const hasInvalidVariant = packagingVariants.some((variant) => {
        if (!variant || typeof variant !== "object") return true;
        const item = variant as Record<string, unknown>;
        const invalidMeasurements = !isPositiveNumber(item.unit_of_measurement) ||
            !isPositiveNumber(item.unit_of_measurement_count) ||
            !isPositiveNumber(item.density_factor);
        if (invalidMeasurements) return true;

        try {
            resolveProductWeightBreakdown(item, { requireComplete: requireWeightComponents });
            return requireWeightComponents && !isPositiveNumber(item.weight_unit_id);
        } catch {
            return true;
        }
    });

    return hasInvalidVariant
        ? requireWeightComponents
            ? "Packaging variants require valid UOM, conversion count, density, net weight, outer carton weight, pallet weight, and weight unit values."
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


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("productId");

        if (!productId) {
            return NextResponse.json({ error: "productId is required" }, { status: 400 });
        }

        const res = await fetch(`${DIRECTUS_URL}/items/product_per_supplier?filter[product_id][_eq]=${productId}&fields=supplier_id&limit=-1`, { headers, cache: "no-store" });
        if (!res.ok) {
            throw new Error(`Directus failed to fetch suppliers for product: ${res.status}`);
        }
        const json = await res.json();
        const links = json.data || [];
        const supplierIds = links.map((l: { supplier_id: number }) => l.supplier_id);
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

        const isPackagingMaterial = Number(productDetails.product_type) === 390;
        const variantsError = validatePackagingVariants(classifiedVariants, isPackagingMaterial);
        if (variantsError) {
            return NextResponse.json({ error: variantsError }, { status: 400 });
        }

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

        // Create Raw Material / Packaging Product with explicit null overrides for foreign keys to bypass invalid database defaults
        const productPayload = {
            ...withoutPurchaseQa(productDetails),
            ...weightPayload,
            weight_unit_id: verifiedWeightUnitId,
            barcode: normalizedProductBarcode,
            maintaining_quantity: normalizedSafetyStock,
            product_image: normalizedProductImage,
            product_brand: productDetails.product_brand !== undefined ? productDetails.product_brand : null,
            product_category: productDetails.product_category !== undefined ? productDetails.product_category : null,
            product_class: productDetails.product_class !== undefined ? productDetails.product_class : null,
            product_segment: productDetails.product_segment !== undefined ? productDetails.product_segment : null,
            product_section: productDetails.product_section !== undefined ? productDetails.product_section : null,
            isActive: normalizeActiveFlag(productDetails.isActive),
            status: "Approved",
            item_type: "regular", // Must be regular due to DB enum constraint
            date_added: productDetails.date_added || todayStr,
            created_by: userId ? Number(userId) : null
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

        // Link selected suppliers in product_per_supplier junction table
        if (supplierIds && Array.isArray(supplierIds) && supplierIds.length > 0) {
            try {
                for (const supId of supplierIds) {
                    await fetch(`${DIRECTUS_URL}/items/product_per_supplier`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            product_id: productId,
                            supplier_id: Number(supId)
                        })
                    });
                }
            } catch (err) {
                console.error("Error linking suppliers to raw material:", err);
            }
        }

        // Create child packaging variants if passed
        if (resolvedVariants.length > 0) {
            for (const { variant, identity } of resolvedVariants) {
                    const variantWeightPayload = buildWeightPayload(variant, isPackagingMaterial);
                    const variantPayload = {
                        ...withoutPurchaseQa(variant),
                        product_name: identity.productName,
                        description: identity.descriptionKey,
                        short_description: identity.descriptionKey,
                        ...variantWeightPayload,
                        product_brand: variant.product_brand !== undefined ? variant.product_brand : null,
                        product_category: variant.product_category !== undefined ? variant.product_category : null,
                        product_class: variant.product_class !== undefined ? variant.product_class : null,
                        product_segment: variant.product_segment !== undefined ? variant.product_segment : null,
                        product_section: variant.product_section !== undefined ? variant.product_section : null,
                        parent_id: productId,
                        isActive: normalizeActiveFlag(variant.isActive),
                        status: "Approved",
                        item_type: "regular",
                        date_added: todayStr,
                        created_by: userId ? Number(userId) : null
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

                        // Link child to the same suppliers
                        if (supplierIds && Array.isArray(supplierIds) && supplierIds.length > 0) {
                            for (const supId of supplierIds) {
                                await fetch(`${DIRECTUS_URL}/items/product_per_supplier`, {
                                    method: "POST",
                                    headers,
                                    body: JSON.stringify({
                                        product_id: childId,
                                        supplier_id: Number(supId)
                                    })
                                }).catch(() => { });
                            }
                        }
                    } else {
                        const errText = await varRes.text();
                        throw new Error(`Directus failed to create packaging variant: ${varRes.status} - ${errText}`);
                    }
            }
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
            `${DIRECTUS_URL}/items/products/${numericProductId}?fields=product_type,weight,product_weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id`,
            { headers, cache: "no-store" }
        );
        if (!currentProductResponse.ok) {
            throw new RawMaterialQaError(503, "Unable to load the current product weight specification.");
        }
        const currentProduct = (await currentProductResponse.json()).data as Record<string, unknown>;
        const effectiveWeightDetails = { ...currentProduct, ...productDetails };

        const measurementError = validateMeasurementFields(effectiveWeightDetails, false);
        if (measurementError) {
            return NextResponse.json({ error: measurementError }, { status: 400 });
        }

        const isPackagingMaterial = Number(effectiveWeightDetails.product_type) === 390;
        const variantsError = validatePackagingVariants(classifiedVariants, isPackagingMaterial);
        if (variantsError) {
            return NextResponse.json({ error: variantsError }, { status: 400 });
        }

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
        const updatedAt = await getManilaTimeString();
        const auditFields = {
            updated_by: userId,
            updated_at: updatedAt
        };

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
            ...(hasWeightUnitField ? { weight_unit_id: verifiedWeightUnitId ?? null } : {}),
            ...(hasBarcodeField ? { barcode: normalizedProductBarcode } : {}),
            ...(hasSafetyStockField ? { maintaining_quantity: normalizedSafetyStock } : {}),
            ...(hasProductImageField ? { product_image: normalizedProductImage } : {}),
            product_brand: productDetails.product_brand !== undefined ? productDetails.product_brand : null,
            product_category: productDetails.product_category !== undefined ? productDetails.product_category : null,
            product_class: productDetails.product_class !== undefined ? productDetails.product_class : null,
            product_segment: productDetails.product_segment !== undefined ? productDetails.product_segment : null,
            product_section: productDetails.product_section !== undefined ? productDetails.product_section : null,
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

        // If cascadeToChildren option is selected, sync category, brand, and density down to existing family children
        if (productDetails.cascadeToChildren) {
            try {
                const childrenRes = await fetch(`${DIRECTUS_URL}/items/products?filter[parent_id][_eq]=${productId}&fields=product_id&limit=-1`, { headers });
                if (childrenRes.ok) {
                    const children = (await childrenRes.json()).data || [];
                    const cascadeFields: Record<string, unknown> = {};
                    if (productDetails.product_brand !== undefined) cascadeFields.product_brand = productDetails.product_brand;
                    if (productDetails.product_category !== undefined) cascadeFields.product_category = productDetails.product_category;
                    if (productDetails.density_factor !== undefined) cascadeFields.density_factor = productDetails.density_factor;

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
            for (const { variant, identity } of resolvedVariants) {
                    const variantHasActiveFlag = hasProvidedActiveFlag(variant.isActive);
                    const variantActive = normalizeActiveFlag(variant.isActive);
                    const variantWeightPayload = buildWeightPayload(variant, isPackagingMaterial);
                    const variantPayload = {
                        ...withoutPurchaseQa(variant),
                        product_name: identity.productName,
                        description: identity.descriptionKey,
                        short_description: identity.descriptionKey,
                        ...variantWeightPayload,
                        product_brand: variant.product_brand !== undefined ? variant.product_brand : (productDetails.product_brand !== undefined ? productDetails.product_brand : null),
                        product_category: variant.product_category !== undefined ? variant.product_category : (productDetails.product_category !== undefined ? productDetails.product_category : null),
                        product_class: variant.product_class !== undefined ? variant.product_class : null,
                        product_segment: variant.product_segment !== undefined ? variant.product_segment : null,
                        product_section: variant.product_section !== undefined ? variant.product_section : null,
                        parent_id: productId,
                        ...(variantHasActiveFlag ? { isActive: variantActive } : {}),
                        status: "Approved",
                        item_type: "regular",
                        ...auditFields,
                    };

                    if (variant.product_id) {
                        // Update existing child variant
                        const variantRes = await fetch(`${DIRECTUS_URL}/items/products/${variant.product_id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify(variantPayload)
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
                                created_at: updatedAt
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

                            // Link child to the same suppliers
                            if (supplierIds && Array.isArray(supplierIds) && supplierIds.length > 0) {
                                for (const supId of supplierIds) {
                                    await fetch(`${DIRECTUS_URL}/items/product_per_supplier`, {
                                        method: "POST",
                                        headers,
                                        body: JSON.stringify({
                                            product_id: childId,
                                            supplier_id: Number(supId)
                                        })
                                    }).catch(() => { });
                                }
                            }
                        } else {
                            const errText = await varRes.text();
                            throw new Error(`Directus failed to create packaging variant: ${varRes.status} - ${errText}`);
                        }
                    }
            }
        }

        // Update supplier links: delete old ones first, then create new ones for parent and all children
        if (supplierIds && Array.isArray(supplierIds)) {
            // 1. Get all child products of this parent
            const childrenRes = await fetch(`${DIRECTUS_URL}/items/products?filter[parent_id][_eq]=${productId}&fields=product_id&limit=-1`, { headers });
            const children = childrenRes.ok ? (await childrenRes.json()).data || [] : [];
            const allProductIdsToSync = [Number(productId), ...children.map((c: any) => Number(c.product_id))];

            // 2. Delete old links
            for (const pid of allProductIdsToSync) {
                const oldLinksRes = await fetch(`${DIRECTUS_URL}/items/product_per_supplier?filter[product_id][_eq]=${pid}&limit=-1`, { headers });
                if (oldLinksRes.ok) {
                    const oldLinks = (await oldLinksRes.json()).data || [];
                    for (const link of oldLinks) {
                        await fetch(`${DIRECTUS_URL}/items/product_per_supplier/${link.id}`, { method: "DELETE", headers }).catch(() => { });
                    }
                }
            }

            // 3. Create new links
            for (const pid of allProductIdsToSync) {
                for (const supId of supplierIds) {
                    await fetch(`${DIRECTUS_URL}/items/product_per_supplier`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            product_id: pid,
                            supplier_id: Number(supId)
                        })
                    }).catch(() => { });
                }
            }
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



