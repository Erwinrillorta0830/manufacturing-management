/* eslint-disable */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "../_directus";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { verifyOrGetValidWeightUnitId } from "@/app/api/manufacturing/finished-goods/weight-units/weight-units-helper";


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

        const rawWeight = Number(productDetails.weight);
        if (productDetails.weight === undefined || productDetails.weight === null || isNaN(rawWeight) || rawWeight <= 0) {
            return NextResponse.json({ error: "Gross weight is required and must be greater than 0." }, { status: 400 });
        }

        const rawWeightUnitId = productDetails.weight_unit_id ? Number(productDetails.weight_unit_id) : null;
        if (!rawWeightUnitId) {
            return NextResponse.json({ error: "Weight unit is required." }, { status: 400 });
        }
        const verifiedWeightUnitId = await verifyOrGetValidWeightUnitId(rawWeightUnitId);
        if (!verifiedWeightUnitId) {
            return NextResponse.json({ error: "Selected weight unit is invalid." }, { status: 400 });
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
            console.error("Error parsing user token in POST raw-materials route:", err);
        }

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
        if (packagingVariants && Array.isArray(packagingVariants) && packagingVariants.length > 0) {
            try {
                for (const variant of packagingVariants) {
                    const variantPayload = {
                        ...variant,
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
                    }
                }
            } catch (err) {
                console.error("Error creating child variants:", err);
            }
        }

        return NextResponse.json({ success: true, productId });
    } catch (e) {
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

        const rawWeight = productDetails.weight !== undefined ? Number(productDetails.weight) : null;
        if (productDetails.weight !== undefined && (rawWeight === null || isNaN(rawWeight) || rawWeight <= 0)) {
            return NextResponse.json({ error: "Gross weight is required and must be greater than 0." }, { status: 400 });
        }

        const rawWeightUnitId = productDetails.weight_unit_id !== undefined ? (productDetails.weight_unit_id ? Number(productDetails.weight_unit_id) : null) : undefined;
        if (productDetails.weight_unit_id !== undefined && !rawWeightUnitId) {
            return NextResponse.json({ error: "Weight unit is required." }, { status: 400 });
        }
        const verifiedWeightUnitId = rawWeightUnitId !== undefined ? await verifyOrGetValidWeightUnitId(rawWeightUnitId) : undefined;

        // Clean product brand, category, etc., if they are undefined to map to null
        const productPayload = {
            ...productDetails,
            ...(rawWeight !== null ? { weight: rawWeight, product_weight: rawWeight } : {}),
            ...(verifiedWeightUnitId !== undefined ? { weight_unit_id: verifiedWeightUnitId } : {}),
            product_brand: productDetails.product_brand !== undefined ? productDetails.product_brand : null,
            product_category: productDetails.product_category !== undefined ? productDetails.product_category : null,
            product_class: productDetails.product_class !== undefined ? productDetails.product_class : null,
            product_segment: productDetails.product_segment !== undefined ? productDetails.product_segment : null,
            product_section: productDetails.product_section !== undefined ? productDetails.product_section : null,
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

        // Update supplier links: delete old ones first, then create new ones for parent and children
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

        // Create new child packaging variants if passed during update
        if (packagingVariants && Array.isArray(packagingVariants) && packagingVariants.length > 0) {
            try {
                for (const variant of packagingVariants) {
                    const variantPayload = {
                        ...variant,
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
                        date_added: await getTodayDateString()
                    };

                    const varRes = await fetch(`${DIRECTUS_URL}/items/products?fields=product_id`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(variantPayload)
                    });

                    if (varRes.ok) {
                        const varJson = await varRes.json();
                        const childId = varJson.data?.product_id;

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
                    }
                }
            } catch (err) {
                console.error("Error creating variants during update:", err);
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("API Error updating raw material:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update raw material" }, { status: 500 });
    }
}



