import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
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
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";
        const limit = parseInt(searchParams.get("limit") || "-1");
        const excludeRollup = searchParams.get("excludeRollup") === "true";

        const explicitFields = "product_id,product_name,product_code,description,short_description,status,isActive,cost_per_unit,price_per_unit,product_brand,barcode,parent_id,parent_id.product_id,parent_id.product_name,product_category.category_id,product_category.category_name,product_class,product_segment,product_section,product_shelf_life,product_image,maintaining_quantity,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,unit_of_measurement_count,density_factor,weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id,product_type";
        let url = `${DIRECTUS_URL}/items/products?limit=${limit}&sort=-product_id&fields=${explicitFields}`;
        if (search && search.trim()) {
            url += `&search=${encodeURIComponent(search.trim())}`;
        }

        const [prodResult, versionsResult, profilesResult, weightUnitsResult] = await Promise.allSettled([
            fetch(url, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=version_id,product_id,version_name,status,base_quantity,expected_yield_percentage`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/product_currency_profiles?limit=-1`, { headers, cache: "no-store" }),
            fetchAllWeightUnits()
        ]);

        if (prodResult.status === "rejected") throw prodResult.reason;
        const prodRes = prodResult.value;
        if (!prodRes.ok) throw new Error(`Directus failed to fetch products: ${prodRes.status}`);
        const prodJson = await prodRes.json();
        const products: DirectusProduct[] = prodJson.data || [];

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
        const resolvedProducts = await Promise.all(products.map(async (p: DirectusProduct) => {
            const productCopy = { ...p };
            productCopy.has_versions = versionProductIds.has(Number(p.product_id));
            productCopy.currency_profile = profilesMap.get(Number(p.product_id)) || null;
            if (productCopy.weight_unit_id && typeof productCopy.weight_unit_id !== "object") {
                const matched = weightUnitsMap.get(Number(productCopy.weight_unit_id));
                if (matched) (productCopy as DirectusProduct & Record<string, unknown>).weight_unit_id = { id: matched.id, code: matched.code, name: matched.name };
            }

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
            console.error("Error parsing user token in POST product route:", err);
        }

        // 1. Create Product
        const productFields = { ...productDetails };
        const description = productFields.description;
        const short_description = productFields.short_description;
        delete productFields.description;
        delete productFields.short_description;
        delete productFields.product_name;
        delete productFields.parent_id;
        delete productFields.unit_of_measurement;
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
            status: "Approved",
            item_type: "regular",
            product_type: 388,
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

        // 2. Create Product Version (Draft status by default for first version)
        const versionPayload = {
            product_id: productId,
            version_name: validatedDetails.versionName,
            base_quantity: 1,
            uom_id: validatedDetails.unitOfMeasurement,
            expected_yield_percentage: validatedDetails.expectedYield,
            status: "Draft",
            is_primary: false,
            valid_from: todayStr
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
            console.error("Error parsing user token in PATCH product route:", err);
        }

        const updatePayload = {
            ...body,
            updated_by: userId ? Number(userId) : undefined,
            updated_at: new Date().toISOString()
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
        console.error("API Error patching product:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update product" }, { status: 500 });
    }
}
