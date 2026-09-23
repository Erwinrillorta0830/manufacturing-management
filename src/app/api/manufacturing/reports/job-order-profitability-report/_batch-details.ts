import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { buildQAYieldAssessments } from "@/app/api/manufacturing/production/_qa-accepted-output";
import type { ProfitabilityBatchDetails } from "@/modules/manufacturing-management/job-order-profitability-report/types";
import { buildLaborCost, buildMaterialCost, buildOverheadCost, inventoryCostKey, type DirectusRow } from "./_cost-calculations";

const PAGE_SIZE = 100;

function asRecord(value: unknown): DirectusRow | null {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as DirectusRow : null;
}

function relationId(value: unknown, keys: string[] = ["id"]): number {
    const record = asRecord(value);
    const raw = record
        ? [...keys, "id"].map((key) => record[key]).find((candidate) => candidate !== undefined && candidate !== null)
        : value;
    const parsed = Number(raw || 0);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function id(row: DirectusRow, field: string, relationKeys: string[] = ["id"]): number {
    return relationId(row[field], relationKeys);
}

function text(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizedBatch(value: unknown): string {
    return text(value).toUpperCase();
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function fetchRows(
    collection: string,
    fields: string,
    query: URLSearchParams,
    signal: AbortSignal
): Promise<DirectusRow[]> {
    const rows: DirectusRow[] = [];
    let offset = 0;
    let count: number | null = null;
    while (true) {
        const params = new URLSearchParams(query);
        params.set("fields", fields);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        params.set("meta", "filter_count");
        const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
            headers,
            cache: "no-store",
            signal
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.data)) throw new Error(`${collection} lookup failed with HTTP ${response.status}.`);
        const page = payload.data as DirectusRow[];
        rows.push(...page);
        const reportedCount = Number(payload.meta?.filter_count);
        if (Number.isFinite(reportedCount)) count = reportedCount;
        offset += page.length;
        if (page.length === 0 || (count !== null ? offset >= count : page.length < PAGE_SIZE)) break;
    }
    return rows;
}

async function fetchRowsByIds(
    collection: string,
    fields: string,
    field: string,
    values: number[],
    signal: AbortSignal
): Promise<DirectusRow[]> {
    const unique = [...new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0))];
    if (unique.length === 0) return [];
    const chunks: number[][] = [];
    for (let index = 0; index < unique.length; index += PAGE_SIZE) chunks.push(unique.slice(index, index + PAGE_SIZE));
    const rows: DirectusRow[] = [];
    for (let index = 0; index < chunks.length; index += 4) {
        const group = chunks.slice(index, index + 4);
        const pages = await Promise.all(group.map(async (ids) => {
            const params = new URLSearchParams({
                [`filter[${field}][_in]`]: ids.join(","),
                fields,
                limit: "-1"
            });
            const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
                headers,
                cache: "no-store",
                signal
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !Array.isArray(payload?.data)) throw new Error(`${collection} lookup failed with HTTP ${response.status}.`);
            return payload.data as DirectusRow[];
        }));
        rows.push(...pages.flat());
    }
    return rows;
}

function groupById(rows: DirectusRow[], field: string, relationKeys: string[] = ["id"]): Map<number, DirectusRow[]> {
    const grouped = new Map<number, DirectusRow[]>();
    for (const row of rows) {
        const key = id(row, field, relationKeys);
        if (key) grouped.set(key, [...(grouped.get(key) || []), row]);
    }
    return grouped;
}

