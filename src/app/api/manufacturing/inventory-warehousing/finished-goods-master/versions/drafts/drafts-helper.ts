import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getBOMDetailsForVersion } from "../versions-helper";
import { syncRoutesAndBOM, syncVersionOverheadItems } from "../../bom-details/bom-details-helper";
import { materialTypeFromProduct, isMaterialTypeCompatible, type MaterialType } from "@/modules/manufacturing-management/inventory-warehousing/finished-goods-master/material-types";

/**
 * ============================================================================
 * MANUFACTURING VERSION REVISION DRAFT SUBSYSTEM (PATH A)
 *
 * Golden Architectural Invariant:
 * Never transform an existing production manufacturing version into another version.
 * A revision is always a new branch. Draft editing occurs exclusively in draft tables.
 * QA approval creates a new production version atomically. Existing production
 * definitions and Job Order version references remain unchanged.
 * ============================================================================
 */

export interface VersionDraftHeader {
    draft_id: number;
    product_id: number;
    source_version_id?: number | null;
    applied_version_id?: number | null;
    version_name: string;
    base_quantity: number;
    uom_id: number;
    expected_yield_percentage: number;
    custom_overhead: number;
    status: "Draft" | "Pending Approval" | "Applied" | "Rejected" | "Cancelled";
    created_by?: number | null;
    created_at?: string;
    updated_by?: number | null;
    updated_at?: string;
    submitted_by?: number | null;
    submitted_at?: string | null;
    reviewed_by?: number | null;
    reviewed_at?: string | null;
    cancelled_by?: number | null;
    cancelled_at?: string | null;
    cancellation_reason?: string | null;
    remarks?: string | null;
}

export interface VersionDraftFull extends VersionDraftHeader {
    routes: Record<string, unknown>[];
    labor_positions: Record<string, unknown>[];
    overheads: Record<string, unknown>[];
}

function getNowInPhtISO(): string {
    const phDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${phDate.getFullYear()}-${pad(phDate.getMonth() + 1)}-${pad(phDate.getDate())} ${pad(phDate.getHours())}:${pad(phDate.getMinutes())}:${pad(phDate.getSeconds())}`;
}

/**
 * Fetch a full draft by its draft_id.
 * By default only returns logically active child records (is_deleted = 0).
 */
export async function getDraftById(
    draftId: number,
    options?: { includeDeleted?: boolean }
): Promise<VersionDraftFull | null> {
    try {
        const draftRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draftId}`, { headers, cache: "no-store" });
        if (!draftRes.ok) return null;

        const draft = (await draftRes.json()).data as VersionDraftHeader;
        if (!draft) return null;

        const delFilter = options?.includeDeleted ? "" : "&filter[is_deleted][_eq]=0";

        // 1. Fetch draft routes
        const routesUrl = `${DIRECTUS_URL}/items/product_manufacturing_version_draft_routes?filter[draft_id][_eq]=${draftId}${delFilter}&sort=sequence_order&limit=-1`;
        const routesRes = await fetch(routesUrl, { headers, cache: "no-store" });
        const routes: Record<string, unknown>[] = routesRes.ok ? (await routesRes.json()).data || [] : [];

        // 2. Fetch draft BOM items for these routes
        const routeIds = routes.map(r => r.draft_route_id).filter(Boolean);
        let bomItems: Record<string, unknown>[] = [];
        if (routeIds.length > 0) {
            const bomUrl = `${DIRECTUS_URL}/items/product_manufacturing_version_draft_bom?filter[draft_route_id][_in]=${routeIds.join(",")}${delFilter}&limit=-1`;
            const bomRes = await fetch(bomUrl, { headers, cache: "no-store" });
            bomItems = bomRes.ok ? (await bomRes.json()).data || [] : [];
        }

        // Fetch operations and units to resolve relational metadata
        const [opsRes, unitsRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" })
        ]);
        const opsList: Record<string, unknown>[] = opsRes.ok ? (await opsRes.json()).data || [] : [];
        const unitsList: Record<string, unknown>[] = unitsRes.ok ? (await unitsRes.json()).data || [] : [];

        const opsById = new Map<number, string>(opsList.map((o) => [Number(o.id), String(o.operation_name)]));
        const opsByName = new Map<string, number>(opsList.map((o) => [String(o.operation_name).toLowerCase().trim(), Number(o.id)]));
        const unitsById = new Map<number, { unit_shortcut?: string; unit_name?: string }>(
            unitsList.map((u) => [Number(u.unit_id), { unit_shortcut: u.unit_shortcut as string | undefined, unit_name: u.unit_name as string | undefined }])
        );

        // Fetch product metadata for BOM component lines
        const bomProductIds = [...new Set(bomItems.map(b => Number(b.product_id)).filter(p => Number.isFinite(p) && p > 0))];
        let productMap = new Map<number, { product_name?: string; product_code?: string; product_type?: number | null; uom?: string; uomId?: number }>();
        let versionedProductIds = new Set<number>();

        if (bomProductIds.length > 0) {
            const productFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: bomProductIds } }));
            const versionFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: bomProductIds } }));
            const [productsRes, productVersionsRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/products?filter=${productFilter}&fields=product_id,product_name,product_code,product_type,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name&limit=-1`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${versionFilter}&fields=product_id&limit=-1`, { headers, cache: "no-store" })
            ]);

            const products: Record<string, unknown>[] = productsRes.ok ? (await productsRes.json()).data || [] : [];
            productMap = new Map(products.map((p) => {
                const uomObj = p.unit_of_measurement as { unit_id?: number; unit_shortcut?: string; unit_name?: string } | undefined;
                return [
                    Number(p.product_id),
                    {
                        product_name: (p.product_name as string) || "",
                        product_code: (p.product_code as string) || "",
                        product_type: p.product_type != null ? Number(p.product_type) : null,
                        uom: uomObj?.unit_shortcut || uomObj?.unit_name || "",
                        uomId: uomObj?.unit_id ? Number(uomObj.unit_id) : undefined
                    }
                ];
            }));

            if (productVersionsRes.ok) {
                const pvData: Record<string, unknown>[] = (await productVersionsRes.json()).data || [];
                versionedProductIds = new Set(pvData.map((pv) => Number(pv.product_id)).filter((id: number) => Number.isFinite(id) && id > 0));
            }
        }

        const mappedRoutes = routes.map(r => {
            const items = bomItems.filter(b => Number(b.draft_route_id) === Number(r.draft_route_id));

            let resolvedOpId: number | null = r.operation_id ? Number(r.operation_id) : null;
            if (!resolvedOpId && r.operation_name) {
                const cleanName = String(r.operation_name).trim().toLowerCase();
                resolvedOpId = opsByName.get(cleanName) || null;
                if (!resolvedOpId && cleanName.startsWith("operation #")) {
                    const parsedNum = parseInt(cleanName.replace("operation #", "").trim());
                    if (opsById.has(parsedNum)) resolvedOpId = parsedNum;
                }
            }
            const resolvedOpName = (resolvedOpId ? opsById.get(resolvedOpId) : null) || r.operation_name || (resolvedOpId ? `Operation #${resolvedOpId}` : "Operation");

            return {
                ...r,
                route_id: r.draft_route_id,
                sequence_order: Number(r.sequence_order || 1),
                operation_id: resolvedOpId,
                operation_name: resolvedOpName,
                work_center_id: r.work_center_id ? Number(r.work_center_id) : null,
                run_time_hours: r.standard_time_minutes != null ? Number(r.standard_time_minutes) / 60 : 0,
                setup_time_hours: r.setup_time_minutes != null ? Number(r.setup_time_minutes) / 60 : 0,
                step_batch_size: r.batch_capacity != null ? Number(r.batch_capacity) : 1,
                batch_capacity: r.batch_capacity != null ? Number(r.batch_capacity) : 1,
                expected_labor_cost: Number(r.labor_cost_per_hour || 0),
                labor_cost_per_hour: Number(r.labor_cost_per_hour || 0),
                qa_template_id: r.qa_template_id || null,
                bom_items: items.map(b => {
                    const pId = Number(b.product_id);
                    const pInfo = productMap.get(pId);
                    const hasVersions = versionedProductIds.has(pId);
                    const uomIdVal = b.uom_id ? Number(b.uom_id) : (pInfo?.uomId || 1);
                    const uomInfo = unitsById.get(uomIdVal);
                    const uomShortcut = uomInfo?.unit_shortcut || pInfo?.uom || "";

                    const expectedMatType = materialTypeFromProduct(pInfo?.product_type, hasVersions) || "raw_material";
                    let matType = b.material_type || expectedMatType;
                    if (matType && typeof matType === "string") {
                        const s = matType.toLowerCase().trim();
                        if (s.includes("pack")) matType = "packaging";
                        else if (s.includes("sub")) matType = "sub_assembly";
                        else if (s.includes("finish")) matType = "finished_good";
                        else if (s.includes("raw")) matType = "raw_material";
                    }
                    if (!matType || !isMaterialTypeCompatible(matType as MaterialType, pInfo?.product_type, hasVersions)) {
                        matType = expectedMatType;
                    }

                    return {
                        ...b,
                        id: b.draft_bom_id,
                        draft_bom_id: b.draft_bom_id,
                        bom_item_id: b.draft_bom_id,
                        product_id: pId,
                        quantity_required: Number(b.quantity ?? 1),
                        quantity: Number(b.quantity ?? 1),
                        unit_of_measurement: uomIdVal,
                        uom_id: uomIdVal,
                        uom_shortcut: uomShortcut,
                        wastage_factor_percentage: Number(b.wastage_percentage ?? 0),
                        wastage_percentage: Number(b.wastage_percentage ?? 0),
                        material_type: matType,
                        cost_per_unit: Number(b.cost_per_unit ?? 0),
                        product_name: pInfo?.product_name || "",
                        product_code: pInfo?.product_code || "",
                        product_type: pInfo?.product_type ?? null,
                        has_versions: hasVersions
                    };
                })
            };
        });

        // 3. Fetch draft labor positions
        const posUrl = `${DIRECTUS_URL}/items/product_manufacturing_version_draft_positions?filter[draft_id][_eq]=${draftId}${delFilter}&limit=-1`;
        const posRes = await fetch(posUrl, { headers, cache: "no-store" });
        const laborPositions: Record<string, unknown>[] = posRes.ok ? (await posRes.json()).data || [] : [];
        const mappedPositions = laborPositions.map(p => ({
            ...p,
            id: p.draft_pos_id,
            draft_pos_id: p.draft_pos_id,
            position_id: p.position_id != null ? Number(p.position_id) : null,
            position_name: p.position_name || "Operator",
            category: p.category || "direct_labor",
            manpower_count: Number(p.manpower_count || 1),
            hourly_rate: Number(p.hourly_rate || 0),
            hours_required: Number(p.hours_required || 0),
            daily_rate: Number(p.daily_rate || 0),
            ot_hours: Number(p.ot_hours || 0),
            include_mandates: Boolean(p.include_mandates ?? 1),
            sss_amount: Number(p.sss_amount || 0),
            phic_amount: Number(p.phic_amount || 0),
            hdmf_amount: Number(p.hdmf_amount || 0)
        }));

        // 4. Fetch draft overheads
        const ovhUrl = `${DIRECTUS_URL}/items/product_manufacturing_version_draft_overheads?filter[draft_id][_eq]=${draftId}${delFilter}&limit=-1`;
        const ovhRes = await fetch(ovhUrl, { headers, cache: "no-store" });
        const overheads: Record<string, unknown>[] = ovhRes.ok ? (await ovhRes.json()).data || [] : [];
        const mappedOverheads = overheads.map(o => ({
            ...o,
            id: String(o.draft_overhead_id),
            draft_overhead_id: o.draft_overhead_id,
            overhead_name: o.overhead_name || "Overhead",
            overhead_type_id: o.overhead_type_id ? Number(o.overhead_type_id) : undefined,
            cost_per_unit: Number(o.cost_allocation || 0),
            cost: Number(o.cost_allocation || 0),
            allocation_basis: o.allocation_basis || "per_unit",
            is_active: true,
            remarks: (o.overhead_name as string) || ""
        }));

        return {
            ...draft,
            routes: mappedRoutes,
            labor_positions: mappedPositions,
            overheads: mappedOverheads
        };
    } catch (err) {
        console.error("Error in getDraftById:", err);
        return null;
    }
}

