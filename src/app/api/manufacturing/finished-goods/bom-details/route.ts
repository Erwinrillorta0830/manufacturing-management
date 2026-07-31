import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    getBOMDetailsForVersion,
    saveActiveBOMDetails,
    syncRoutesAndBOM,
    BOMValidationError,
    validateRoutesAndBOM
} from "./bom-details-helper";
import {
    updateProductDetails,
    verifyProductDetails,
    calculateRollupCost,
    updateProductStandardCost,
    syncProductOverheads
} from "../products/products-helper";
import {
    ProductRequiredFieldsError,
    validateProductEditDetails
} from "@/modules/manufacturing-management/finished-goods/product-validation";
import {
    ProductIdentityError,
    ensureProductIdentityAvailable,
    ensureProductSkuAvailable,
    resolveProductIdentity
} from "../products/product-identity";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productIdStr = searchParams.get("productId");
        const versionIdStr = searchParams.get("versionId");

        if (!productIdStr || !versionIdStr) {
            return NextResponse.json({ error: "Missing productId or versionId" }, { status: 400 });
        }

        const productId = parseInt(productIdStr);
        const versionId = parseInt(versionIdStr);

        const versionRes = await fetch(
            `${DIRECTUS_URL}/items/product_manufacturing_version/${versionId}?fields=version_id,product_id`,
            { headers, cache: "no-store" }
        );
        if (!versionRes.ok) return NextResponse.json(null);
        const versionData = (await versionRes.json()).data as { product_id?: unknown } | undefined;
        if (!versionData || Number(versionData.product_id) !== productId) return NextResponse.json(null);

        const details = await getBOMDetailsForVersion(productId, versionId);
        if (!details || !details.version) {
            return NextResponse.json(null);
        }

        return NextResponse.json(details.version);
    } catch (e) {
        console.error("API Error fetching BOM details:", e);
        const error = e instanceof Error ? e : new Error(String(e));
        return NextResponse.json({ error: (error as { message?: string }).message || "Failed to fetch BOM details" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { productId, versionId, details, routes = [], overheads } = body;

        if (!productId || !versionId) {
            return NextResponse.json({ error: "Missing productId or versionId" }, { status: 400 });
        }

        const numericProductId = parseInt(productId);
        const numericVersionId = parseInt(versionId);

        const versionRes = await fetch(
            `${DIRECTUS_URL}/items/product_manufacturing_version/${numericVersionId}?fields=version_id,product_id`,
            { headers, cache: "no-store" }
        );
        if (!versionRes.ok) {
            return NextResponse.json({ error: "Selected version was not found." }, { status: 404 });
        }
        const versionData = (await versionRes.json()).data as { product_id?: unknown } | undefined;
        if (!versionData || Number(versionData.product_id) !== numericProductId) {
            return NextResponse.json(
                { error: "Selected version does not belong to this finished good." },
                { status: 400 }
            );
        }

        await validateRoutesAndBOM(routes);

        const validatedDetails = validateProductEditDetails(details);
        const expectedYield = validatedDetails.expectedYield;
        const baseQuantity = Number(details.base_quantity ?? 1);
        const customOverhead = Number(details.custom_overhead ?? details.customOverhead ?? 0);

        if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) {
            return NextResponse.json({ error: "Base quantity must be greater than 0." }, { status: 400 });
        }
        if (!Number.isFinite(customOverhead) || customOverhead < 0) {
            return NextResponse.json({ error: "Custom overhead must be 0 or greater." }, { status: 400 });
        }

        const productCode = await ensureProductSkuAvailable(validatedDetails.sku, numericProductId);

        const identity = await resolveProductIdentity({
            productId: numericProductId,
            productName: validatedDetails.title,
            parentId: details.parent_id,
            unitId: validatedDetails.unitOfMeasurement
        });
        await ensureProductIdentityAvailable(identity.descriptionKey, numericProductId);

        // 1. Update Product Details
        const prodOk = await updateProductDetails(numericProductId, {
            product_name: identity.productName,
            product_code: productCode,
            barcode: details.barcode,
            price_per_unit: details.targetSellingPrice,
            density_factor: validatedDetails.densityFactor,
            product_brand: validatedDetails.productBrand,
            product_category: validatedDetails.productCategory,
            description: identity.descriptionKey,
            short_description: typeof details.shortDescription === "string"
                ? details.shortDescription.trim() || null
                : typeof details.description === "string"
                    ? details.description.trim() || null
                    : null,
            cost_per_unit: details.costPerUnit,
            unit_of_measurement_count: validatedDetails.unitOfMeasurementCount,
            product_class: details.productClass,
            product_segment: details.productSegment,
            product_section: details.productSection,
            product_shelf_life: validatedDetails.productShelfLife,
            product_image: details.productImage,

            unit_of_measurement: identity.unitId,
            parent_id: identity.parentId
        });
        if (!prodOk.ok) {
            if (prodOk.status === 409 || /sku|product_code|unique/i.test(prodOk.error || "")) {
                throw new ProductIdentityError(
                    "A product with this SKU already exists. Please choose a unique SKU.",
                    409,
                    "PRODUCT_SKU_CONFLICT"
                );
            }
            throw new Error("Failed to update product details in Directus");
        }

        const productVerification = await verifyProductDetails(numericProductId, {
            productName: identity.productName,
            productCode,
            parentId: identity.parentId,
            productBrand: validatedDetails.productBrand,
            productCategory: validatedDetails.productCategory,
            unitOfMeasurement: identity.unitId,
            unitOfMeasurementCount: validatedDetails.unitOfMeasurementCount,
            densityFactor: validatedDetails.densityFactor,
            productShelfLife: validatedDetails.productShelfLife,

        });
        if (!productVerification.ok) {
            throw new Error(productVerification.error || "Product update could not be verified.");
        }

        // 2. Save version metadata (expected yield and base quantity)
        const versionResult = await saveActiveBOMDetails(
            numericVersionId,
            expectedYield,
            baseQuantity,
            customOverhead
        );
        if (!versionResult.ok) {
            throw new Error(versionResult.error || "Failed to update version metadata in Directus");
        }

        // Get logged in user ID from secure access token cookie
        let userId: number | null = null;
        try {
            const cookieStore = await cookies();
            const token = cookieStore.get("vos_access_token")?.value;
            if (token) {
                const parts = token.split(".");
                if (parts.length >= 2) {
                    const base64Url = parts[1];
                    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                    while (base64.length % 4) base64 += "=";
                    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                    const payload = JSON.parse(jsonPayload);
                    userId = payload?.id || payload?.user_id || payload?.sub || null;
                }
            }
        } catch (err) {
            console.error("Error parsing user token in POST bom-details route:", err);
        }

        // 3. Sync routes and their route-level BOM items
        const syncOk = await syncRoutesAndBOM(numericVersionId, routes, userId ? Number(userId) : null);
        if (!syncOk) throw new Error("Failed to sync routes and route-level BOM items in Directus");

        if (Array.isArray(overheads)) {
            const overheadOk = await syncProductOverheads(numericProductId, numericVersionId, overheads);
            if (!overheadOk) throw new Error("Failed to sync product overheads in Directus");
        }

        // 4. Run standard rollup costing recalculation and save to product standard cost field
        const rollupResult = await calculateRollupCost(numericProductId, new Set(), undefined, 58, undefined, numericVersionId);
        if (rollupResult.bomId && rollupResult.costTree.length > 0) {
            const standardCostUpdated = await updateProductStandardCost(numericProductId, rollupResult.unitCost);
            if (!standardCostUpdated) {
                throw new Error("Failed to update product standard cost in Directus.");
            }
        }

        return NextResponse.json({
            success: true,
            rollup: rollupResult
        });
    } catch (e) {
        console.error("API Error saving BOM details:", e);
        if (e instanceof BOMValidationError) {
            return NextResponse.json(
                { error: e.message, code: e.code, details: e.details },
                { status: 400 }
            );
        }
        if (e instanceof ProductRequiredFieldsError) {
            return NextResponse.json(
                { error: e.message, code: e.code, fields: e.fields },
                { status: e.status }
            );
        }
        if (e instanceof ProductIdentityError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const error = e instanceof Error ? e : new Error(String(e));
        return NextResponse.json({ error: (error as { message?: string }).message || "Failed to save BOM details" }, { status: 500 });
    }
}
