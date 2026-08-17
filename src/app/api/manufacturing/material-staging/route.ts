import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusMaterial {
    jo_material_id?: number;
    id?: number;
    job_order_id?: number | { job_order_id?: number };
    product_id?: number | { product_id?: number; product_name?: string; product_code?: string; unit_of_measurement?: { unit_shortcut?: string } };
    uom_id?: number;
    allocated_quantity?: number;
    reserved_quantity?: number;
    actual_consumed_quantity?: number;
    scrap_quantity?: number;
    reservation_status?: string;
    staging_bin?: string;
}

interface DirectusAllocation {
    allocation_id?: number;
    id?: number;
    job_order_id?: number | { job_order_id?: number };
    jo_material_id?: number;
    product_id?: number;
    lot_id?: number;
    batch_no?: string;
    allocated_quantity?: number;
    reserved_quantity?: number;
    staging_bin?: string;
    reservation_status?: string;
    override_negative?: boolean;
    created_at?: string;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchFilter = searchParams.get("branchId");
        const statusFilter = searchParams.get("status");
        const search = searchParams.get("search")?.toLowerCase().trim();

        // 1. Fetch data concurrently
        const [
            joRes,
            materialsRes,
            allocationsRes,
            reservationsRes,
            productsRes,
            workCentersRes,
            branchesRes,
            movementsRes,
            receivingRes,
            yieldsRes
        ] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&sort=-job_order_id`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&sort=work_center_name`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&sort=branch_name&fields=id,branch_name,branch_code`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/inventory_movements?limit=-1&sort=-movement_id`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?limit=-1&fields=purchase_order_product_id,product_id,batch_no,lot_no,qa_status,expiry_date,received_quantity`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&fields=*,job_order_id.product_id,job_order_id.job_order_no`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        const rawJOs = joRes.ok ? (await joRes.json()).data || [] : [];
        const rawMaterials: DirectusMaterial[] = materialsRes && materialsRes.ok ? (await materialsRes.json()).data || [] : [];
        const rawAllocations: DirectusAllocation[] = allocationsRes && allocationsRes.ok ? (await allocationsRes.json()).data || [] : [];
        const rawReservations = reservationsRes && reservationsRes.ok ? (await reservationsRes.json()).data || [] : [];
        const rawProducts = productsRes.ok ? (await productsRes.json()).data || [] : [];
        const rawWorkCenters = workCentersRes && workCentersRes.ok ? (await workCentersRes.json()).data || [] : [];
        const rawBranches = branchesRes && branchesRes.ok ? (await branchesRes.json()).data || [] : [];
        const rawMovements = movementsRes && movementsRes.ok ? (await movementsRes.json()).data || [] : [];
        const rawReceiving = receivingRes && receivingRes.ok ? (await receivingRes.json()).data || [] : [];
        const rawYields = yieldsRes && yieldsRes.ok ? (await yieldsRes.json()).data || [] : [];

        // Maps for quick lookup
        const productMap = new Map<number, { product_id: number; product_name: string; product_code: string; uom: string }>();
        rawProducts.forEach((p: { product_id: number; product_name: string; product_code: string; unit_of_measurement?: { unit_shortcut?: string } }) => {
            productMap.set(Number(p.product_id), {
                product_id: Number(p.product_id),
                product_name: p.product_name || `Product #${p.product_id}`,
                product_code: p.product_code || `PRD-${p.product_id}`,
                uom: p.unit_of_measurement?.unit_shortcut || "units"
            });
        });

        const workCenterMap = new Map<number, string>();
        rawWorkCenters.forEach((wc: { work_center_id: number; work_center_name: string }) => {
            workCenterMap.set(Number(wc.work_center_id), wc.work_center_name);
        });

        const branchMap = new Map<number, { id: number; branchName: string; branchCode?: string }>();
        rawBranches.forEach((b: { id: number; branch_name: string; branch_code?: string }) => {
            branchMap.set(Number(b.id), {
                id: Number(b.id),
                branchName: b.branch_name,
                branchCode: b.branch_code
            });
        });

        // Compute on-hand stock by product and batch from inventory movements
        // key: `${productId}:${batchNo}` -> number
        const stockByProductBatch = new Map<string, number>();
        const stockByProduct = new Map<number, number>();

        rawMovements.forEach((m: { product_id?: number | { product_id?: number }; batch_no?: string; quantity?: number }) => {
            const pId = typeof m.product_id === "object" ? Number(m.product_id?.product_id) : Number(m.product_id);
            const batchNo = (m.batch_no || "LOT-N/A").trim() || "LOT-N/A";
            const qty = Number(m.quantity || 0);
            if (pId) {
                const key = `${pId}:${batchNo}`;
                stockByProductBatch.set(key, (stockByProductBatch.get(key) || 0) + qty);
                stockByProduct.set(pId, (stockByProduct.get(pId) || 0) + qty);
            }
        });