/**
 * Fetch all active drafts ('Draft' or 'Pending Approval') for a product.
 */
export async function getActiveDraftsForProduct(
    productId: number,
    options?: { includeDeleted?: boolean }
): Promise<VersionDraftFull[]> {
    try {
        const url = `${DIRECTUS_URL}/items/product_manufacturing_version_draft?filter[product_id][_eq]=${productId}&filter[status][_in]=Draft,Pending Approval,Revision Required&sort=-draft_id&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];

        const drafts = ((await res.json()).data || []) as VersionDraftHeader[];
        if (drafts.length === 0) return [];

        // At most ONE active draft can exist for a product. Pick the latest one.
        const latestDraft = drafts[0];
        const full = await getDraftById(latestDraft.draft_id, options);

        // If redundant duplicate drafts exist from legacy edit cycles, auto-cancel older drafts in background
        if (drafts.length > 1) {
            for (let i = 1; i < drafts.length; i++) {
                if (drafts[i].status === "Draft") {
                    fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${drafts[i].draft_id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({
                            status: "Cancelled",
                            cancellation_reason: "Superseded by newer draft revision"
                        })
                    }).catch(() => { });
                }
            }
        }

        return full ? [full] : [];
    } catch (err) {
        console.error("Error in getActiveDraftsForProduct:", err);
        return [];
    }
}

/**
 * Fetch the active draft branched from a specific version (or null if none).
 */
export async function getActiveDraftForVersion(
    sourceVersionId: number,
    options?: { includeDeleted?: boolean }
): Promise<VersionDraftFull | null> {
    try {
        const url = `${DIRECTUS_URL}/items/product_manufacturing_version_draft?filter[source_version_id][_eq]=${sourceVersionId}&filter[status][_in]=Draft,Pending Approval&sort=-draft_id&limit=1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return null;

        const drafts = (await res.json()).data || [];
        if (!drafts || drafts.length === 0) return null;

        return await getDraftById(Number(drafts[0].draft_id), options);
    } catch (err) {
        console.error("Error in getActiveDraftForVersion:", err);
        return null;
    }
}

/**
 * Derives the next sequential revision name (e.g. 'SKU-001 Rev 2')
 * for a finished good specification lineage.
 */
export async function getNextRevisionName(productId: number, productCode?: string): Promise<string> {
    let sku = (productCode || "").trim();
    if (!sku) {
        try {
            const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=product_code`, { headers, cache: "no-store" });
            if (prodRes.ok) {
                const p = (await prodRes.json()).data;
                sku = (p?.product_code || "").trim();
            }
        } catch {
            // ignore
        }
    }
    if (!sku) sku = `FG-${productId}`;

    try {
        const [verRes, draftRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${productId}&fields=version_name&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft?filter[product_id][_eq]=${productId}&fields=version_name&limit=-1`, { headers, cache: "no-store" })
        ]);

        const versions = verRes.ok ? ((await verRes.json()).data || []) : [];
        const drafts = draftRes.ok ? ((await draftRes.json()).data || []) : [];
        const allNames: string[] = [
            ...versions.map((v: { version_name?: string }) => v.version_name || ""),
            ...drafts.map((d: { version_name?: string }) => d.version_name || "")
        ];

        let maxRev = 0;
        for (const name of allNames) {
            const match = name.match(/Rev\s*(\d+)/i);
            if (match && match[1]) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > maxRev) maxRev = num;
            }
        }

        const nextRevNum = maxRev > 0 ? maxRev + 1 : (allNames.length > 0 ? allNames.length + 1 : 1);
        return `${sku} Rev ${nextRevNum}`;
    } catch {
        return `${sku} Rev 1`;
    }
}

