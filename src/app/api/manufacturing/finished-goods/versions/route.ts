import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productIdStr = searchParams.get("productId");
        if (!productIdStr) {
            return NextResponse.json({ error: "Missing productId query parameter" }, { status: 400 });
        }
        const productId = parseInt(productIdStr);
        if (isNaN(productId)) {
            return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
        }

        const url = `${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${productId}&limit=-1`;
        let res: Response | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            res = await fetch(url, { headers, cache: "no-store" });
            if (res.ok || ![502, 503, 504].includes(res.status) || attempt === 1) break;
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        if (!res) throw new Error("Directus version request did not return a response");
        if (!res.ok) throw new Error(`Directus failed to fetch versions: ${res.status}`);
        const json = await res.json();

        const versionsList = (json.data || []).map((v: Record<string, unknown> & { version_id: number; version_name?: string; status?: string; expected_yield_percentage?: number; base_quantity?: number; uom_id?: number | null; valid_from?: string | null; valid_to?: string | null }) => ({
            version_id: v.version_id,
            id: v.version_id, // compatibility
            product_id: productId,
            version_name: v.version_name || `Version #${v.version_id}`,
            base_quantity: v.base_quantity ?? 1,
            uom_id: v.uom_id ?? null,
            expected_yield_percentage: v.expected_yield_percentage ?? 100,
            status: v.status || "For Approval",
            valid_from: v.valid_from || null,
            valid_to: v.valid_to || null,
            is_active: v.status === "Active" // compatibility
        }));

        return NextResponse.json(versionsList);
    } catch (e) {
        console.error("API Error fetching versions:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch versions" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { productId, baseVersionId, expectedYield, versionName, baseQuantity, uomId } = body;

        if (!productId || !versionName) {
            return NextResponse.json({ error: "Missing required fields (productId, versionName)" }, { status: 400 });
        }

        const numericProductId = parseInt(productId);
        const yieldPercent = expectedYield === undefined || expectedYield === null ? 100 : Number(expectedYield);
        const bQty = baseQuantity === undefined || baseQuantity === null ? 1 : Number(baseQuantity);
        if (!Number.isFinite(yieldPercent) || yieldPercent <= 0 || yieldPercent > 100) {
            return NextResponse.json({ error: "Expected yield must be between 1 and 100." }, { status: 400 });
        }
        if (!Number.isFinite(bQty) || bQty <= 0) {
            return NextResponse.json({ error: "Base quantity must be greater than 0." }, { status: 400 });
        }
        const uId = uomId ? Number(uomId) : null;
        const today = await getTodayDateString();

        let createdVersionId: number | null = null;
        const createdRoutes: number[] = [];
        const createdBOMItems: number[] = [];

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
                    const rawId = payload?.id || payload?.user_id || payload?.sub;
                    if (rawId && !isNaN(Number(rawId))) {
                        userId = Number(rawId);
                    }
                }
            }
        } catch (err) {
            console.error("Error parsing user token in POST versions route:", err);
        }

        try {
            // 0. Enforce global uniqueness of version_name
            const dupCheckUrl = `${DIRECTUS_URL}/items/product_manufacturing_version?filter[version_name][_eq]=${encodeURIComponent(versionName)}&limit=1&fields=version_id`;
            const dupRes = await fetch(dupCheckUrl, { headers, cache: "no-store" });
            if (dupRes.ok) {
                const dupJson = await dupRes.json();
                if (dupJson.data && dupJson.data.length > 0) {
                    return NextResponse.json(
                        { error: "A version with this name already exists. Please choose a unique version name.", code: "VERSION_NAME_CONFLICT" },
                        { status: 409 }
                    );
                }
            }

            // 1. Create product manufacturing version
            const verRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    product_id: numericProductId,
                    version_name: versionName,
                    base_quantity: bQty,
                    uom_id: uId,
                    expected_yield_percentage: yieldPercent,
                    status: "For Approval", // New version starts as For Approval
                    valid_from: today,
                    created_by: userId
                })
            });
            if (!verRes.ok) throw new Error(`Directus failed to create product version: ${verRes.status}`);
            const verJson = await verRes.json();
            createdVersionId = verJson.data?.version_id;

            // 2. Clone from base version if baseVersionId is provided
            if (baseVersionId) {
                const oldVersionId = parseInt(baseVersionId);

                // Fetch routes of old version
                const routesUrl = `${DIRECTUS_URL}/items/manufacturing_routes?filter[version_id][_eq]=${oldVersionId}&limit=-1`;
                const resRoutes = await fetch(routesUrl, { headers, cache: "no-store" });
                if (resRoutes.ok) {
                    const routesJson = await resRoutes.json();
                    const oldRoutes = routesJson.data || [];

                    for (const step of oldRoutes) {
                        // Create route step
                        const routePayload = {
                            version_id: createdVersionId,
                            work_center_id: step.work_center_id || null,
                            operation_id: step.operation_id || null,
                            sequence_order: step.sequence_order,
                            setup_time_hours: step.setup_time_hours || 0,
                            run_time_hours: step.run_time_hours || 0,
                            step_batch_size: step.step_batch_size !== undefined ? step.step_batch_size : 1,
                            qa_template_id: step.qa_template_id || null,
                            created_by: userId
                        };

                        const resStep = await fetch(`${DIRECTUS_URL}/items/manufacturing_routes`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify(routePayload)
                        });

                        if (resStep.ok) {
                            const stepData = await resStep.json();
                            const newRouteId = stepData.data.route_id;
                            createdRoutes.push(newRouteId);

                            // Fetch BOM items of the old route step
                            const bomUrl = `${DIRECTUS_URL}/items/manufacturing_routes_bom?filter[route_id][_eq]=${step.route_id}&limit=-1`;
                            const resBom = await fetch(bomUrl, { headers, cache: "no-store" });
                            if (resBom.ok) {
                                const bomJson = await resBom.json();
                                const oldBomItems = bomJson.data || [];

                                for (const item of oldBomItems) {
                                    const bomPayload = {
                                        route_id: newRouteId,
                                        product_id: item.product_id,
                                        quantity_required: item.quantity_required,
                                        unit_of_measurement: item.unit_of_measurement || null,
                                        wastage_factor_percentage: item.wastage_factor_percentage || 0,
                                        created_by: userId
                                    };

                                    const resItem = await fetch(`${DIRECTUS_URL}/items/manufacturing_routes_bom`, {
                                        method: "POST",
                                        headers,
                                        body: JSON.stringify(bomPayload)
                                    });

                                    if (resItem.ok) {
                                        const itemData = await resItem.json();
                                        createdBOMItems.push(itemData.data.id);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return NextResponse.json({ success: true, version: verJson.data });
        } catch (err) {
            console.error("Error cloning version, rolling back...", err);
            // Rollback newly created items
            for (const id of createdBOMItems) {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_routes_bom/${id}`, { method: "DELETE", headers }).catch(() => { });
            }
            for (const id of createdRoutes) {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_routes/${id}`, { method: "DELETE", headers }).catch(() => { });
            }
            if (createdVersionId) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${createdVersionId}`, { method: "DELETE", headers }).catch(() => { });
            }
            throw err;
        }
    } catch (e) {
        console.error("API Error registering version:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to register version" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { productId, versionId, deactivateAll } = body;

        if (!productId) {
            return NextResponse.json({ error: "Missing required field (productId)" }, { status: 400 });
        }

        const numericProductId = parseInt(productId);
        const today = await getTodayDateString();

        // Fetch all versions for this product
        const getVersionsUrl = `${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${numericProductId}&limit=-1&fields=version_id`;
        const versionsRes = await fetch(getVersionsUrl, { headers, cache: "no-store" });
        if (!versionsRes.ok) throw new Error("Failed to fetch product versions for deactivation");
        const versionsJson = await versionsRes.json();
        const versions = versionsJson.data || [];

        if (deactivateAll) {
            // Deactivate all versions
            for (const v of versions) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${v.version_id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: "Inactive", valid_to: today })
                });
            }
            return NextResponse.json({ success: true });
        }

        if (!versionId) {
            return NextResponse.json({ error: "Missing required field (versionId)" }, { status: 400 });
        }
        const numericVersionId = parseInt(versionId);

        // Deactivate all other versions
        for (const v of versions) {
            if (v.version_id !== numericVersionId) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${v.version_id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: "Inactive", valid_to: today })
                });
            }
        }

        // Activate the selected version
        const actRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${numericVersionId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: "Active", valid_from: today, valid_to: null })
        });
        if (!actRes.ok) throw new Error("Failed to activate selected version");

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("API Error activating version:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to activate version" }, { status: 500 });
    }
}