        // Map QA & Expiry metadata from receiving & yield ledger
        const lotMetadataMap = new Map<string, { qa_status: string; expiry_date: string | null }>();
        rawReceiving.forEach((r: { product_id?: number | { product_id?: number }; batch_no?: string; lot_no?: string; qa_status?: string; expiry_date?: string }) => {
            const pId = typeof r.product_id === "object" ? Number(r.product_id?.product_id) : Number(r.product_id);
            const batchNo = String(r.batch_no || r.lot_no || "LOT-N/A").trim() || "LOT-N/A";
            if (pId) {
                lotMetadataMap.set(`${pId}:${batchNo}`, {
                    qa_status: r.qa_status || "Passed",
                    expiry_date: r.expiry_date || null
                });
            }
        });

        rawYields.forEach((yl: { job_order_id?: { product_id?: number }; lot_number?: string; qa_status?: string; expiry_date?: string }) => {
            const pId = Number(yl.job_order_id?.product_id);
            const batchNo = String(yl.lot_number || "LOT-N/A").trim() || "LOT-N/A";
            if (pId) {
                lotMetadataMap.set(`${pId}:${batchNo}`, {
                    qa_status: yl.qa_status || "Passed",
                    expiry_date: yl.expiry_date || null
                });
            }
        });

        const getJoId = (val: unknown): number => {
            if (!val) return 0;
            if (typeof val === "object") {
                const obj = val as Record<string, unknown>;
                return Number(obj.job_order_id || obj.id || 0);
            }
            return Number(val);
        };

        // Combine reservations and allocations
        const allAllocationsByJo = new Map<number, DirectusAllocation[]>();
        rawAllocations.forEach((alloc) => {
            const joId = getJoId(alloc.job_order_id);
            if (joId) {
                const list = allAllocationsByJo.get(joId) || [];
                list.push(alloc);
                allAllocationsByJo.set(joId, list);
            }
        });

        rawReservations.forEach((res: {
            id?: number;
            job_order_id?: number | { job_order_id?: number };
            jo_material_id?: number | { job_order_id?: number };
            product_id?: number;
            batch_no?: string;
            reserved_quantity?: number;
            staging_bin?: string;
            reservation_status?: string;
        }) => {
            const joId = getJoId(res.job_order_id) || (typeof res.jo_material_id === "object" ? getJoId(res.jo_material_id?.job_order_id) : 0);
            if (joId) {
                const list = allAllocationsByJo.get(joId) || [];
                list.push({
                    allocation_id: res.id,
                    job_order_id: joId,
                    jo_material_id: typeof res.jo_material_id === "number" ? res.jo_material_id : undefined,
                    product_id: Number(res.product_id),
                    batch_no: res.batch_no,
                    allocated_quantity: Number(res.reserved_quantity || 0),
                    reserved_quantity: Number(res.reserved_quantity || 0),
                    staging_bin: res.staging_bin || "MAIN-STORE",
                    reservation_status: res.reservation_status || "SOFT"
                });
                allAllocationsByJo.set(joId, list);
            }
        });