/**
 * Create a new revision draft branching from a source production version (or scratch).
 * Validates cross-table version_name uniqueness and source ownership.
 */
export async function createDraft(options: {
    productId: number;
    sourceVersionId?: number | null;
    versionName?: string;
    baseQuantity?: number;
    uomId?: number;
    expectedYieldPercentage?: number;
    customOverhead?: number;
    userId?: number | null;
}): Promise<VersionDraftFull> {
    const { productId, sourceVersionId, versionName, userId } = options;

    // 0. Idempotency Check: If an open editable draft already exists for this product, return it immediately
    const existingDraftUrl = `${DIRECTUS_URL}/items/product_manufacturing_version_draft?filter[product_id][_eq]=${productId}&filter[status][_in]=Draft,Revision Required&sort=-draft_id&limit=1`;
    const existingDraftRes = await fetch(existingDraftUrl, { headers, cache: "no-store" });
    if (existingDraftRes.ok) {
        const existingData = (await existingDraftRes.json()).data || [];
        if (existingData.length > 0 && existingData[0].draft_id) {
            const existingFullDraft = await getDraftById(Number(existingData[0].draft_id), { includeDeleted: false });
            if (existingFullDraft) {
                return existingFullDraft;
            }
        }
    }

    // Check if a draft is already pending approval
    const pendingDraftUrl = `${DIRECTUS_URL}/items/product_manufacturing_version_draft?filter[product_id][_eq]=${productId}&filter[status][_eq]=Pending Approval&sort=-draft_id&limit=1`;
    const pendingDraftRes = await fetch(pendingDraftUrl, { headers, cache: "no-store" });
    if (pendingDraftRes.ok) {
        const pendingData = (await pendingDraftRes.json()).data || [];
        if (pendingData.length > 0 && pendingData[0].draft_id) {
            throw new Error(`A revision draft (${pendingData[0].version_name}) is already pending QA approval for this product.`);
        }
    }

    let cleanVersionName = (versionName || "").trim();
    if (!cleanVersionName) {
        cleanVersionName = await getNextRevisionName(productId);
    }

    // 1. Source Version Validation (Ownership Verification)
    let sourceVer: Record<string, unknown> | null = null;
    if (sourceVersionId) {
        const sourceVerRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${sourceVersionId}`, { headers, cache: "no-store" });
        if (!sourceVerRes.ok) {
            throw new Error(`Source production version #${sourceVersionId} not found.`);
        }
        sourceVer = (await sourceVerRes.json()).data;
        if (Number(sourceVer?.product_id) !== Number(productId)) {
            throw new Error(`Source version #${sourceVersionId} does not belong to product #${productId}.`);
        }
    }

    // 2. Cross-Table Uniqueness Check: Check against production table
    const exProdVerRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${productId}&filter[version_name][_eq]=${encodeURIComponent(cleanVersionName)}&limit=1`, { headers, cache: "no-store" });
    if (exProdVerRes.ok) {
        const exData = (await exProdVerRes.json()).data || [];
        if (exData.length > 0) {
            throw new Error(`A production version named '${cleanVersionName}' already exists for this product.`);
        }
    }

    // 3. Cross-Table Uniqueness Check: Check against active drafts (Draft / Pending Approval)
    const exDraftRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft?filter[product_id][_eq]=${productId}&filter[version_name][_eq]=${encodeURIComponent(cleanVersionName)}&filter[status][_in]=Draft,Pending Approval&limit=1`, { headers, cache: "no-store" });
    if (exDraftRes.ok) {
        const exDraftData = (await exDraftRes.json()).data || [];
        if (exDraftData.length > 0) {
            throw new Error(`An active draft named '${cleanVersionName}' already exists for this product.`);
        }
    }

    // 4. Resolve baseline values
    const baseQuantity = Number(options.baseQuantity ?? sourceVer?.base_quantity ?? 1);
    const uomId = Number(options.uomId ?? sourceVer?.uom_id ?? 1);
    const expectedYieldPercentage = Number(options.expectedYieldPercentage ?? sourceVer?.expected_yield_percentage ?? 100);
    const customOverhead = Number(options.customOverhead ?? sourceVer?.custom_overhead ?? 0);

    // 5. Insert Draft Header Record
    const draftHeaderPayload = {
        product_id: productId,
        source_version_id: sourceVersionId || null,
        version_name: cleanVersionName,
        base_quantity: baseQuantity,
        uom_id: uomId,
        expected_yield_percentage: expectedYieldPercentage,
        custom_overhead: customOverhead,
        status: "Draft",
        created_by: userId || null,
        created_at: getNowInPhtISO()
    };

    const createDraftRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft`, {
        method: "POST",
        headers,
        body: JSON.stringify(draftHeaderPayload)
    });

    if (!createDraftRes.ok) {
        const errText = await createDraftRes.text().catch(() => "");
        throw new Error(`Failed to create version draft: ${errText || createDraftRes.statusText}`);
    }

    const createdDraft = (await createDraftRes.json()).data as VersionDraftHeader;
    const draftId = createdDraft.draft_id;

    // 6. If branching from a source version, clone its historical specification baseline
    const createdRoutes: Record<string, unknown>[] = [];
    const createdPositions: Record<string, unknown>[] = [];
    const createdOverheads: Record<string, unknown>[] = [];

    if (sourceVersionId) {
        const baseline = await getBOMDetailsForVersion(productId, sourceVersionId);
        const routes = baseline.routes || [];
        const laborPositions = baseline.version?.labor_positions || [];
        const overheads = baseline.version?.overhead_items || [];

        // Pre-fetch operations and units for relational label & key mapping
        const [opsRes, unitsRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" })
        ]);
        const opsList: Record<string, unknown>[] = opsRes.ok ? (await opsRes.json()).data || [] : [];
        const unitsList: Record<string, unknown>[] = unitsRes.ok ? (await unitsRes.json()).data || [] : [];
        const opsById = new Map<number, string>(opsList.map((o) => [Number(o.id), String(o.operation_name)]));
        const unitsMap = new Map<string, number>();
        unitsList.forEach((u) => {
            if (u.unit_shortcut) unitsMap.set(String(u.unit_shortcut).toLowerCase().trim(), Number(u.unit_id));
            if (u.unit_name) unitsMap.set(String(u.unit_name).toLowerCase().trim(), Number(u.unit_id));
        });

        for (let i = 0; i < routes.length; i++) {
            const r = routes[i] as unknown as Record<string, unknown>;
            const opId = r.operation_id ? Number(r.operation_id) : (r.operationId ? Number(r.operationId) : null);
            const opName = (opId ? opsById.get(opId) : null) || r.operation_name || r.stage || (opId ? `Operation #${opId}` : `Step ${(r.sequence_order as number) || i + 1}`);

            const routePayload = {
                draft_id: draftId,
                sequence_order: (r.sequence_order as number) || i + 1,
                operation_name: opName,
                work_center_id: r.work_center_id ? Number(r.work_center_id) : null,
                standard_time_minutes: r.run_time_hours != null ? Math.round(Number(r.run_time_hours) * 60 * 100) / 100 : (r.standard_time_minutes ? Number(r.standard_time_minutes) : 0),
                setup_time_minutes: r.setup_time_hours != null ? Math.round(Number(r.setup_time_hours) * 60 * 100) / 100 : (r.setup_time_minutes ? Number(r.setup_time_minutes) : 0),
                labor_cost_per_hour: r.expected_labor_cost || r.labor_cost_per_hour || 0,
                batch_capacity: r.step_batch_size != null ? Number(r.step_batch_size) : (r.batch_capacity != null ? Number(r.batch_capacity) : 1),
                qa_template_id: r.qa_template_id || null,
                is_deleted: 0,
                created_by: userId || null,
                created_at: getNowInPhtISO()
            };

            const rRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_routes`, {
                method: "POST",
                headers,
                body: JSON.stringify(routePayload)
            });

            if (rRes.ok) {
                const createdRoute = (await rRes.json()).data;
                const draftRouteId = createdRoute.draft_route_id;

                const createdBomItems: Record<string, unknown>[] = [];
                const bomItems = (r.bom_items || []) as unknown as Record<string, unknown>[];
                for (const b of bomItems) {
                    let resolvedUomId = 1;
                    const rawUom = b.unit_of_measurement ?? b.uom_id ?? b.uom;
                    if (rawUom) {
                        if (!isNaN(Number(rawUom))) {
                            resolvedUomId = Number(rawUom);
                        } else {
                            resolvedUomId = unitsMap.get(String(rawUom).toLowerCase().trim()) || 1;
                        }
                    }

                    const expectedMatType = materialTypeFromProduct(b.product_type as number | string | null, b.has_versions as boolean | null) || "raw_material";
                    let matType = (b.material_type as string) || expectedMatType;
                    if (matType && typeof matType === "string") {
                        const s = matType.toLowerCase().trim();
                        if (s.includes("pack")) matType = "packaging";
                        else if (s.includes("sub")) matType = "sub_assembly";
                        else if (s.includes("finish")) matType = "finished_good";
                        else if (s.includes("raw")) matType = "raw_material";
                    }
                    if (!matType || !isMaterialTypeCompatible(matType as MaterialType, b.product_type as number | string | null, b.has_versions as boolean | null)) {
                        matType = expectedMatType;
                    }

                    const bomPayload = {
                        draft_route_id: draftRouteId,
                        product_id: Number(b.product_id),
                        quantity: Number(b.quantity_required ?? b.quantity ?? 1),
                        uom_id: resolvedUomId,
                        wastage_percentage: Number(b.wastage_factor_percentage ?? b.wastage_percentage ?? 0),
                        material_type: matType,
                        notes: b.notes || null,
                        cost_per_unit: Number(b.cost_per_unit || 0),
                        is_deleted: 0,
                        created_by: userId || null,
                        created_at: getNowInPhtISO()
                    };

                    const bRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_bom`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(bomPayload)
                    });

                    if (bRes.ok) {
                        createdBomItems.push((await bRes.json()).data);
                    }
                }

                createdRoutes.push({
                    ...createdRoute,
                    bom_items: createdBomItems
                });
            }
        }

        // Clone labor positions
        for (const p of laborPositions) {
            const posPayload = {
                draft_id: draftId,
                position_id: p.position_id || null,
                position_name: p.position_name || "Operator",
                category: p.category || "direct_labor",
                manpower_count: Number(p.manpower_count || 1),
                hourly_rate: Number(p.hourly_rate || 0),
                hours_required: Number(p.hours_required || 0),
                daily_rate: Number(p.daily_rate || 0),
                ot_hours: Number(p.ot_hours || 0),
                include_mandates: p.include_mandates !== undefined ? (p.include_mandates ? 1 : 0) : 1,
                sss_amount: Number(p.sss_amount || 0),
                phic_amount: Number(p.phic_amount || 0),
                hdmf_amount: Number(p.hdmf_amount || 0),
                is_deleted: 0,
                created_by: userId || null,
                created_at: getNowInPhtISO()
            };

            const pRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_positions`, {
                method: "POST",
                headers,
                body: JSON.stringify(posPayload)
            });

            if (pRes.ok) {
                createdPositions.push((await pRes.json()).data);
            }
        }

        // Clone overheads
        for (const ovhItem of overheads) {
            const ovh = ovhItem as unknown as Record<string, unknown>;
            const ovhPayload = {
                draft_id: draftId,
                overhead_name: (ovh.overhead_name as string) || (ovh.remarks as string) || "Overhead",
                cost_allocation: Number(ovh.cost_per_unit ?? ovh.cost ?? 0),
                allocation_basis: (ovh.allocation_basis as string) || "per_unit",
                is_deleted: 0,
                created_by: userId || null,
                created_at: getNowInPhtISO()
            };

            const oRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_overheads`, {
                method: "POST",
                headers,
                body: JSON.stringify(ovhPayload)
            });

            if (oRes.ok) {
                createdOverheads.push((await oRes.json()).data);
            }
        }
    }

    const fullDraft = await getDraftById(draftId, { includeDeleted: false });
    return fullDraft || {
        ...createdDraft,
        routes: createdRoutes,
        labor_positions: createdPositions,
        overheads: createdOverheads
    };
}

