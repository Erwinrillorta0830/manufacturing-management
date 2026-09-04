import { NextResponse } from "next/server";
import { DIRECTUS_URL, formatPhtDateTime, headers } from "@/app/api/manufacturing/directus-api";
import { productCreationAuditFields, productUpdateAuditFields } from "@/app/api/manufacturing/product-audit";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
import { calculateRollupCost } from "./products-helper";
import {
    ProductIdentityError,
    ensureProductIdentityAvailable,
    ensureProductSkuAvailable,
    resolveProductIdentity
} from "./product-identity";
import {
    ProductRequiredFieldsError,
    validateProductRegistration
} from "@/modules/manufacturing-management/finished-goods/product-validation";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { fetchAllWeightUnits } from "../weight-units/weight-units-helper";
import { fetchPurchaseOrderPriceTypeRules } from "@/app/api/manufacturing/purchase-orders/_price-type";
import {
    PACKAGING_MATERIAL_PRODUCT_TYPE,
    RAW_MATERIAL_PRODUCT_TYPE,
    enforceClassificationIntegrity,
    RawMaterialClassificationError
} from "@/app/api/manufacturing/procurement/raw-materials/_classification-integrity";

interface DirectusProductCurrencyProfile {
    id: number;
    product_id: number;
    is_foreign_sourced: boolean;
    purchase_currency: "PHP" | "USD";
    purchase_price: number | null;
}

interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    description: string;
    short_description?: string | null;
    unit_of_measurement: { unit_id: number; unit_name: string; unit_shortcut: string } | null;
    cost_per_unit: number;
    price_per_unit: number;
    barcode?: string | null;
    product_image?: string | null;
    maintaining_quantity?: number | null;
    parent_id?: number | null;
    density_factor?: number | null;
    weight?: number | null;
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    weight_unit_id?: number | { id?: number; code?: string; name?: string } | null;
    has_versions?: boolean;
    currency_profile?: DirectusProductCurrencyProfile | null;
    has_cogs?: boolean;
    product_type?: number | string | { id?: number | string; name?: string; type_name?: string } | null;
    product_type_name?: string | null;
    product_brand?: number | { brand_id?: number; id?: number } | null;
    product_category?: number | { category_id?: number; id?: number; category_name?: string } | null;
    product_class?: number | { class_id?: number; id?: number } | null;
    product_segment?: number | { segment_id?: number; id?: number } | null;
    product_section?: number | { section_id?: number; id?: number } | null;
    item_group_id?: number | { item_group_id?: number; id?: number; group_code?: string; group_name?: string } | null;
    tax_rate_id?: number | { TaxID?: number; tax_id?: number; id?: number; VATRate?: number | string; WithholdingRate?: number | string } | null;
    regulatory_code?: string | null;
    regulatory_notes?: string | null;
    created_at?: string | null;
    created_by?: number | string | null;
    updated_at?: string | null;
    updated_by?: number | string | null;
    price_control?: { priceTypeId: number; priceTypeName: string } | null;
}

const DEFAULT_PRODUCT_TYPE_NAMES = new Map<number, string>([
    [388, "Finished Goods"],
    [389, "Raw Materials"],
    [390, "Packaging Items"]
]);