        // Assemble Job Orders
        const transformedJOs = rawJOs.map((jo: {
            job_order_id?: number;
            id?: number;
            job_order_no: string;
            parent_job_order_id?: number | null;
            product_id: number;
            version_id?: number | null;
            target_quantity?: number;
            completed_quantity?: number;
            rejected_quantity?: number;
            status: string;
            primary_work_center_id?: number | null;
            shift_option?: string | null;
            branch_id?: number | null;
            remarks?: string | null;
            created_at?: string;
        }) => {
            const joId = Number(jo.job_order_id || jo.id || 0);
            const joProduct = productMap.get(Number(jo.product_id));
            const wcName = jo.primary_work_center_id ? (workCenterMap.get(Number(jo.primary_work_center_id)) || `Work Center #${jo.primary_work_center_id}`) : "General Assembly";
            const branchInfo = jo.branch_id ? branchMap.get(Number(jo.branch_id)) : null;

            // Suggested Floor Staging Bin naming convention: FLOOR-STAGING-[WorkCenterID]
            const suggestedStagingBin = jo.primary_work_center_id
                ? `FLOOR-STAGING-${jo.primary_work_center_id}`
                : `FLOOR-STAGING-WC01`;

            // Filter materials belonging to this JO
            const joMaterials = rawMaterials.filter((m) => getJoId(m.job_order_id) === joId);
            const joAllocs = allAllocationsByJo.get(joId) || [];

            let totalMaterialsCount = 0;
            let stagedMaterialsCount = 0;
            let hasAnyShortage = false;

            const mappedMaterials = joMaterials.map((mat) => {
                const mProductId = typeof mat.product_id === "object" ? Number(mat.product_id?.product_id) : Number(mat.product_id);
                const matProdInfo = productMap.get(mProductId);
                const requiredQty = Number(mat.allocated_quantity || 0);
                const matId = Number(mat.jo_material_id || mat.id || 0);

                // Find allocations for this specific material
                const relatedAllocs = joAllocs.filter((a) => {
                    if (a.jo_material_id && matId) return Number(a.jo_material_id) === matId;
                    return Number(a.product_id) === mProductId;
                });

                const allocatedLots = relatedAllocs.map((al, idx) => {
                    const lotNo = (al.batch_no || `LOT-${jo.job_order_no}-${idx + 1}`).trim();
                    const lotMeta = lotMetadataMap.get(`${mProductId}:${lotNo}`);
                    const onHandLotQty = stockByProductBatch.get(`${mProductId}:${lotNo}`) ?? 0;
                    const resStatus = (al.reservation_status === "HARD" || al.staging_bin?.startsWith("FLOOR-STAGING")) ? "HARD" : "SOFT";
                    const isStaged = resStatus === "HARD" || al.staging_bin?.startsWith("FLOOR-STAGING");
                    const allocQty = Number(al.allocated_quantity || al.reserved_quantity || requiredQty);

                    return {
                        allocation_id: al.allocation_id || al.id,
                        lot_id: al.lot_id || idx + 1,
                        batch_no: lotNo,
                        allocated_quantity: allocQty,
                        staged_quantity: isStaged ? allocQty : 0,
                        expiry_date: lotMeta?.expiry_date || null,
                        qa_status: lotMeta?.qa_status || "Passed",
                        reservation_status: resStatus as "SOFT" | "HARD",
                        staging_bin: al.staging_bin || (isStaged ? suggestedStagingBin : "MAIN-STORE"),
                        source_bin: "MAIN-STORE",
                        on_hand_lot_quantity: Math.max(0, onHandLotQty),
                        override_negative: al.override_negative || false,
                        created_at: al.created_at || null
                    };
                });

                // If no specific lot allocations exist, synthesize a default allocation from available stock
                if (allocatedLots.length === 0 && requiredQty > 0) {
                    const defaultOnHand = stockByProduct.get(mProductId) || 0;
                    allocatedLots.push({
                        allocation_id: undefined,
                        lot_id: 1,
                        batch_no: `LOT-${mProductId}-MAIN`,
                        allocated_quantity: requiredQty,
                        staged_quantity: 0,
                        expiry_date: null,
                        qa_status: "Passed",
                        reservation_status: "SOFT" as const,
                        staging_bin: "MAIN-STORE",
                        source_bin: "MAIN-STORE",
                        on_hand_lot_quantity: Math.max(0, defaultOnHand),
                        override_negative: false,
                        created_at: null
                    });
                }

                const totalAllocatedQty = allocatedLots.reduce((sum, l) => sum + l.allocated_quantity, 0);
                const totalStagedQty = allocatedLots.reduce((sum, l) => sum + l.staged_quantity, 0);
                const onHandStock = stockByProduct.get(mProductId) || 0;
                const shortageQty = Math.max(0, requiredQty - onHandStock);
                const isItemShort = onHandStock < requiredQty && totalStagedQty < requiredQty;

                if (isItemShort) hasAnyShortage = true;
                totalMaterialsCount++;
                const isFullyStaged = totalStagedQty >= requiredQty && requiredQty > 0;
                if (isFullyStaged) stagedMaterialsCount++;

                const overallResStatus: "SOFT" | "HARD" = (isFullyStaged || allocatedLots.every((l) => l.reservation_status === "HARD")) ? "HARD" : "SOFT";

                return {
                    jo_material_id: matId,
                    job_order_id: joId,
                    product_id: mProductId,
                    product_name: matProdInfo?.product_name || `Component #${mProductId}`,
                    product_code: matProdInfo?.product_code || `SKU-${mProductId}`,
                    uom: matProdInfo?.uom || "units",
                    required_quantity: requiredQty,
                    allocated_quantity: totalAllocatedQty,
                    staged_quantity: totalStagedQty,
                    on_hand_quantity: Math.max(0, onHandStock),
                    shortage_quantity: shortageQty,
                    reservation_status: overallResStatus,
                    staging_bin: isFullyStaged ? suggestedStagingBin : "MAIN-STORE",
                    is_staged: isFullyStaged,
                    has_shortage: isItemShort,
                    allocations: allocatedLots
                };
            });

            const stagingPct = totalMaterialsCount > 0
                ? Math.round((stagedMaterialsCount / totalMaterialsCount) * 100)
                : 0;

            const allStaged = totalMaterialsCount > 0 && stagedMaterialsCount === totalMaterialsCount;

            const joResStatus: "SOFT" | "HARD" | "PARTIAL" = allStaged
                ? "HARD"
                : stagedMaterialsCount > 0
                    ? "PARTIAL"
                    : "SOFT";

            return {
                job_order_id: joId,
                job_order_no: jo.job_order_no,
                parent_job_order_id: jo.parent_job_order_id ? Number(jo.parent_job_order_id) : null,
                product_id: Number(jo.product_id),
                product_name: joProduct?.product_name || `Product #${jo.product_id}`,
                product_code: joProduct?.product_code || `PRD-${jo.product_id}`,
                version_id: jo.version_id ? Number(jo.version_id) : null,
                target_quantity: Number(jo.target_quantity || 0),
                completed_quantity: Number(jo.completed_quantity || 0),
                rejected_quantity: Number(jo.rejected_quantity || 0),
                status: jo.status,
                primary_work_center_id: jo.primary_work_center_id ? Number(jo.primary_work_center_id) : null,
                primary_work_center_name: wcName,
                suggested_staging_bin: suggestedStagingBin,
                shift_option: jo.shift_option || "Shift 1 (Day)",
                branch_id: jo.branch_id ? Number(jo.branch_id) : null,
                branch_name: branchInfo?.branchName || "Main Facility",
                remarks: jo.remarks || null,
                materials: mappedMaterials,
                total_materials_count: totalMaterialsCount,
                staged_materials_count: stagedMaterialsCount,
                staging_percentage: stagingPct,
                reservation_status: joResStatus,
                has_shortage: hasAnyShortage,
                all_staged: allStaged,
                created_at: jo.created_at || null
            };
        });