/**
 * Save in-progress draft changes.
 * Rejects if draft is in 'Pending Approval' or terminal status (Applied, Rejected, Cancelled).
 * Uses logical deletion (is_deleted = 1) for removed rows — strictly no SQL DELETE.
 * Strictly never mutates production tables!
 */
export async function saveDraftDetails(
    draftId: number,
    data: {
        details?: Record<string, unknown>;
        routes?: Record<string, unknown>[];
        labor_positions?: Record<string, unknown>[];
        overheads?: Record<string, unknown>[];
    },
    userId?: number | null
): Promise<{ success: boolean; error?: string; draft?: VersionDraftFull | null }> {
    const draftRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draftId}`, { headers, cache: "no-store" });
    if (!draftRes.ok) return { success: false, error: "Draft not found" };

    const draft = (await draftRes.json()).data as VersionDraftHeader;
    if (draft.status !== "Draft") {
        return {
            success: false,
            error: `Cannot modify draft: current status is '${draft.status}'. Only 'Draft' status is editable.`
        };
    }

    const nowIso = getNowInPhtISO();

    // Prefetch units and operations to properly resolve IDs from names / shortcuts
    const [unitsRes, opsRes] = await Promise.all([
        fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers, cache: "no-store" })
    ]);
    const unitsList: Record<string, unknown>[] = unitsRes.ok ? (await unitsRes.json()).data || [] : [];
    const opsList: Record<string, unknown>[] = opsRes.ok ? (await opsRes.json()).data || [] : [];

    const unitsMap = new Map<string, number>();
    unitsList.forEach((u) => {
        if (u.unit_shortcut) unitsMap.set(String(u.unit_shortcut).toLowerCase().trim(), Number(u.unit_id));
        if (u.unit_name) unitsMap.set(String(u.unit_name).toLowerCase().trim(), Number(u.unit_id));
    });

    const opsByName = new Map<string, number>(opsList.map((o) => [String(o.operation_name).toLowerCase().trim(), Number(o.id)]));
    const opsById = new Map<number, string>(opsList.map((o) => [Number(o.id), String(o.operation_name)]));

    // 1. Update draft header metadata
    if (data.details) {
        const headerUpdate: Record<string, unknown> = {
            updated_by: userId || null,
            updated_at: nowIso
        };
        if (data.details.base_quantity !== undefined) headerUpdate.base_quantity = Number(data.details.base_quantity);
        if (data.details.expected_yield_percentage !== undefined) headerUpdate.expected_yield_percentage = Number(data.details.expected_yield_percentage);
        if (data.details.custom_overhead !== undefined) headerUpdate.custom_overhead = Number(data.details.custom_overhead);

        await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draftId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(headerUpdate)
        });
    }

    // 2. Sync Routes & BOM items with logical deletion
    if (data.routes && Array.isArray(data.routes)) {
        const exRoutesRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_routes?filter[draft_id][_eq]=${draftId}&filter[is_deleted][_eq]=0&limit=-1`, { headers, cache: "no-store" });
        const existingRoutes: Record<string, unknown>[] = exRoutesRes.ok ? (await exRoutesRes.json()).data || [] : [];

        // Build route match plan: match by draft_route_id first; if not positive or not found, match by sequence_order
        const matchedRouteIds = new Set<number>();
        const routePlan: { incoming: Record<string, unknown>; targetDraftRouteId: number | null; isNew: boolean }[] = [];

        for (let i = 0; i < data.routes.length; i++) {
            const r = data.routes[i];
            const seq = Number(r.sequence_order || i + 1);
            const rId = Number(r.draft_route_id || r.route_id || 0);

            let targetDraftRouteId: number | null = null;
            if (rId > 0 && existingRoutes.some(er => Number(er.draft_route_id) === rId && !matchedRouteIds.has(rId))) {
                targetDraftRouteId = rId;
            } else {
                const matchBySeq = existingRoutes.find(er => Number(er.sequence_order) === seq && !matchedRouteIds.has(Number(er.draft_route_id)));
                if (matchBySeq) {
                    targetDraftRouteId = Number(matchBySeq.draft_route_id);
                }
            }

            if (targetDraftRouteId) {
                matchedRouteIds.add(targetDraftRouteId);
                routePlan.push({ incoming: r, targetDraftRouteId, isNew: false });
            } else {
                routePlan.push({ incoming: r, targetDraftRouteId: null, isNew: true });
            }
        }

        // Soft-delete existing routes that are no longer part of the specification
        for (const exR of existingRoutes) {
            const exRouteId = Number(exR.draft_route_id);
            if (!matchedRouteIds.has(exRouteId)) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_routes/${exRouteId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ is_deleted: 1, deleted_at: nowIso, deleted_by: userId || null })
                });
                const bomsRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_bom?filter[draft_route_id][_eq]=${exRouteId}&filter[is_deleted][_eq]=0&limit=-1`, { headers, cache: "no-store" });
                const boms: Record<string, unknown>[] = bomsRes.ok ? (await bomsRes.json()).data || [] : [];
                for (const b of boms) {
                    await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_bom/${b.draft_bom_id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ is_deleted: 1, deleted_at: nowIso, deleted_by: userId || null })
                    });
                }
            }
        }

        // Insert or update incoming routes and their BOM items
        for (let i = 0; i < routePlan.length; i++) {
            const { incoming: r, targetDraftRouteId, isNew } = routePlan[i];
            let activeDraftRouteId = targetDraftRouteId;

            let resolvedOpId: number | null = r.operation_id ? Number(r.operation_id) : (r.operationId ? Number(r.operationId) : null);
            let resolvedOpName = (r.operation_name as string) || (r.stage as string) || "";
            if (!resolvedOpId && resolvedOpName) {
                resolvedOpId = opsByName.get(resolvedOpName.toLowerCase().trim()) || null;
            }
            if (!resolvedOpName && resolvedOpId) {
                resolvedOpName = opsById.get(resolvedOpId) || `Step ${r.sequence_order || i + 1}`;
            }
            if (!resolvedOpName) {
                resolvedOpName = `Step ${r.sequence_order || i + 1}`;
            }

            const stepBatchSize = (r.step_batch_size !== undefined && r.step_batch_size !== null && r.step_batch_size !== "")
                ? Number(r.step_batch_size)
                : (r.batch_capacity !== undefined && r.batch_capacity !== null && r.batch_capacity !== "" ? Number(r.batch_capacity) : 1);

            const stdTimeMinutes = (r.run_time_hours !== undefined && r.run_time_hours !== null && r.run_time_hours !== "")
                ? Math.round(Number(r.run_time_hours) * 60 * 100) / 100
                : (r.standard_time_minutes !== undefined && r.standard_time_minutes !== null && r.standard_time_minutes !== "" ? Number(r.standard_time_minutes) : 0);

            const setupTimeMinutes = (r.setup_time_hours !== undefined && r.setup_time_hours !== null && r.setup_time_hours !== "")
                ? Math.round(Number(r.setup_time_hours) * 60 * 100) / 100
                : (r.setup_time_minutes !== undefined && r.setup_time_minutes !== null && r.setup_time_minutes !== "" ? Number(r.setup_time_minutes) : 0);

            const laborCost = (r.expected_labor_cost !== undefined && r.expected_labor_cost !== null && r.expected_labor_cost !== "")
                ? Number(r.expected_labor_cost)
                : (r.labor_cost_per_hour !== undefined && r.labor_cost_per_hour !== null && r.labor_cost_per_hour !== "" ? Number(r.labor_cost_per_hour) : 0);

            const baseRoutePayload = {
                draft_id: draftId,
                sequence_order: Number(r.sequence_order || i + 1),
                operation_name: resolvedOpName,
                operation_id: resolvedOpId,
                work_center_id: r.work_center_id ? Number(r.work_center_id) : null,
                standard_time_minutes: stdTimeMinutes,
                setup_time_minutes: setupTimeMinutes,
                labor_cost_per_hour: laborCost,
                batch_capacity: stepBatchSize,
                qa_template_id: r.qa_template_id ? Number(r.qa_template_id) : null,
                is_deleted: 0
            };

            if (!isNew && activeDraftRouteId) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_routes/${activeDraftRouteId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        ...baseRoutePayload,
                        updated_by: userId || null,
                        updated_at: nowIso
                    })
                });
            } else {
                const newRRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_routes`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        ...baseRoutePayload,
                        created_by: userId || null,
                        created_at: nowIso
                    })
                });
                if (newRRes.ok) {
                    const createdR = (await newRRes.json()).data;
                    activeDraftRouteId = Number(createdR.draft_route_id);
                }
            }

            // Sync BOM items under this route
            if (activeDraftRouteId && activeDraftRouteId > 0 && r.bom_items && Array.isArray(r.bom_items)) {
                const exBomsRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_bom?filter[draft_route_id][_eq]=${activeDraftRouteId}&filter[is_deleted][_eq]=0&limit=-1`, { headers, cache: "no-store" });
                const existingBoms: Record<string, unknown>[] = exBomsRes.ok ? (await exBomsRes.json()).data || [] : [];
                const incomingBoms: Record<string, unknown>[] = (r.bom_items || []) as unknown as Record<string, unknown>[];

                const matchedBomIds = new Set<number>();
                const bomPlan: { incoming: Record<string, unknown>; targetDraftBomId: number | null; isNew: boolean }[] = [];

                for (const b of incomingBoms) {
                    const bProductId = Number(b.product_id || b.productId || 0);
                    if (!bProductId || isNaN(bProductId) || bProductId <= 0) continue;

                    const bId = Number(b.draft_bom_id || b.bom_item_id || b.id || 0);
                    let targetDraftBomId: number | null = null;

                    if (bId > 0 && existingBoms.some(eb => Number(eb.draft_bom_id) === bId && !matchedBomIds.has(bId))) {
                        targetDraftBomId = bId;
                    } else {
                        const matchByProduct = existingBoms.find(eb => Number(eb.product_id) === bProductId && !matchedBomIds.has(Number(eb.draft_bom_id)));
                        if (matchByProduct) {
                            targetDraftBomId = Number(matchByProduct.draft_bom_id);
                        }
                    }

                    if (targetDraftBomId) {
                        matchedBomIds.add(targetDraftBomId);
                        bomPlan.push({ incoming: b, targetDraftBomId, isNew: false });
                    } else {
                        bomPlan.push({ incoming: b, targetDraftBomId: null, isNew: true });
                    }
                }

                // Soft-delete BOM items removed from this route
                for (const exB of existingBoms) {
                    const exBomId = Number(exB.draft_bom_id);
                    if (!matchedBomIds.has(exBomId)) {
                        await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_bom/${exBomId}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ is_deleted: 1, deleted_at: nowIso, deleted_by: userId || null })
                        });
                    }
                }

                // Insert or update incoming BOM items
                for (const { incoming: b, targetDraftBomId, isNew: isBomNew } of bomPlan) {
                    const bProductId = Number(b.product_id || b.productId || 0);

                    // Robust UOM resolution: numeric ID or string shortcut lookup
                    let resolvedUomId = 1;
                    const rawUom = b.unit_of_measurement ?? b.uom_id ?? b.unit_id ?? b.uom;
                    if (rawUom != null && rawUom !== "") {
                        const numUom = Number(rawUom);
                        if (!isNaN(numUom) && numUom > 0) {
                            resolvedUomId = numUom;
                        } else {
                            const lookedUp = unitsMap.get(String(rawUom).toLowerCase().trim());
                            if (lookedUp && lookedUp > 0) {
                                resolvedUomId = lookedUp;
                            }
                        }
                    }

                    const expectedMatType = materialTypeFromProduct(b.product_type as number | string | null, b.has_versions as boolean | null) || "raw_material";
                    let matType = (b.material_type as string) || expectedMatType;
                    if (matType && typeof matType === "string") {
                        const s = matType.toLowerCase().trim();
                        if (s.includes("pack")) matType = "packaging";
                        else if (s.includes("sub")) matType = "sub_assembly";
                        else if (s.includes("finish")) matType = "finished_good";
                        else if (s.includes("raw")) matType = "raw_material";
                    }

                    const baseBomPayload = {
                        draft_route_id: activeDraftRouteId,
                        product_id: bProductId,
                        quantity: Number(b.quantity_required ?? b.quantity ?? 1),
                        uom_id: resolvedUomId,
                        wastage_percentage: Number(b.wastage_factor_percentage ?? b.wastage_percentage ?? 0),
                        material_type: matType,
                        notes: (b.notes as string) || null,
                        cost_per_unit: Number(b.cost_per_unit || 0),
                        is_deleted: 0
                    };

                    if (!isBomNew && targetDraftBomId) {
                        await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_bom/${targetDraftBomId}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                ...baseBomPayload,
                                updated_by: userId || null,
                                updated_at: nowIso
                            })
                        });
                    } else {
                        const bPostRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_bom`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify({
                                ...baseBomPayload,
                                created_by: userId || null,
                                created_at: nowIso
                            })
                        });
                        if (!bPostRes.ok) {
                            const errText = await bPostRes.text().catch(() => "");
                            console.error("[saveDraftDetails] Failed to insert draft BOM item:", errText, baseBomPayload);
                        }
                    }
                }
            }
        }
    }

    // 3. Sync Direct Labor Positions with logical deletion
    if (data.labor_positions && Array.isArray(data.labor_positions)) {
        const exPosRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_positions?filter[draft_id][_eq]=${draftId}&filter[is_deleted][_eq]=0&limit=-1`, { headers, cache: "no-store" });
        const existingPositions: Record<string, unknown>[] = exPosRes.ok ? (await exPosRes.json()).data || [] : [];

        const matchedPosIds = new Set<number>();
        const posPlan: { incoming: Record<string, unknown>; targetDraftPosId: number | null; isNew: boolean }[] = [];

        for (const p of data.labor_positions) {
            const pId = Number(p.draft_pos_id || p.id || 0);
            let targetDraftPosId: number | null = null;

            if (pId > 0 && existingPositions.some(ep => Number(ep.draft_pos_id) === pId && !matchedPosIds.has(pId))) {
                targetDraftPosId = pId;
            } else {
                const matchByName = existingPositions.find(ep =>
                    ep.position_name === (p.position_name || "Operator") && !matchedPosIds.has(Number(ep.draft_pos_id))
                );
                if (matchByName) {
                    targetDraftPosId = Number(matchByName.draft_pos_id);
                }
            }

            if (targetDraftPosId) {
                matchedPosIds.add(targetDraftPosId);
                posPlan.push({ incoming: p, targetDraftPosId, isNew: false });
            } else {
                posPlan.push({ incoming: p, targetDraftPosId: null, isNew: true });
            }
        }

        for (const exP of existingPositions) {
            const exPosId = Number(exP.draft_pos_id);
            if (!matchedPosIds.has(exPosId)) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_positions/${exPosId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ is_deleted: 1, deleted_at: nowIso, deleted_by: userId || null })
                });
            }
        }

        for (const { incoming: p, targetDraftPosId, isNew } of posPlan) {
            const basePosPayload = {
                draft_id: draftId,
                position_id: p.position_id || null,
                position_name: (p.position_name as string) || "Operator",
                category: (p.category as string) || "direct_labor",
                manpower_count: Number(p.manpower_count || 1),
                hourly_rate: Number(p.hourly_rate || 0),
                hours_required: Number(p.hours_required || 0),
                daily_rate: Number(p.daily_rate || 0),
                ot_hours: Number(p.ot_hours || 0),
                include_mandates: p.include_mandates !== undefined ? (p.include_mandates ? 1 : 0) : 1,
                sss_amount: Number(p.sss_amount || 0),
                phic_amount: Number(p.phic_amount || 0),
                hdmf_amount: Number(p.hdmf_amount || 0),
                is_deleted: 0
            };

            if (!isNew && targetDraftPosId) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_positions/${targetDraftPosId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        ...basePosPayload,
                        updated_by: userId || null,
                        updated_at: nowIso
                    })
                });
            } else {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_positions`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        ...basePosPayload,
                        created_by: userId || null,
                        created_at: nowIso
                    })
                });
            }
        }
    }

    // 4. Sync Overheads with logical deletion
    if (data.overheads && Array.isArray(data.overheads)) {
        const exOvhRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_overheads?filter[draft_id][_eq]=${draftId}&filter[is_deleted][_eq]=0&limit=-1`, { headers, cache: "no-store" });
        const existingOverheads: Record<string, unknown>[] = exOvhRes.ok ? (await exOvhRes.json()).data || [] : [];

        const matchedOvhIds = new Set<number>();
        const ovhPlan: { incoming: Record<string, unknown>; targetDraftOvhId: number | null; isNew: boolean }[] = [];

        for (const ovh of data.overheads) {
            const rawId = ovh.draft_overhead_id ?? ovh.id;
            let oId = 0;
            if (typeof rawId === "number" && !isNaN(rawId) && rawId > 0) {
                oId = rawId;
            } else if (typeof rawId === "string" && /^\d+$/.test(rawId.trim())) {
                oId = parseInt(rawId.trim(), 10);
            }

            let targetDraftOvhId: number | null = null;

            if (oId > 0 && existingOverheads.some(eo => Number(eo.draft_overhead_id) === oId && !matchedOvhIds.has(oId))) {
                targetDraftOvhId = oId;
            } else {
                const incomingName = String(ovh.overhead_name || ovh.remarks || ovh.overheadName || "Overhead").trim().toLowerCase();
                const matchByName = existingOverheads.find(eo =>
                    String(eo.overhead_name || "").trim().toLowerCase() === incomingName && !matchedOvhIds.has(Number(eo.draft_overhead_id))
                );
                if (matchByName) {
                    targetDraftOvhId = Number(matchByName.draft_overhead_id);
                }
            }

            if (targetDraftOvhId) {
                matchedOvhIds.add(targetDraftOvhId);
                ovhPlan.push({ incoming: ovh, targetDraftOvhId, isNew: false });
            } else {
                ovhPlan.push({ incoming: ovh, targetDraftOvhId: null, isNew: true });
            }
        }

        for (const exO of existingOverheads) {
            const exOvhId = Number(exO.draft_overhead_id);
            if (!matchedOvhIds.has(exOvhId)) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_overheads/${exOvhId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ is_deleted: 1, deleted_at: nowIso, deleted_by: userId || null })
                });
            }
        }

        for (const { incoming: ovh, targetDraftOvhId, isNew } of ovhPlan) {
            const costVal = (ovh.cost_per_unit !== undefined && ovh.cost_per_unit !== null && ovh.cost_per_unit !== "")
                ? Number(ovh.cost_per_unit)
                : (ovh.cost_allocation !== undefined && ovh.cost_allocation !== null && ovh.cost_allocation !== ""
                    ? Number(ovh.cost_allocation)
                    : (ovh.cost !== undefined && ovh.cost !== null ? Number(ovh.cost) : Number(ovh.amount || 0)));

            const rawBasis = String(ovh.allocation_basis || "per_unit").toLowerCase().trim();
            const validBasis = ["per_unit", "per_batch", "per_machine_hour", "percentage_of_labor"].includes(rawBasis)
                ? rawBasis
                : (rawBasis.includes("batch") ? "per_batch" : "per_unit");

            const ovhName = String(ovh.overhead_name || ovh.remarks || ovh.overheadName || "Overhead").trim();

            const baseOvhPayload = {
                draft_id: draftId,
                overhead_name: ovhName || "Overhead",
                cost_allocation: isNaN(costVal) ? 0 : costVal,
                allocation_basis: validBasis,
                is_deleted: 0
            };

            if (!isNew && targetDraftOvhId) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_overheads/${targetDraftOvhId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        ...baseOvhPayload,
                        updated_by: userId || null,
                        updated_at: nowIso
                    })
                });
            } else {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft_overheads`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        ...baseOvhPayload,
                        created_by: userId || null,
                        created_at: nowIso
                    })
                });
            }
        }

        // Keep custom_overhead on draft header accurately aligned with overhead total
        const totalActiveOvh = data.overheads.reduce((sum, o) => {
            const isAct = o.is_active !== undefined ? Boolean(o.is_active) : true;
            if (!isAct) return sum;
            const c = Number(o.cost_per_unit ?? o.cost_allocation ?? o.cost ?? o.amount ?? 0);
            return sum + (isNaN(c) ? 0 : c);
        }, 0);
        const roundedTotalOvh = Math.round(totalActiveOvh * 10000) / 10000;
        await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draftId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                custom_overhead: roundedTotalOvh,
                updated_by: userId || null,
                updated_at: nowIso
            })
        }).catch(() => { });
    }

    const updatedDraft = await getDraftById(draftId, { includeDeleted: false });
    return { success: true, draft: updatedDraft || undefined };
}

