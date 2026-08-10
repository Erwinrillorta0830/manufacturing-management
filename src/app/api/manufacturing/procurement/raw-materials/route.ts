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

function isPositiveNumber(value: unknown): boolean {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return false;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0;
}

function hasProvidedValue(value: unknown): boolean {
    return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
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

    if (isPackagingMaterial) {
        if (requireAll || hasWeight || hasWeightUnit) {
            if (!isPositiveNumber(productDetails.weight)) {
                return "Gross weight is required and must be greater than 0 for packaging materials.";
            }
            if (!isPositiveNumber(productDetails.weight_unit_id)) {
                return "Weight unit is required for packaging materials.";
            }
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

function validatePackagingVariants(packagingVariants: unknown): string | null {
    if (!Array.isArray(packagingVariants) || packagingVariants.length === 0) return null;

    const hasInvalidVariant = packagingVariants.some((variant) => {
        if (!variant || typeof variant !== "object") return true;
        const item = variant as Record<string, unknown>;
        return !isPositiveNumber(item.unit_of_measurement) ||
            !isPositiveNumber(item.unit_of_measurement_count) ||
            !isPositiveNumber(item.density_factor) ||
            !isPositiveNumber(item.weight) ||
            !isPositiveNumber(item.weight_unit_id);
    });

    return hasInvalidVariant
        ? "Packaging variants require valid UOM, conversion count, density, gross weight, and weight unit values."
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
            identity.descriptionKey,
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

        const measurementError = validateMeasurementFields(productDetails, true);
        if (measurementError) {
            return NextResponse.json({ error: measurementError }, { status: 400 });
        }

        const variantsError = validatePackagingVariants(packagingVariants);
        if (variantsError) {
            return NextResponse.json({ error: variantsError }, { status: 400 });
        }

        const resolvedVariants = await resolvePackagingVariantIdentities(packagingVariants, {
            parentName: productDetails.product_name
        });

        const rawWeight = hasProvidedValue(productDetails.weight) ? Number(productDetails.weight) : null;
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
            ...productDetails,
            weight: rawWeight,
            product_weight: rawWeight,
            weight_unit_id: verifiedWeightUnitId,
            product_brand: productDetails.product_brand !== undefined ? productDetails.product_brand : null,
            product_category: productDetails.product_category !== undefined ? productDetails.product_category : null,
            product_class: productDetails.product_class !== undefined ? productDetails.product_class : null,
            product_segment: productDetails.product_segment !== undefined ? productDetails.product_segment : null,
            product_section: productDetails.product_section !== undefined ? productDetails.product_section : null,
            isActive: 1,
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
                    const variantPayload = {
                        ...variant,
                        product_name: identity.productName,
                        description: identity.descriptionKey,
                        short_description: identity.descriptionKey,
                        product_weight: variant.weight !== undefined ? variant.weight : undefined,
                        product_brand: variant.product_brand !== undefined ? variant.product_brand : null,
                        product_category: variant.product_category !== undefined ? variant.product_category : null,
                        product_class: variant.product_class !== undefined ? variant.product_class : null,
                        product_segment: variant.product_segment !== undefined ? variant.product_segment : null,
                        product_section: variant.product_section !== undefined ? variant.product_section : null,
                        parent_id: productId,
                        isActive: 1,
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
        if (e instanceof ProductIdentityError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
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

        if (!productDetails || typeof productDetails !== "object") {
            return NextResponse.json({ error: "productDetails is required." }, { status: 400 });
        }

        const measurementError = validateMeasurementFields(productDetails, false);
        if (measurementError) {
            return NextResponse.json({ error: measurementError }, { status: 400 });
        }

        const variantsError = validatePackagingVariants(packagingVariants);
        if (variantsError) {
            return NextResponse.json({ error: variantsError }, { status: 400 });
        }

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
        const rawWeight = hasWeightField
            ? (hasProvidedValue(productDetails.weight) ? Number(productDetails.weight) : null)
            : null;

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
            ...productDetails,
            ...(hasWeightField ? { weight: rawWeight, product_weight: rawWeight } : {}),
            ...(hasWeightUnitField ? { weight_unit_id: verifiedWeightUnitId ?? null } : {}),
            product_brand: productDetails.product_brand !== undefined ? productDetails.product_brand : null,
            product_category: productDetails.product_category !== undefined ? productDetails.product_category : null,
            product_class: productDetails.product_class !== undefined ? productDetails.product_class : null,
            product_segment: productDetails.product_segment !== undefined ? productDetails.product_segment : null,
            product_section: productDetails.product_section !== undefined ? productDetails.product_section : null,
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

        const resolvedVariants = await resolvePackagingVariantIdentities(packagingVariants, {
            parentId: Number(productId)
        });

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
                    const variantPayload = {
                        ...variant,
                        product_name: identity.productName,
                        description: identity.descriptionKey,
                        short_description: identity.descriptionKey,
                        product_weight: variant.weight !== undefined ? variant.weight : undefined,
                        product_brand: variant.product_brand !== undefined ? variant.product_brand : (productDetails.product_brand !== undefined ? productDetails.product_brand : null),
                        product_category: variant.product_category !== undefined ? variant.product_category : (productDetails.product_category !== undefined ? productDetails.product_category : null),
                        product_class: variant.product_class !== undefined ? variant.product_class : null,
                        product_segment: variant.product_segment !== undefined ? variant.product_segment : null,
                        product_section: variant.product_section !== undefined ? variant.product_section : null,
                        parent_id: productId,
                        isActive: 1,
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
                    } else {
                        // Create new child variant
                        const varRes = await fetch(`${DIRECTUS_URL}/items/products?fields=product_id`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify({
                                ...variantPayload,
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
        if (e instanceof ProductIdentityError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        console.error("API Error updating raw material:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update raw material" }, { status: 500 });
    }
}