export async function getProfitabilityBatchDetails(ledgerId: number, signal: AbortSignal): Promise<ProfitabilityBatchDetails | null> {
    const targetRows = await fetchRows(
        "manufacturing_job_order_yield_ledger",
        "ledger_id,job_order_id,yield_quantity,rejected_quantity,commit_status,lot_number,mm_lot_id,manufacturing_date",
        new URLSearchParams({ "filter[ledger_id][_eq]": String(ledgerId) }),
        signal
    );
    const target = targetRows.find((row) => id(row, "ledger_id", ["ledger_id", "id"]) === ledgerId);
    const jobOrderId = target ? id(target, "job_order_id", ["job_order_id", "id"]) : 0;
    if (!target || !jobOrderId) return null;

    const [jobOrders, yields, routes, genealogy] = await Promise.all([
        fetchRows("manufacturing_job_orders", "job_order_id,branch_id", new URLSearchParams({ "filter[job_order_id][_eq]": String(jobOrderId) }), signal),
        fetchRows("manufacturing_job_order_yield_ledger", "ledger_id,job_order_id,yield_quantity,rejected_quantity,commit_status,lot_number,mm_lot_id,manufacturing_date", new URLSearchParams({ "filter[job_order_id][_eq]": String(jobOrderId) }), signal),
        fetchRows("manufacturing_job_order_routes", "jo_route_id,job_order_id,sequence_order,operation_name,work_center_id,actual_setup_hours,actual_run_hours", new URLSearchParams({ "filter[job_order_id][_eq]": String(jobOrderId) }), signal),
        fetchRows("jo_material_genealogy", "job_order_id,batch_no,component_product_id,component_mm_lot_id,component_lot_id,component_batch_no,consumed_quantity", new URLSearchParams({ "filter[job_order_id][_eq]": String(jobOrderId) }), signal)
    ]);
    const ledgerIds = yields.map((row) => id(row, "ledger_id", ["ledger_id", "id"])).filter(Boolean);
    const inspections = await fetchRowsByIds(
        "manufacturing_daily_qa_inspections",
        "ledger_id,jo_route_id,sensory_status,lab_status,action_taken,weight_check_passed",
        "ledger_id",
        ledgerIds,
        signal
    );
    const yieldById = new Map(yields.map((row) => [id(row, "ledger_id", ["ledger_id", "id"]), row]));
    const accepted = buildQAYieldAssessments(yields, inspections, routes).filter((assessment) =>
        String(yieldById.get(assessment.ledgerId)?.commit_status || "").trim().toUpperCase() === "COMMITTED"
        && assessment.qaStatus === "Passed"
        && assessment.goodQuantity > 0
    );
    const targetAssessment = accepted.find((assessment) => assessment.ledgerId === ledgerId);
    if (!targetAssessment) return null;
    const acceptedGoodQuantity = accepted.reduce((sum, assessment) => sum + assessment.goodQuantity, 0);
    const batchShare = acceptedGoodQuantity > 0 ? targetAssessment.goodQuantity / acceptedGoodQuantity : 0;
    const batchNumber = text(target.lot_number) || text(target.batch_no) || "N/A";
    const normalizedTargetBatch = normalizedBatch(batchNumber);
    const batchGenealogy = genealogy.filter((row) => normalizedBatch(row.batch_no) === normalizedTargetBatch);
    const routeIds = routes.map((row) => id(row, "jo_route_id", ["jo_route_id", "id"])).filter(Boolean);
    const inventoryLotIds = batchGenealogy.map((row) =>
        id(row, "component_mm_lot_id", ["lot_id", "id"]) || id(row, "component_lot_id", ["lot_id", "id"])
    ).filter(Boolean);
    const productIds = batchGenealogy.map((row) => id(row, "component_product_id", ["product_id", "id"])).filter(Boolean);

    const [operators, inventoryLots, products, mmLots, workCenters] = await Promise.all([
        fetchRowsByIds("manufacturing_job_order_route_operators", "jo_route_operator_id,jo_route_id,operator_id,logged_hours,hourly_rate", "jo_route_id", routeIds, signal),
        fetchRowsByIds("mm_inventory_lots", "inventory_lot_id,lot_id,product_id,branch_id,batch_no,unit_cost", "lot_id", inventoryLotIds, signal),
        fetchRowsByIds("products", "product_id,product_name,product_code", "product_id", productIds, signal),
        fetchRowsByIds("mm_lots", "lot_id,lot_name", "lot_id", inventoryLotIds, signal),
        fetchRowsByIds("manufacturing_work_centers", "work_center_id,work_center_name,overhead_cost_per_hour", "work_center_id", routes.map((row) => id(row, "work_center_id", ["work_center_id", "id"])), signal)
    ]);
    const operatorIds = operators.map((row) => id(row, "operator_id", ["user_id", "id"])).filter(Boolean);
    const users = await fetchRowsByIds("user", "user_id,user_fname,user_lname", "user_id", operatorIds, signal).catch((error) => {
        if (signal.aborted) throw error;
        return [];
    });
    const genealogyByJobOrderBatch = new Map([[`${jobOrderId}:${normalizedTargetBatch}`, batchGenealogy]]);
    const inventoryLotsByKey = new Map<string, DirectusRow[]>();
    for (const lot of inventoryLots) {
        const key = inventoryCostKey(
            id(lot, "lot_id", ["lot_id", "id"]),
            id(lot, "product_id", ["product_id", "id"]),
            id(lot, "branch_id", ["branch_id", "id"]),
            text(lot.batch_no)
        );
        inventoryLotsByKey.set(key, [...(inventoryLotsByKey.get(key) || []), lot]);
    }
    const routeById = new Map(routes.map((row) => [id(row, "jo_route_id", ["jo_route_id", "id"]), row]));
    const routeIdsByJobOrder = new Map([[jobOrderId, routeIds]]);
    const operatorByRoute = groupById(operators, "jo_route_id", ["jo_route_id", "id"]);
    const userById = new Map(users.map((row) => [id(row, "user_id", ["user_id", "id"]), row]));
    const workCenterById = new Map(workCenters.map((row) => [id(row, "work_center_id", ["work_center_id", "id"]), row]));
    const lotNameById = new Map(mmLots.map((row) => [id(row, "lot_id", ["lot_id", "id"]), text(row.lot_name)]));
    const productById = new Map(products.map((row) => [id(row, "product_id", ["product_id", "id"]), row]));
    const branchId = id(jobOrders[0] || {}, "branch_id", ["id"]);

    const materials = buildMaterialCost(jobOrderId, batchNumber, branchId, genealogyByJobOrderBatch, inventoryLotsByKey, lotNameById, productById, true);
    const labor = buildLaborCost(jobOrderId, routeIdsByJobOrder, operatorByRoute, routeById, userById, true);
    const overhead = buildOverheadCost(jobOrderId, routeIdsByJobOrder, routeById, workCenterById, true);
    return {
        materials: materials.lines,
        labor: labor.lines.map((line) => ({
            operatorName: line.label,
            operationName: line.operationName,
            hours: line.hours,
            hourlyRate: line.hourlyRate,
            batchCost: line.amount === null ? null : roundMoney(line.amount * batchShare)
        })),
        overhead: overhead.lines.map((line) => ({
            operationName: line.operationName,
            workCenterName: line.label,
            hours: line.hours,
            hourlyRate: line.hourlyRate,
            batchCost: line.amount === null ? null : roundMoney(line.amount * batchShare)
        }))
    };
}