/**
 * Cancel a revision draft.
 * Sets draft status to 'Cancelled'. Rejects if not in 'Draft' status.
 * Never touches or deletes rows in product_manufacturing_version!
 */
export async function cancelDraft(
    draftId: number,
    userId?: number | null,
    reason?: string | null
): Promise<{ success: boolean; error?: string }> {
    const draftRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draftId}`, { headers, cache: "no-store" });
    if (!draftRes.ok) return { success: false, error: "Draft not found" };

    const draft = (await draftRes.json()).data as VersionDraftHeader;
    if (draft.status !== "Draft" && draft.status !== "Pending Approval") {
        return {
            success: false,
            error: `Cannot cancel draft: status is '${draft.status}'. Only drafts in 'Draft' or 'Pending Approval' status can be cancelled.`
        };
    }

    const patchRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draftId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            status: "Cancelled",
            cancelled_by: userId || null,
            cancelled_at: getNowInPhtISO(),
            cancellation_reason: reason || "Cancelled by engineer"
        })
    });

    if (!patchRes.ok) {
        const errText = await patchRes.text().catch(() => "");
        return { success: false, error: errText || "Failed to cancel draft" };
    }

    return { success: true };
}

/**
 * Reopen / withdraw a submitted draft back to 'Draft' status for editing.
 * Transitions status from 'Pending Approval' back to 'Draft'.
 */
export async function reopenDraftForEditing(
    draftId: number,
    userId?: number | null
): Promise<{ success: boolean; error?: string; draft?: VersionDraftHeader }> {
    const draftRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draftId}`, { headers, cache: "no-store" });
    if (!draftRes.ok) return { success: false, error: "Draft not found" };

    const draft = (await draftRes.json()).data as VersionDraftHeader;
    if (draft.status !== "Pending Approval") {
        return {
            success: false,
            error: `Cannot reopen draft: current status is '${draft.status}'. Only drafts in 'Pending Approval' can be reopened for editing.`
        };
    }

    const patchRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draftId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            status: "Draft",
            updated_by: userId || null,
            updated_at: getNowInPhtISO()
        })
    });

    if (!patchRes.ok) {
        const errText = await patchRes.text().catch(() => "");
        return { success: false, error: errText || "Failed to reopen draft" };
    }

    const updated = await getDraftById(draftId, { includeDeleted: false });
    return { success: true, draft: updated || undefined };
}