        // Apply search & branch filters
        let filtered = transformedJOs;

        if (branchFilter && branchFilter !== "all") {
            const bId = Number(branchFilter);
            filtered = filtered.filter((j: { branch_id: number | null }) => j.branch_id === bId);
        }

        if (statusFilter && statusFilter !== "all") {
            const sf = statusFilter.toUpperCase();
            filtered = filtered.filter((j: { status: string }) => j.status?.toUpperCase() === sf || (sf === "PLANNED" && (j.status === "Draft" || j.status === "Planned")));
        }

        if (search) {
            filtered = filtered.filter((j: { job_order_no: string; product_name: string; product_code: string; primary_work_center_name: string }) =>
                j.job_order_no?.toLowerCase().includes(search) ||
                j.product_name?.toLowerCase().includes(search) ||
                j.product_code?.toLowerCase().includes(search) ||
                j.primary_work_center_name?.toLowerCase().includes(search)
            );
        }

        // Summary KPI statistics
        const stats = {
            totalActiveJobs: transformedJOs.filter((j: { status: string }) => ["PLANNED", "RESERVED", "Planned", "Reserved", "Proceed", "In Progress"].includes(j.status)).length,
            plannedJobs: transformedJOs.filter((j: { status: string }) => ["PLANNED", "Planned", "Draft"].includes(j.status)).length,
            reservedJobs: transformedJOs.filter((j: { status: string }) => ["RESERVED", "Reserved"].includes(j.status)).length,
            fullyStagedJobs: transformedJOs.filter((j: { all_staged: boolean }) => j.all_staged).length,
            pendingStagingJobs: transformedJOs.filter((j: { all_staged: boolean }) => !j.all_staged).length,
            shortageAlertJobs: transformedJOs.filter((j: { has_shortage: boolean }) => j.has_shortage).length
        };

        return NextResponse.json({
            success: true,
            data: filtered,
            stats,
            workCenters: rawWorkCenters.map((w: { work_center_id: number; work_center_name: string; is_active?: boolean }) => ({
                work_center_id: Number(w.work_center_id),
                work_center_name: w.work_center_name,
                is_active: w.is_active !== undefined ? Boolean(Number(w.is_active)) : true
            })),
            branches: Array.from(branchMap.values())
        });
    } catch (e) {
        console.error("[Material Staging GET API] Error:", e);
        return NextResponse.json(
            { success: false, error: (e as Error).message || "Failed to fetch material staging data" },
            { status: 500 }
        );
    }
}