async function fetchProductTypeNames(): Promise<Map<number, string>> {
    const urls = [
        `${DIRECTUS_URL}/items/product_type?limit=-1&sort=id&fields=id,name,type_name`,
        `${DIRECTUS_URL}/items/product_type?limit=-1&sort=id&fields=id,name`
    ];

    for (const url of urls) {
        try {
            const response = await fetch(url, { headers, cache: "no-store" });
            if (!response.ok) continue;

            const json = await response.json();
            const names = new Map(DEFAULT_PRODUCT_TYPE_NAMES);
            for (const row of (json.data || []) as Array<{ id?: number | string; name?: string | null; type_name?: string | null }>) {
                const id = Number(row.id);
                const name = String(row.name || row.type_name || "").trim();
                if (Number.isFinite(id) && name) names.set(id, name);
            }
            return names;
        } catch (error) {
            console.warn("Unable to load product-type names for product catalog:", error);
        }
    }

    return new Map(DEFAULT_PRODUCT_TYPE_NAMES);
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";
        const limit = parseInt(searchParams.get("limit") || "-1");
        const excludeRollup = searchParams.get("excludeRollup") === "true";
        const rawMaterialsScope = searchParams.get("productScope") === "raw-materials";
        const isActive = searchParams.get("isActive");
        const productScopeFilter = rawMaterialsScope ? "&filter[product_type][_in]=389,390" : "";
        const statusFilter = isActive ? `&filter[isActive][_eq]=${encodeURIComponent(isActive)}` : "";

        const explicitFields = "product_id,product_name,product_code,description,short_description,status,isActive,cost_per_unit,price_per_unit,product_brand,barcode,parent_id,parent_id.product_id,parent_id.product_name,product_category.category_id,product_category.category_name,product_class,product_segment,product_section,product_shelf_life,product_image,maintaining_quantity,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,unit_of_measurement_count,density_factor,weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id,product_type,item_group_id.item_group_id,item_group_id.group_code,item_group_id.group_name,tax_rate_id.TaxID,tax_rate_id.VATRate,tax_rate_id.WithholdingRate,regulatory_code,regulatory_notes,created_at,created_by,updated_at,updated_by";
        const legacyFields = "product_id,product_name,product_code,description,short_description,status,isActive,cost_per_unit,price_per_unit,product_brand,barcode,parent_id,parent_id.product_id,parent_id.product_name,product_category.category_id,product_category.category_name,product_class,product_segment,product_section,product_shelf_life,product_image,maintaining_quantity,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,unit_of_measurement_count,density_factor,weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id,product_type,created_at,created_by,updated_at,updated_by";
        let url = `${DIRECTUS_URL}/items/products?limit=${limit}&sort=-product_id&fields=${explicitFields}${productScopeFilter}${statusFilter}`;
        if (search && search.trim()) {
            url += `&search=${encodeURIComponent(search.trim())}`;
        }

        const fetchProducts = async () => {
            const response = await fetch(url, { headers, cache: "no-store" });
            if (response.ok) return response;
            const legacyUrl = `${DIRECTUS_URL}/items/products?limit=${limit}&sort=-product_id&fields=${legacyFields}${productScopeFilter}${statusFilter}${search && search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`;
            console.warn("Product shared-attribute fields are not available; using the legacy product projection.");
            return fetch(legacyUrl, { headers, cache: "no-store" });
        };

        const [prodResult, versionsResult, profilesResult, weightUnitsResult, productTypeNamesResult] = await Promise.allSettled([
            fetchProducts(),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=version_id,product_id,version_name,status,base_quantity,expected_yield_percentage`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/product_currency_profiles?limit=-1`, { headers, cache: "no-store" }),
            fetchAllWeightUnits(),
            fetchProductTypeNames()
        ]);

        if (prodResult.status === "rejected") throw prodResult.reason;
        const prodRes = prodResult.value;
        if (!prodRes.ok) throw new Error(`Directus failed to fetch products: ${prodRes.status}`);
        const prodJson = await prodRes.json();
        const products: DirectusProduct[] = prodJson.data || [];
        const catalogProducts = rawMaterialsScope
            ? products.filter(product => {
                const typeId = typeof product.product_type === "object" && product.product_type !== null
                    ? Number(product.product_type.id)
                    : Number(product.product_type);
                return typeId === 389 || typeId === 390;
            })
            : products;

        const versionProductIds = new Set<number>();
        if (versionsResult.status === "fulfilled" && versionsResult.value.ok) {
            try {
                const versionsJson = await versionsResult.value.json();
                const versions = versionsJson.data || [];
                versions.forEach((v: { product_id: number }) => {
                    if (v.product_id) {
                        versionProductIds.add(Number(v.product_id));
                    }
                });
            } catch (err) {
                console.error("API Error parsing product version metadata:", err);
            }
        }

        let profiles: DirectusProductCurrencyProfile[] = [];
        if (profilesResult.status === "fulfilled" && profilesResult.value.ok) {
            try {
                profiles = (await profilesResult.value.json()).data || [];
            } catch (err) {
                console.error("API Error parsing product currency profiles:", err);
            }
        }
        const profilesMap = new Map<number, DirectusProductCurrencyProfile>();
        profiles.forEach((p: DirectusProductCurrencyProfile) => {
            profilesMap.set(Number(p.product_id), p);
        });

        const weightUnitsData = weightUnitsResult.status === "fulfilled" ? weightUnitsResult.value : [];
        const weightUnitsMap = new Map((weightUnitsData || []).map(w => [w.id, w]));
        const productTypeNames = productTypeNamesResult.status === "fulfilled"
            ? productTypeNamesResult.value
            : new Map(DEFAULT_PRODUCT_TYPE_NAMES);

        let priceTypeRules: Awaited<ReturnType<typeof fetchPurchaseOrderPriceTypeRules>> = [];
        try {
            priceTypeRules = await fetchPurchaseOrderPriceTypeRules();
        } catch (error) {
            console.error("API Error parsing product price-control mappings:", error);
        }
        const priceTypeByProductType = new Map(priceTypeRules.map(rule => [rule.productTypeId, rule]));

        // Create product lookup map
        const productsMap = new Map<number, DirectusProduct>();
        products.forEach((p) => {
            p.has_versions = versionProductIds.has(Number(p.product_id));
            p.currency_profile = profilesMap.get(Number(p.product_id)) || null;
            if (p.weight_unit_id && typeof p.weight_unit_id !== "object") {
                const matched = weightUnitsMap.get(Number(p.weight_unit_id));
                if (matched) (p as DirectusProduct & Record<string, unknown>).weight_unit_id = { id: matched.id, code: matched.code, name: matched.name };
            }
            productsMap.set(Number(p.product_id), p);
        });

        // Compute resolved products
        const resolvedProducts = await Promise.all(catalogProducts.map(async (p: DirectusProduct) => {
            const productCopy = { ...p };
            productCopy.has_versions = versionProductIds.has(Number(p.product_id));
            productCopy.currency_profile = profilesMap.get(Number(p.product_id)) || null;
            if (productCopy.weight_unit_id && typeof productCopy.weight_unit_id !== "object") {
                const matched = weightUnitsMap.get(Number(productCopy.weight_unit_id));
                if (matched) (productCopy as DirectusProduct & Record<string, unknown>).weight_unit_id = { id: matched.id, code: matched.code, name: matched.name };
            }
            const productTypeId = typeof productCopy.product_type === "object" && productCopy.product_type !== null
                ? Number(productCopy.product_type.id)
                : Number(productCopy.product_type);
            const directusProductTypeName = typeof productCopy.product_type === "object" && productCopy.product_type !== null
                ? productCopy.product_type.name || productCopy.product_type.type_name
                : productCopy.product_type_name;
            const priceType = priceTypeByProductType.get(productTypeId);
            productCopy.product_type = Number.isFinite(productTypeId) ? productTypeId : null;
            productCopy.product_type_name = typeof directusProductTypeName === "string" && directusProductTypeName.trim()
                ? directusProductTypeName.trim()
                : productTypeNames.get(productTypeId) || null;
            productCopy.price_control = priceType?.priceTypeId && priceType.priceTypeName
                ? { priceTypeId: priceType.priceTypeId, priceTypeName: priceType.priceTypeName }
                : null;

            if (excludeRollup) {
                productCopy.has_cogs = false;
                return productCopy;
            }

            // Skip calculateRollupCost if the product has no versions
            if (!productCopy.has_versions) {
                productCopy.has_cogs = false;
                return productCopy;
            }

            try {
                // Get rolled up cost (COGS) using current active version routes & route-level BOM
                const costRollup = await calculateRollupCost(p.product_id, new Set(), productsMap, 58.00, profilesMap);
                if (costRollup && costRollup.bomId !== null && costRollup.costTree.length > 0) {
                    productCopy.cost_per_unit = costRollup.unitCost;
                    productCopy.has_cogs = true;
                } else {
                    // Keep the persisted product cost when no rollup exists yet.
                    // The value is still marked as non-COGS so callers can
                    // distinguish it from a calculated active-version cost.
                    productCopy.has_cogs = false;
                }
            } catch (err) {
                console.error(`Error calculating dynamic rollup cost for product ${p.product_id}:`, err);
                productCopy.has_cogs = false;
            }
            return productCopy;
        }));

        resolvedProducts.sort((a: DirectusProduct, b: DirectusProduct) => {
            if (a.has_versions && !b.has_versions) return -1;
            if (!a.has_versions && b.has_versions) return 1;
            return a.product_name.localeCompare(b.product_name);
        });

        return NextResponse.json(resolvedProducts);
    } catch (e) {
        console.error("API Error fetching products:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch products" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const todayStr = await getTodayDateString();
        const createdAt = formatPhtDateTime();
        const body = await request.json();
        const { productDetails, versionName, supplierIds, expectedYield } = body || {};

        const validatedDetails = validateProductRegistration({ productDetails, versionName, expectedYield });

        const identity = await resolveProductIdentity({
            productName: validatedDetails.productName,
            parentId: productDetails.parent_id,
            unitId: validatedDetails.unitOfMeasurement
        });

        const productCode = await ensureProductSkuAvailable(
            validatedDetails.productCode
        );

        await ensureProductIdentityAvailable(identity);

        const userId = await getUserIdFromToken();

        // 1. Create Product
        const productFields = { ...productDetails };
        const description = productFields.description;
        const short_description = productFields.short_description;
        delete productFields.description;
        delete productFields.short_description;
        delete productFields.product_name;
        delete productFields.parent_id;
        delete productFields.unit_of_measurement;
        delete productFields.created_at;
        delete productFields.created_by;
        delete productFields.updated_at;
        delete productFields.updated_by;
        const productPayload = {
            ...productFields,
            product_code: productCode,
            product_name: identity.productName,
            parent_id: identity.parentId,
            unit_of_measurement: identity.unitId,
            density_factor: validatedDetails.densityFactor,
            unit_of_measurement_count: validatedDetails.unitOfMeasurementCount,
            product_brand: validatedDetails.productBrand,
            product_category: validatedDetails.productCategory,
            product_shelf_life: validatedDetails.productShelfLife,

            description: identity.descriptionKey,
            short_description: typeof short_description === "string" ? short_description.trim() || null : description?.trim() || null,
            product_class: productDetails.product_class !== undefined ? productDetails.product_class : null,
            product_segment: productDetails.product_segment !== undefined ? productDetails.product_segment : null,
            product_section: productDetails.product_section !== undefined ? productDetails.product_section : null,
            isActive: 1,
            status: "Active",
            item_type: "regular",
            product_type: 388,
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
            if (prodRes.status === 409 || /duplicate|unique constraint|unique key/i.test(errText)) {
                return NextResponse.json({
                    error: "A product with this Product Name and Unit of Measurement already exists.",
                    code: "PRODUCT_PARENT_UOM_CONFLICT"
                }, { status: 409 });
            }
            throw new Error(`Directus failed to create product: ${prodRes.status} - ${errText}`);
        }
        const prodJson = await prodRes.json();
        const productId = prodJson.data?.product_id;

        // 2. Create Product Version (Draft status by default)
        const versionPayload = {
            product_id: productId,
            version_name: validatedDetails.versionName,
            base_quantity: 1.0,
            uom_id: validatedDetails.unitOfMeasurement,
            expected_yield_percentage: validatedDetails.expectedYield,
            status: "Draft",
            is_primary: 0,
            valid_from: todayStr,
            created_by: userId ? Number(userId) : null,
            updated_by: userId ? Number(userId) : null
        };



        const verRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version`, {
            method: "POST",
            headers,
            body: JSON.stringify(versionPayload)
        });
        if (!verRes.ok) {
            // Rollback product
            await fetch(`${DIRECTUS_URL}/items/products/${productId}`, { method: "DELETE", headers }).catch(() => { });
            throw new Error(`Directus failed to create product version: ${verRes.status}`);
        }
        const verJson = await verRes.json();
        const createdVersion = verJson.data;

        // 3. Link selected suppliers in product_per_supplier junction table
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
                console.error("Error linking suppliers to product:", err);
            }
        }

        return NextResponse.json({ success: true, productId, version: createdVersion });
    } catch (e) {
        console.error("API Error registering product:", e);
        if (e instanceof ProductRequiredFieldsError) {
            return NextResponse.json(
                { error: e.message, code: e.code, fields: e.fields },
                { status: e.status }
            );
        }
        if (e instanceof ProductIdentityError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to register product" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { product_id } = body;
        if (!product_id) {
            return NextResponse.json({ error: "Missing product_id" }, { status: 400 });
        }

        const hierarchyFields = ["parent_id", "unit_of_measurement", "product_type"];
        if (hierarchyFields.some(field => Object.prototype.hasOwnProperty.call(body, field))) {
            const currentProductResponse = await fetch(
                `${DIRECTUS_URL}/items/products/${product_id}?fields=product_id,product_type,parent_id,unit_of_measurement.unit_id,isActive`,
                { headers, cache: "no-store" }
            );
            if (!currentProductResponse.ok) {
                throw new RawMaterialClassificationError(
                    503,
                    "CLASSIFICATION_LOOKUP_FAILED",
                    "Unable to validate the product classification relationship."
                );
            }

            const currentProduct = (await currentProductResponse.json()).data as {
                product_type?: unknown;
            };
            const currentProductType = typeof currentProduct.product_type === "object" && currentProduct.product_type !== null
                ? Number((currentProduct.product_type as Record<string, unknown>).id)
                : Number(currentProduct.product_type);
            const requestedProductType = typeof body.product_type === "object" && body.product_type !== null
                ? Number((body.product_type as Record<string, unknown>).id)
                : Number(body.product_type);

            if (currentProductType === RAW_MATERIAL_PRODUCT_TYPE || currentProductType === PACKAGING_MATERIAL_PRODUCT_TYPE) {
                const classification = await enforceClassificationIntegrity({
                    operation: "update",
                    productId: Number(product_id),
                    productDetails: body,
                    packagingVariants: Array.isArray(body.packagingVariants) ? body.packagingVariants : []
                });
                Object.assign(body, classification.productDetails);
            } else if (requestedProductType === RAW_MATERIAL_PRODUCT_TYPE || requestedProductType === PACKAGING_MATERIAL_PRODUCT_TYPE) {
                return NextResponse.json({
                    error: "Raw materials and packaging materials must be updated through the raw-materials endpoint.",
                    code: "INVALID_PRODUCT_TYPE"
                }, { status: 400 });
            }
        }

        const userId = await getUserIdFromToken();

        const editableFields = Object.fromEntries(
            Object.entries(body).filter(([key]) => ![
                "created_at",
                "created_by",
                "updated_at",
                "updated_by"
            ].includes(key))
        );
        const updatePayload = {
            ...editableFields,
            ...productUpdateAuditFields(userId)
        };

        const res = await fetch(`${DIRECTUS_URL}/items/products/${product_id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus PATCH failed: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, data: json.data });
    } catch (e) {
        if (e instanceof RawMaterialClassificationError) {
            return NextResponse.json(
                { error: e.message, code: e.code, ...e.details },
                { status: e.status }
            );
        }
        console.error("API Error patching product:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update product" }, { status: 500 });
    }
}