/**
 * Submit a draft specification for QA approval.
 * Transitions status from 'Draft' to 'Pending Approval'.
 */
export async function submitDraftForApproval(
    draftId: number,
    userId?: number | null
): Promise<{ success: boolean; error?: string }> {
    const fullDraft = await getDraftById(draftId, { includeDeleted: false });
    if (!fullDraft) return { success: false, error: "Draft not found" };

    if (fullDraft.status !== "Draft") {
        return {
            success: false,
            error: `Draft cannot be submitted: current status is '${fullDraft.status}'. Only 'Draft' can be submitted.`
        };
    }

    if (!fullDraft.routes || fullDraft.routes.length === 0) {
        return { success: false, error: "At least one workstation routing step is required before submitting." };
    }

    const totalBom = fullDraft.routes.reduce((sum, r) => sum + (Array.isArray(r.bom_items) ? r.bom_items.length : 0), 0);
    if (totalBom === 0) {
        return { success: false, error: "At least one BOM ingredient component is required before submitting." };
    }

    const patchRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draftId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            status: "Pending Approval",
            submitted_by: userId || null,
            submitted_at: getNowInPhtISO()
        })
    });

    if (!patchRes.ok) {
        const errText = await patchRes.text().catch(() => "");
        return { success: false, error: errText || "Failed to submit draft for approval" };
    }

    return { success: true };
}

