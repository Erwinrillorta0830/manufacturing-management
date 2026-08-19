import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";

interface VersionRecord {
    version_id: number;
    product_id?: number;
    version_name?: string;
    status?: string;
    is_primary?: boolean;
    expected_yield_percentage?: number;
    base_quantity?: number;
    uom_id?: number | null;
    valid_from?: string | null;
    valid_to?: string | null;
}

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
        const rawData = json.data || [];

        const activeVersions = rawData.filter((item: VersionRecord) => item.status === "Active");
        const explicitPrimary = rawData.find((item: VersionRecord) => item.is_primary);
        const primaryVersionId = explicitPrimary?.version_id ?? (activeVersions[0]?.version_id || rawData[0]?.version_id);

        const versionsList = rawData.map((v: Record<string, unknown> & { version_id: number; version_name?: string; status?: string; is_primary?: boolean; expected_yield_percentage?: number; base_quantity?: number; uom_id?: number | null; valid_from?: string | null; valid_to?: string | null }) => ({
            version_id: v.version_id,
            id: v.version_id, // compatibility
            product_id: productId,
            version_name: v.version_name || `Version #${v.version_id}`,
            base_quantity: v.base_quantity ?? 1,
            uom_id: v.uom_id ?? null,
            expected_yield_percentage: v.expected_yield_percentage ?? 100,
            status: v.status || "Draft",
            valid_from: v.valid_from || null,
            valid_to: v.valid_to || null,
            is_active: v.status === "Active",
            is_primary: v.version_id === primaryVersionId
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
            // 0. Enforce uniqueness of version_name per product
            const verFilter = encodeURIComponent(JSON.stringify({
                _and: [
                    { product_id: { _eq: numericProductId } },
                    { version_name: { _eq: versionName.trim() } }
                ]
            }));
            const dupCheckUrl = `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${verFilter}&limit=1&fields=version_id`;
            const dupRes = await fetch(dupCheckUrl, { headers, cache: "no-store" });
            if (dupRes.ok) {
                const dupJson = await dupRes.json();
                if (dupJson.data && dupJson.data.length > 0) {
                    return NextResponse.json(
                        { error: `A version with name "${versionName.trim()}" already exists for this product. Please choose a unique version name.`, code: "VERSION_NAME_CONFLICT" },
                        { status: 409 }
                    );
                }
            }

            // Resolve UOM ID if not provided
            let resolvedUomId = uId;
            if (!resolvedUomId) {
                try {
                    if (baseVersionId) {
                        const oldVerRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${parseInt(baseVersionId)}?fields=uom_id`, { headers, cache: "no-store" });
                        if (oldVerRes.ok) {
                            const oldVerData = (await oldVerRes.json()).data;
                            if (oldVerData?.uom_id) resolvedUomId = Number(oldVerData.uom_id);
                        }
                    }
                    if (!resolvedUomId) {
                        const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${numericProductId}?fields=unit_of_measurement`, { headers, cache: "no-store" });
                        if (prodRes.ok) {
                            const prodData = (await prodRes.json()).data;
                            const rawUom = prodData?.unit_of_measurement;
                            resolvedUomId = typeof rawUom === "object" && rawUom !== null ? Number(rawUom.unit_id || rawUom.id) : (rawUom ? Number(rawUom) : null);
                        }
                    }
                    if (!resolvedUomId) {
                        const unitsRes = await fetch(`${DIRECTUS_URL}/items/units?limit=1`, { headers, cache: "no-store" });
                        if (unitsRes.ok) {
                            const unitsData = (await unitsRes.json()).data;
                            if (unitsData && unitsData.length > 0) {
                                resolvedUomId = Number(unitsData[0].unit_id);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error resolving product default UOM for version:", err);
                }
            }

            const formattedBaseQty = Math.max(0.0001, Number(bQty || 1));
            const formattedYield = Math.min(100, Math.max(0.01, Number(yieldPercent || 100)));

            // 1. Create product manufacturing version matching MySQL table schema
            const versionPayload: Record<string, unknown> = {
                product_id: numericProductId,
                version_name: versionName.trim(),
                base_quantity: formattedBaseQty,
                uom_id: resolvedUomId || 1,
                expected_yield_percentage: formattedYield,
                status: "For Approval",
                valid_from: today,
                created_by: userId || null
            };

            const verRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version`, {
                method: "POST",
                headers,
                body: JSON.stringify(versionPayload)
            });
            if (!verRes.ok) {
                const errText = await verRes.text();
                console.error("Directus failed to create product version:", verRes.status, errText);
                throw new Error(`Directus failed to create product version: ${verRes.status} - ${errText}`);
            }
            const verJson = await verRes.json();
            createdVersionId = verJson.data?.version_id;

            // 2. Clone from base version if baseVersionId is provided
            if (baseVersionId && createdVersionId) {
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
                                        cost_per_unit: item.cost_per_unit || 0,
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

                // Clone version labor positions
                try {
                    const posFilter = encodeURIComponent(JSON.stringify({ version_id: { _eq: oldVersionId } }));
                    let oldPosRes = await fetch(`${DIRECTUS_URL}/items/product_version_positions?filter=${posFilter}&limit=-1`, { headers, cache: "no-store" }).catch(() => null);
                    let targetCollection = "product_version_positions";
                    if (!oldPosRes || !oldPosRes.ok) {
                        targetCollection = "manufacturing_version_positions";
                        oldPosRes = await fetch(`${DIRECTUS_URL}/items/${targetCollection}?filter=${posFilter}&limit=-1`, { headers, cache: "no-store" }).catch(() => null);
                    }
                    if (oldPosRes && oldPosRes.ok) {
                        const oldPositions = (await oldPosRes.json()).data || [];
                        for (const pos of oldPositions) {
                            const newPosPayload = {
                                version_id: createdVersionId,
                                position_id: pos.position_id || null,
                                position_name: pos.position_name || "Operator",
                                category: pos.category || "direct_labor",
                                manpower_count: pos.manpower_count || 1,
                                hourly_rate: pos.hourly_rate || 0,
                                hours_required: pos.hours_required || 0,
                                daily_rate: pos.daily_rate || 0,
                                ot_hours: pos.ot_hours || 0,
                                include_mandates: pos.include_mandates !== undefined ? Boolean(pos.include_mandates) : true,
                                sss_amount: pos.sss_amount || 0,
                                phic_amount: pos.phic_amount || 0,
                                hdmf_amount: pos.hdmf_amount || 0,
                                created_by: userId
                            };
                            await fetch(`${DIRECTUS_URL}/items/${targetCollection}`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify(newPosPayload)
                            }).catch(() => { });
                        }
                    }
                } catch (posErr) {
                    console.error("Error cloning labor positions:", posErr);
                }

                // Clone version overheads
                try {
                    const ovFilter = encodeURIComponent(JSON.stringify({ version_id: { _eq: oldVersionId } }));
                    const oldOvRes = await fetch(`${DIRECTUS_URL}/items/product_version_overheads?filter=${ovFilter}&limit=-1`, { headers, cache: "no-store" }).catch(() => null);
                    if (oldOvRes && oldOvRes.ok) {
                        const oldOverheads = (await oldOvRes.json()).data || [];
                        for (const ov of oldOverheads) {
                            await fetch(`${DIRECTUS_URL}/items/product_version_overheads`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify({
                                    version_id: createdVersionId,
                                    overhead_type_id: ov.overhead_type_id,
                                    cost: ov.cost || 0,
                                    allocation_basis: ov.allocation_basis || "per_unit",
                                    is_active: ov.is_active !== undefined ? Boolean(ov.is_active) : true,
                                    remarks: ov.remarks || ""
                                })
                            }).catch(() => { });
                        }
                    }
                } catch (ovErr) {
                    console.error("Error cloning version overheads:", ovErr);
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

async function patchVersionItem(versionId: number, data: Record<string, unknown>) {
    const res = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${versionId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(data)
    });
    return res;
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { productId, versionId, action, deactivateAll } = body;

        if (!productId) {
            return NextResponse.json({ error: "Missing required field (productId)" }, { status: 400 });
        }

        const numericProductId = parseInt(productId);
        const today = await getTodayDateString();

        // Fetch all versions for this product without restrictive field parameters
        const getVersionsUrl = `${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${numericProductId}&limit=-1`;
        const versionsRes = await fetch(getVersionsUrl, { headers, cache: "no-store" });
        if (!versionsRes.ok) {
            const errText = await versionsRes.text().catch(() => "");
            console.error(`Directus version fetch failed for productId=${numericProductId} [HTTP ${versionsRes.status}]:`, errText);
            return NextResponse.json(
                { error: `Directus failed to fetch product versions (HTTP ${versionsRes.status}): ${errText || versionsRes.statusText}` },
                { status: versionsRes.status >= 400 && versionsRes.status < 600 ? versionsRes.status : 500 }
            );
        }
        const versionsJson = await versionsRes.json();
        const versions: VersionRecord[] = versionsJson.data || [];

        if (deactivateAll || action === "deactivate_all") {
            // Deactivate all versions
            for (const v of versions) {
                await patchVersionItem(v.version_id, { status: "Inactive", valid_to: today, is_primary: false });
            }
            return NextResponse.json({ success: true });
        }

        if (!versionId) {
            return NextResponse.json({ error: "Missing required field (versionId)" }, { status: 400 });
        }
        const numericVersionId = parseInt(versionId);

        if (action === "set_primary") {
            const targetVer = versions.find((v: VersionRecord) => v.version_id === numericVersionId);
            if (targetVer && targetVer.status !== "Active" && targetVer.status !== "Approved") {
                return NextResponse.json(
                    { error: `Version is currently "${targetVer.status || 'Unapproved'}". Only approved or active versions can be set as Primary Default.` },
                    { status: 400 }
                );
            }
            // 1. Unset primary on all other versions of this product
            for (const v of versions) {
                if (v.version_id !== numericVersionId) {
                    await patchVersionItem(v.version_id, { is_primary: false });
                }
            }
            // 2. Activate & set is_primary on target version
            const actRes = await patchVersionItem(numericVersionId, { status: "Active", is_primary: true, valid_from: today, valid_to: null });
            if (!actRes.ok) throw new Error("Failed to set primary version");
            return NextResponse.json({ success: true });
        } else if (action === "deactivate") {
            // Deactivate specific version
            const target = versions.find((v: VersionRecord) => v.version_id === numericVersionId);
            const wasPrimary = target?.is_primary;

            await patchVersionItem(numericVersionId, { status: "Inactive", valid_to: today, is_primary: false });

            // If the deactivated version was primary, auto-promote the next available active version
            if (wasPrimary) {
                const remainingActive = versions.find((v: VersionRecord) => v.version_id !== numericVersionId && v.status === "Active");
                if (remainingActive) {
                    await patchVersionItem(remainingActive.version_id, { is_primary: true });
                }
            }
            return NextResponse.json({ success: true });
        } else if (action === "submit_for_approval") {
            const targetVer = versions.find((v: VersionRecord) => v.version_id === numericVersionId);
            const allowedForSubmit = ["Draft", "Revision Required"];
            if (targetVer && !allowedForSubmit.includes(targetVer.status || "Draft")) {
                return NextResponse.json(
                    { error: `Version is currently "${targetVer.status}". Only Draft or Revision Required versions can be submitted for approval.` },
                    { status: 400 }
                );
            }
            const actRes = await patchVersionItem(numericVersionId, { status: "For Approval" });
            if (!actRes.ok) throw new Error("Failed to submit version for approval");
            return NextResponse.json({ success: true });
        } else {
            // Action "set_active": Activate version — only allowed for Approved versions
            const targetVer = versions.find((v: VersionRecord) => v.version_id === numericVersionId);
            if (targetVer && targetVer.status !== "Approved" && targetVer.status !== "Archived") {
                return NextResponse.json(
                    { error: `Version is currently "${targetVer.status || "Draft"}". Only Approved versions can be set to Active.` },
                    { status: 400 }
                );
            }
            const hasPrimary = versions.some((v: VersionRecord) => v.is_primary);
            const isPrimary = !hasPrimary;

            const actRes = await patchVersionItem(numericVersionId, { status: "Active", is_primary: isPrimary, valid_from: today, valid_to: null });
            if (!actRes.ok) throw new Error("Failed to activate version");
            return NextResponse.json({ success: true });
        }
    } catch (e) {
        console.error("API Error activating version:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to activate version" }, { status: 500 });
    }
}