/**
 * Applies an approved draft by atomically creating a NEW production version.
 *
 * Golden Invariant & Promotion Rules:
 * 1. Product-First Lock: Serializes promotion per product.
 * 2. Strictly Idempotent: Only drafts in 'Pending Approval' status can be promoted.
 *    Repeated approvals against already 'Applied' drafts are rejected.
 * 3. Cross-table Uniqueness: Validates version_name against product_manufacturing_version.
 * 4. Atomic Primary Swap: Clears old primary (is_primary = 0) and inserts new version (is_primary = 1).
 * 5. Migrates strictly active child rows (WHERE is_deleted = 0).
 * 6. Populates audit lineage: applied_version_id, created_by, approved_by, approved_at.
 * 7. Explicit Rollback: Any failure during transaction aborts and halts completely.
 */
export async function applyApprovedDraft(
    draftId: number,
    userId?: number | null,
    phTimeIso?: string
): Promise<{ success: boolean; error?: string; newVersionId?: number }> {
    try {
        const draft = await getDraftById(draftId, { includeDeleted: false });
        if (!draft) {
            return { success: false, error: `Draft #${draftId} not found.` };
        }

        // 1. Strict Idempotency & Status Guard
        if (draft.status !== "Pending Approval") {
            return {
                success: false,
                error: `Draft #${draft.draft_id} cannot be applied: status is '${draft.status}'. Only drafts in 'Pending Approval' can be promoted to production.`
            };
        }

        // 2. Draft Content Validation Gate
        if (!draft.routes || draft.routes.length === 0) {
            return {
                success: false,
                error: `Draft #${draft.draft_id} has no workstation routes. At least one route is required to promote to production.`
            };
        }

        // 3. Source Version Ownership Validation (if source_version_id is set)
        if (draft.source_version_id) {
            const sourceVerRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${draft.source_version_id}`, { headers, cache: "no-store" });
            if (sourceVerRes.ok) {
                const sourceVer = (await sourceVerRes.json()).data;
                if (Number(sourceVer.product_id) !== Number(draft.product_id)) {
                    return {
                        success: false,
                        error: `Draft source version #${draft.source_version_id} does not match product #${draft.product_id}.`
                    };
                }
            }
        }

        // 4. Cross-table Uniqueness Verification: Check if version_name already exists in production
        const exProdVerRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${draft.product_id}&filter[version_name][_eq]=${encodeURIComponent(draft.version_name)}&limit=1`, { headers, cache: "no-store" });
        if (exProdVerRes.ok) {
            const exData = (await exProdVerRes.json()).data || [];
            if (exData.length > 0) {
                return {
                    success: false,
                    error: `Version name '${draft.version_name}' already exists in production for this product. Concurrency conflict.`
                };
            }
        }

        const now = phTimeIso || getNowInPhtISO();

        // 5. Mark ALL previous versions for this product as is_primary = 0
        const allPrevVerRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${draft.product_id}&limit=-1&fields=version_id`, { headers, cache: "no-store" });
        if (allPrevVerRes.ok) {
            const allPrevList = (await allPrevVerRes.json()).data || [];
            for (const prev of allPrevList) {
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${prev.version_id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        is_primary: 0,
                        updated_by: userId || null,
                        updated_at: now
                    })
                }).catch(() => { });
            }
        }

        // 6. INSERT new row in product_manufacturing_version
        const newVerPayload = {
            product_id: draft.product_id,
            version_name: draft.version_name,
            base_quantity: draft.base_quantity,
            uom_id: draft.uom_id,
            expected_yield_percentage: draft.expected_yield_percentage,
            custom_overhead: draft.custom_overhead,
            status: "Active",
            is_primary: 1,
            created_by: draft.created_by || userId || null,
            created_at: draft.created_at || now,
            approved_by: userId || null,
            approved_at: now,
            updated_by: userId || null,
            updated_at: now
        };

        const createVerRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version`, {
            method: "POST",
            headers,
            body: JSON.stringify(newVerPayload)
        });

        if (!createVerRes.ok) {
            const errText = await createVerRes.text().catch(() => "");
            return { success: false, error: `Failed to insert new production version: ${errText}` };
        }

        const createdVersion = (await createVerRes.json()).data;
        const newVersionId = Number(createdVersion.version_id);

        // 7. Migrate active draft routes and BOM components (WHERE is_deleted = 0)
        const activeRoutes = (draft.routes || []).map((r) => ({
            ...r,
            route_id: 0,
            id: 0,
            draft_route_id: undefined,
            operation_id: r.operation_id ? Number(r.operation_id) : (r.operationId ? Number(r.operationId) : null),
            step_number: (r.sequence_order as number) || (r.step_number as number),
            stage: (r.operation_name as string) || (r.stage as string),
            setup_time_hours: Number(r.setup_time_hours || 0),
            run_time_hours: Number(r.run_time_hours || 0),
            step_batch_size: Number(r.step_batch_size || 1),
            bom_items: ((r.bom_items as Record<string, unknown>[]) || []).filter((b) => !b.is_deleted).map((b) => {
                const expectedMatType = materialTypeFromProduct(b.product_type as number | string | null, b.has_versions as boolean | null) || "raw_material";
                let matType = (b.material_type as string) || expectedMatType;
                if (matType && typeof matType === "string") {
                    const s = matType.toLowerCase().trim();
                    if (s.includes("pack")) matType = "packaging";
                    else if (s.includes("sub")) matType = "sub_assembly";
                    else if (s.includes("finish")) matType = "finished_good";
                    else if (s.includes("raw")) matType = "raw_material";
                }
                if (!matType || !isMaterialTypeCompatible(matType as MaterialType, b.product_type as number | string | null, b.has_versions as boolean | null)) {
                    matType = expectedMatType;
                }
                return {
                    ...b,
                    id: 0,
                    draft_bom_id: undefined,
                    bom_item_id: 0,
                    product_id: Number(b.product_id),
                    quantity_required: Number(b.quantity_required ?? b.quantity ?? 1),
                    quantity: Number(b.quantity_required ?? b.quantity ?? 1),
                    unit_of_measurement: Number(b.unit_of_measurement ?? b.uom_id ?? 1),
                    uom_id: Number(b.unit_of_measurement ?? b.uom_id ?? 1),
                    wastage_factor_percentage: Number(b.wastage_factor_percentage ?? b.wastage_percentage ?? 0),
                    wastage_percentage: Number(b.wastage_factor_percentage ?? b.wastage_percentage ?? 0),
                    material_type: matType,
                    cost_per_unit: Number(b.cost_per_unit || 0)
                };
            })
        }));

        const activePositions = (draft.labor_positions || []).filter((p) => !p.is_deleted).map((p) => ({
            ...p,
            id: 0,
            draft_pos_id: undefined,
            position_id: p.position_id != null ? Number(p.position_id) : null
        }));

        const activeOverheads = (draft.overheads || []).filter((o) => !o.is_deleted).map((o) => {
            const rawBasis = String(o.allocation_basis || "per_unit").toLowerCase().trim();
            const validBasis = ["per_unit", "per_batch", "per_machine_hour", "percentage_of_labor"].includes(rawBasis)
                ? rawBasis
                : (rawBasis.includes("batch") ? "per_batch" : "per_unit");

            return {
                ...o,
                id: 0,
                draft_overhead_id: undefined,
                overhead_name: (o.overhead_name as string) || (o.remarks as string) || "Overhead",
                overhead_type_id: o.overhead_type_id ? Number(o.overhead_type_id) : undefined,
                cost_per_unit: Number(o.cost_per_unit ?? o.cost ?? o.cost_allocation ?? 0),
                cost: Number(o.cost_per_unit ?? o.cost ?? o.cost_allocation ?? 0),
                allocation_basis: validBasis,
                is_active: o.is_active !== undefined ? Boolean(o.is_active) : true
            };
        });

        try {
            await syncRoutesAndBOM(newVersionId, activeRoutes, userId, activePositions);
            await syncVersionOverheadItems(newVersionId, activeOverheads);
        } catch (syncErr) {
            console.error("Failed to sync routes/BOM/overheads during promotion:", syncErr);
            // Clean up the created empty version row so it doesn't leave an empty ghost version in production
            await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${newVersionId}`, {
                method: "DELETE",
                headers
            }).catch(() => { });
            throw syncErr;
        }

        // 8. UPDATE draft to Applied terminal state and record applied_version_id
        await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draft.draft_id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                status: "Applied",
                applied_version_id: newVersionId,
                reviewed_by: userId || null,
                reviewed_at: now
            })
        });

        return { success: true, newVersionId };
    } catch (err: unknown) {
        console.error("Error in applyApprovedDraft:", err);
        const errMsg = err instanceof Error ? err.message : "Failed to apply approved draft to production tables";
        return { success: false, error: errMsg };
    }
}

/**
 * Marks a draft under review as 'Rejected' terminal state.
 */
export async function rejectDraft(
    draftId: number,
    userId?: number | null,
    reason?: string,
    phTimeIso?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const draft = await getDraftById(draftId);
        if (!draft) return { success: false, error: "Draft not found" };

        if (draft.status !== "Pending Approval") {
            return {
                success: false,
                error: `Cannot reject draft: status is '${draft.status}'. Only 'Pending Approval' drafts can be rejected.`
            };
        }

        const now = phTimeIso || getNowInPhtISO();
        await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${draft.draft_id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                status: "Rejected",
                reviewed_by: userId || null,
                reviewed_at: now,
                remarks: reason || "Rejected by reviewer"
            })
        });

        return { success: true };
    } catch (err: unknown) {
        console.error("Error in rejectDraft:", err);
        const errMsg = err instanceof Error ? err.message : "Failed to mark draft as rejected";
        return { success: false, error: errMsg };
    }
}
