/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import {
    JOB_ORDER_MODULE_PATHS,
    JobOrderModuleAccessError,
    requireJobOrderModuleAccess
} from "@/app/api/manufacturing/job-orders/_module-access";
import {
    buildQAYieldAssessments,
    isCommittedYieldLedger,
    verifiedYieldOutputTotalsByJobOrder,
} from "../_qa-accepted-output";
import { qaRecordAfterRevocation, yieldAuditRowsAfterRevocation } from "../qa-release";
import {
    isCancelledJobOrderStatus,
    normalizeJobOrderStatus,
} from "@/modules/manufacturing-management/job-order-status";
import {
    getJobOrderClosureReadiness,
    type JobOrderClosureReadiness,
} from "../../job-orders/_workflow-service";
import { productionYieldImageUrl } from "@/modules/manufacturing-management/production-workflow/services/production-yield-image";
import { directusFileMetadata, fetchDirectusFileMetadata } from "@/app/api/manufacturing/_directus-file-metadata";
import { getYieldOutputTotals } from "@/modules/manufacturing-management/manufacturing-job-order-inspection-qa/utils/yield-output-quantities";
import { calculateQAOutputAllocationCapacities } from "@/modules/manufacturing-management/manufacturing-qa/qa-output-allocation";
import { buildJobOrderDailyYieldSummaryPage } from "@/modules/manufacturing-management/manufacturing-job-order-inspection-qa/utils/summary-query";
import {
    dailyQAParameterAuditKey,
    indexSavedDailyQAParameters,
} from "@/modules/manufacturing-management/manufacturing-job-order-inspection-qa/utils/saved-daily-qa-parameters";
import { buildYieldQAStatusCountIndex, buildYieldSummaryIndex } from "./_yield-summary-index";
import type { JobOrderDailyYieldSummaryQuery } from "@/modules/manufacturing-management/manufacturing-job-order-inspection-qa/types";
import type { YieldEvidenceChannel } from "@/modules/manufacturing-management/manufacturing-job-order-inspection-qa/utils/yield-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(DIRECTUS_STATIC_TOKEN
        ? { Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}` }
        : {})
};

type DirectusRow = Record<string, any>;

class JobOrderInspectionQAError extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message);
        this.name = "JobOrderInspectionQAError";
    }
}

function relationId(value: unknown, keys: string[] = ["id"]): number {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of [...keys, "id"]) {
            const candidate = relationId(record[key], keys);
            if (candidate > 0) return candidate;
        }
        return 0;
    }
    const candidate = Number(value);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

function numberValue(value: unknown): number {
    const candidate = Number(value ?? 0);
    return Number.isFinite(candidate) ? candidate : 0;
}

function shelfLifeDaysValue(value: unknown): number | null {
    const candidate = Number(value);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
}

function textValue(value: unknown): string {
    return String(value ?? "").trim();
}

function activeParameterRowsForRevokedYields(
    parameterRows: DirectusRow[],
    yields: DirectusRow[]
): DirectusRow[] {
    const yieldsByLedger = new Map(yields.map((row) => [ledgerId(row), row]));
    return parameterRows.filter((row) => {
        const marker = textValue(row.remarks).match(/^Daily QA Audit \| Yield Log ID: (\d+) \|/);
        const yieldRow = marker ? yieldsByLedger.get(Number(marker[1])) : undefined;
        if (!yieldRow?.qa_revoked_at) return true;
        return qaRecordAfterRevocation(row, yieldRow.qa_revoked_at);
    });
}

function productUomValue(product: DirectusRow | undefined): string | null {
    if (!product) return null;
    const uom = product.unit_of_measurement;
    if (uom && typeof uom === "object") {
        return textValue(uom.unit_shortcut) || textValue(uom.unit_name) || null;
    }
    return textValue(uom) || null;
}

function directusFileId(value: unknown): string | null {
    if (value && typeof value === "object") {
        const record = value as DirectusRow;
        return directusFileId(record.id ?? record.file_id);
    }
    const id = textValue(value);
    return id || null;
}

function dateValue(value: unknown): string | null {
    const valueText = textValue(value);
    return valueText ? valueText.slice(0, 10) : null;
}

function timestampValue(value: unknown): string | null {
    const valueText = textValue(value);
    return valueText || null;
}

function sortTimestamp(value: unknown): number {
    const timestamp = Date.parse(textValue(value));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

async function readJson(response: Response, label: string): Promise<any> {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new JobOrderInspectionQAError(
            response.status >= 400 && response.status < 500 ? 502 : 503,
            `${label} failed with HTTP ${response.status}.`
        );
    }
    if (!payload || payload.data === undefined) {
        throw new JobOrderInspectionQAError(502, `${label} returned an invalid response.`);
    }
    return payload.data;
}

async function readRows(path: string, label: string): Promise<DirectusRow[]> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${path}`, {
            headers,
            cache: "no-store"
        });
    } catch (error) {
        throw new JobOrderInspectionQAError(
            503,
            `${label} could not be reached: ${error instanceof Error ? error.message : "network error"}.`
        );
    }

    const data = await readJson(response, label);
    if (!Array.isArray(data)) {
        throw new JobOrderInspectionQAError(502, `${label} returned an invalid collection.`);
    }
    return data;
}

async function readRecord(path: string, label: string): Promise<DirectusRow> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${path}`, {
            headers,
            cache: "no-store"
        });
    } catch (error) {
        throw new JobOrderInspectionQAError(
            503,
            `${label} could not be reached: ${error instanceof Error ? error.message : "network error"}.`
        );
    }

    const data = await readJson(response, label);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new JobOrderInspectionQAError(502, `${label} returned an invalid record.`);
    }
    return data;
}

function jobOrderId(row: DirectusRow): number {
    return relationId(row.job_order_id, ["job_order_id", "id"])
        || relationId(row.id, ["id"]);
}

function ledgerId(row: DirectusRow): number {
    return relationId(row.ledger_id, ["ledger_id", "id"])
        || relationId(row.id, ["id"]);
}

function routeId(row: DirectusRow): number {
    return relationId(row.jo_route_id, ["jo_route_id", "id"])
        || relationId(row.id, ["id"]);
}

function formatJobOrderStatus(value: unknown): string {
    return normalizeJobOrderStatus(value) || textValue(value) || "Unknown";
}

async function readRowsForIds(
    collection: string,
    filterField: string,
    ids: number[],
    fields: string,
    label: string
): Promise<DirectusRow[]> {
    const uniqueIds = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
    const batches: number[][] = [];
    for (let index = 0; index < uniqueIds.length; index += 100) {
        batches.push(uniqueIds.slice(index, index + 100));
    }

    const rows: DirectusRow[] = [];
    for (let index = 0; index < batches.length; index += 4) {
        const results = await Promise.all(batches.slice(index, index + 4).map((batch) => {
            const query = new URLSearchParams({
                [`filter[${filterField}][_in]`]: batch.join(","),
                limit: "-1",
                fields,
            });
            return readRows(`/items/${collection}?${query.toString()}`, label);
        }));
        rows.push(...results.flat());
    }
    return rows;
}

async function loadJobOrderSummaries(jobOrderIds?: number[]) {
    const yieldsQuery = new URLSearchParams({
        limit: "-1",
        fields: "ledger_id,job_order_id,commit_status,yield_quantity,qa_accepted_quantity,qa_rejected_quantity,qa_revoked_through_audit_id,rejected_quantity,scrap_quantity,logged_at,production_date",
    });
    if (jobOrderIds?.length) {
        yieldsQuery.set("filter[job_order_id][_in]", [...new Set(jobOrderIds)].join(","));
    }
    const yields = await readRows(
        `/items/manufacturing_job_order_yield_ledger?${yieldsQuery.toString()}`,
        "Yield ledger lookup"
    );
    const committedYields = yields.filter(isCommittedYieldLedger);
    const candidateJobOrderIds = [...new Set(
        committedYields.map((row) => jobOrderId(row)).filter(Boolean)
    )];
    if (candidateJobOrderIds.length === 0) return [];

    const jobOrders = await readRowsForIds(
        "manufacturing_job_orders",
        "job_order_id",
        candidateJobOrderIds,
        "job_order_id,job_order_no,status,product_id,branch_id,target_quantity,created_at,modified_at",
        "Job Order lookup"
    );
    const eligibleJobOrders = jobOrders.filter((row) => (
        jobOrderId(row) > 0 && !isCancelledJobOrderStatus(row.status)
    ));
    const eligibleJobOrderIds = eligibleJobOrders.map(jobOrderId);
    if (eligibleJobOrderIds.length === 0) return [];

    const eligibleJobOrderIdSet = new Set(eligibleJobOrderIds);
    const relevantYields = committedYields.filter((row) => eligibleJobOrderIdSet.has(jobOrderId(row)));
    const relevantLedgerIds = [...new Set(relevantYields.map(ledgerId).filter(Boolean))];
    const productIds = [...new Set(
        eligibleJobOrders.map((row) => relationId(row.product_id, ["product_id", "id"])).filter(Boolean)
    )];
    const [products, routes, inspections] = await Promise.all([
        readRowsForIds(
            "products",
            "product_id",
            productIds,
            "product_id,product_name,product_code,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name",
            "Product lookup"
        ),
        readRowsForIds(
            "manufacturing_job_order_routes",
            "job_order_id",
            eligibleJobOrderIds,
            "jo_route_id,job_order_id",
            "Job Order routing lookup"
        ),
        readRowsForIds(
            "manufacturing_daily_qa_inspections",
            "ledger_id",
            relevantLedgerIds,
            "daily_qa_id,ledger_id,jo_route_id,sensory_status,lab_status,action_taken,weight_check_passed,inspected_at",
            "Daily QA inspection lookup"
        ),
    ]);

    const productsById = new Map<number, DirectusRow>(
        products.map((product) => [relationId(product.product_id, ["product_id", "id"]), product])
    );
    const yieldsByJobOrder = buildYieldSummaryIndex(
        relevantYields,
        jobOrderId,
        (yieldRow) => yieldRow.logged_at || yieldRow.production_date
    );
    const assessments = buildQAYieldAssessments(relevantYields, inspections, routes);
    const verifiedOutputByJobOrder = verifiedYieldOutputTotalsByJobOrder(assessments);
    const qaStatusCountsByJobOrder = buildYieldQAStatusCountIndex(
        assessments,
        (assessment) => assessment.jobOrderId,
        (assessment) => assessment.qaStatus
    );

    return eligibleJobOrders.map((jobOrder) => {
        const id = jobOrderId(jobOrder);
        const yieldSummary = yieldsByJobOrder.get(id);
        const qaStatusCounts = qaStatusCountsByJobOrder.get(id);
        const verifiedOutput = verifiedOutputByJobOrder.get(id);
        const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
        const product = productsById.get(productId);
        return {
            jobOrderId: id,
            jobOrderNo: textValue(jobOrder.job_order_no) || `JO-${id}`,
            status: formatJobOrderStatus(jobOrder.status),
            productId: productId || null,
            productName: textValue(product?.product_name) || (productId ? `Product #${productId}` : "—"),
            productCode: textValue(product?.product_code) || null,
            productUom: productUomValue(product),
            branchId: relationId(jobOrder.branch_id, ["branch_id", "id"]) || null,
            targetQuantity: numberValue(jobOrder.target_quantity),
            producedQuantity: verifiedOutput?.acceptedQuantity || 0,
            verifiedRejectedQuantity: verifiedOutput?.rejectedQuantity || 0,
            verifiedTotalProducedQuantity: verifiedOutput?.totalProducedQuantity || 0,
            yieldCount: yieldSummary?.count || 0,
            pendingYieldCount: qaStatusCounts?.pendingYieldCount || 0,
            discrepancyYieldCount: qaStatusCounts?.discrepancyYieldCount || 0,
            unresolvedYieldCount: qaStatusCounts?.unresolvedYieldCount || 0,
            latestYieldAt: yieldSummary?.latestYieldAt ?? null,
            createdAt: timestampValue(jobOrder.created_at),
            modifiedAt: timestampValue(jobOrder.modified_at),
        };
    });
}

async function loadJobOrderSummaryByNumber(jobOrderNo: string) {
    const query = new URLSearchParams({
        "filter[job_order_no][_eq]": jobOrderNo,
        limit: "1",
        fields: "job_order_id",
    });
    const rows = await readRows(`/items/manufacturing_job_orders?${query.toString()}`, "Job Order lookup");
    const id = rows[0] ? jobOrderId(rows[0]) : 0;
    if (!id) return null;
    return (await loadJobOrderSummaries([id]))[0] || null;
}

function parseSummaryQuery(searchParams: URLSearchParams): JobOrderDailyYieldSummaryQuery {
    const integerParam = (name: string, fallback: number) => {
        const parsed = Number(searchParams.get(name));
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
    };
    return {
        page: integerParam("page", 1),
        pageSize: integerParam("pageSize", 8),
        search: textValue(searchParams.get("search")),
        status: textValue(searchParams.get("status")),
        productId: textValue(searchParams.get("productId")),
        dateFrom: textValue(searchParams.get("dateFrom")),
        dateTo: textValue(searchParams.get("dateTo")),
        flaggedOnly: searchParams.get("flaggedOnly") === "true",
    };
}

async function loadJobOrderDetails(id: number, canRevokeYieldAudit: boolean) {
    const [jobOrder, yields, inspections, routes, qaParameterRows] = await Promise.all([
        readRecord(
            `/items/manufacturing_job_orders/${encodeURIComponent(String(id))}?fields=job_order_id,job_order_no,status,product_id,branch_id,target_quantity,completed_quantity`,
            `Job Order ${id} lookup`
        ),
        readRows(
            `/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${encodeURIComponent(String(id))}&limit=-1&sort=-logged_at&fields=ledger_id,job_order_id,commit_status,yield_quantity,rejected_quantity,qa_accepted_quantity,qa_rejected_quantity,qa_status,qa_revoked_at,qa_revoked_by,qa_revoke_reason,qa_revoked_through_audit_id,scrap_quantity,mm_lot_id,lot_number,manufacturing_date,expiry_date,rejected_mm_lot_id,rejected_lot_number,rejected_manufacturing_date,rejected_expiry_date,daily_qa_image_id,shift_name,session_key,production_date,logged_at,logged_by`,
            `Yield ledger lookup for Job Order ${id}`
        ),
        readRows(
            `/items/manufacturing_daily_qa_inspections?filter[job_order_id][_eq]=${encodeURIComponent(String(id))}&limit=-1&sort=-inspected_at,-daily_qa_id&fields=daily_qa_id,job_order_id,ledger_id,jo_route_id,inspector_id,moisture_percentage,acidity_ph,sensory_status,weight_check_passed,lab_status,action_taken,inspected_at,remarks`,
            `Daily QA inspection lookup for Job Order ${id}`
        ),
        readRows(
            `/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${encodeURIComponent(String(id))}&limit=-1&fields=jo_route_id,job_order_id,operation_id,sequence_order,qa_template_id,status`,
            `Routing lookup for Job Order ${id}`
        ),
        readRows(
            `/items/manufacturing_job_order_qa_records?filter[job_order_id][_eq]=${encodeURIComponent(String(id))}&limit=-1&sort=-inspected_at&fields=jo_route_id,parameter_id,value_text,value_numeric,value_boolean,is_passed,inspected_at,remarks`,
            `QA parameter lookup for Job Order ${id}`
        ),
    ]);

    const actualJobOrderId = jobOrderId(jobOrder);
    if (actualJobOrderId !== id) {
        throw new JobOrderInspectionQAError(404, `Job Order ${id} was not found.`);
    }
    if (isCancelledJobOrderStatus(jobOrder.status)) {
        throw new JobOrderInspectionQAError(404, `Job Order ${id} is cancelled and is not available in this queue.`);
    }

    const revokedByIds = [...new Set(yields
        .filter((row) => Boolean(row.qa_revoked_at))
        .map((row) => relationId(row.qa_revoked_by, ["user_id", "id"]))
        .filter((userId) => userId > 0))];
    const revokedByNames = new Map<number, string>();
    if (revokedByIds.length > 0) {
        const userParams = new URLSearchParams({
            "filter[user_id][_in]": revokedByIds.join(","),
            fields: "user_id,user_fname,user_lname",
            limit: "-1"
        });
        try {
            const users = await readRows(`/items/user?${userParams.toString()}`, "QA revocation user lookup");
            for (const user of users) {
                const userId = relationId(user.user_id, ["user_id", "id"]);
                const name = [user.user_fname, user.user_lname]
                    .map(textValue)
                    .filter(Boolean)
                    .join(" ");
                if (userId > 0 && name) revokedByNames.set(userId, name);
            }
        } catch (error) {
            console.warn(`Unable to resolve QA revocation user names for Job Order ${id}:`, error);
        }
    }

    const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
    const operationIds = [...new Set(
        routes.map((route) => relationId(route.operation_id, ["operation_id", "id"])).filter(Boolean)
    )];
    const [products, operations] = await Promise.all([
        readRowsForIds(
            "products",
            "product_id",
            productId ? [productId] : [],
            "product_id,product_name,product_code,product_shelf_life,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name",
            "Product lookup"
        ),
        readRowsForIds(
            "manufacturing_operations",
            "id",
            operationIds,
            "id,operation_name",
            "Manufacturing operation lookup"
        ),
    ]);
    const product = products.find((row) => relationId(row.product_id, ["product_id", "id"]) === productId);
    const operationsById = new Map<number, string>(
        operations.map((operation) => [
            relationId(operation.id, ["id"]),
            textValue(operation.operation_name)
        ])
    );
    const routeModels = routes
        .map((route) => {
            const routeIdentifier = routeId(route);
            const operationId = relationId(route.operation_id, ["operation_id", "id"]);
            const qaTemplateId = relationId(route.qa_template_id, ["qa_template_id", "template_id", "id"])
                || relationId(route.qa_template, ["qa_template_id", "template_id", "id"]);
            return {
                id: routeIdentifier,
                sequenceOrder: numberValue(route.sequence_order),
                name: operationsById.get(operationId) || textValue(route.operation_name) || `Step #${routeIdentifier}`,
                qaTemplateId: qaTemplateId || null,
                status: textValue(route.status) || null
            };
        })
        .filter((route) => route.id > 0)
        .sort((left, right) => left.sequenceOrder - right.sequenceOrder || left.id - right.id);

    const committedYields = yields.filter(isCommittedYieldLedger);
    const yieldsByLedgerId = new Map(committedYields.map((row) => [ledgerId(row), row]));
    const activeInspections = inspections.filter((inspection) => {
        const yieldRow = yieldsByLedgerId.get(ledgerId(inspection));
        return !yieldRow || yieldAuditRowsAfterRevocation(yieldRow, [inspection]).length > 0;
    });
    const currentQaParameterRows = activeParameterRowsForRevokedYields(qaParameterRows, committedYields);
    const savedParametersByAudit = indexSavedDailyQAParameters(currentQaParameterRows);
    const inspectionsWithParameters = activeInspections.map((inspection) => ({
        ...inspection,
        qaParameters: savedParametersByAudit.get(
            dailyQAParameterAuditKey(ledgerId(inspection), routeId(inspection))
        ) || [],
    }));

    const qaAllocationCapacities = calculateQAOutputAllocationCapacities(committedYields);
    const yieldLedgerIds = committedYields.map(ledgerId).filter(Boolean);
    const outputAllocationRows = yieldLedgerIds.length > 0
        ? await readRows(
            `/items/manufacturing_job_order_yield_allocations?filter[ledger_id][_in]=${yieldLedgerIds.join(",")}&limit=-1&sort=sort_order,allocation_id&fields=allocation_id,ledger_id,allocation_type,allocation_key,quantity,mm_lot_id,batch_no,manufacturing_date,expiry_date,rejection_reason_id`,
            "Yield output allocation lookup"
        )
        : [];
    const rejectionReasonIds = [...new Set(outputAllocationRows
        .map((row) => relationId(row.rejection_reason_id, ["id"]))
        .filter(Boolean))];
    const rejectionReasonRows = rejectionReasonIds.length > 0
        ? await readRows(
            `/items/qa_rejection_reasons?filter[id][_in]=${rejectionReasonIds.join(",")}&limit=-1&fields=id,reason_name`,
            "QA rejection reason lookup"
        )
        : [];
    const rejectionReasonNames = new Map<number, string>(
        rejectionReasonRows.map((row) => [relationId(row.id), textValue(row.reason_name)])
    );
    const outputAllocationsByLedger = new Map<number, DirectusRow[]>();
    for (const allocationRow of outputAllocationRows) {
        const currentLedgerId = relationId(allocationRow.ledger_id, ["ledger_id", "id"]);
        if (!currentLedgerId) continue;
        const current = outputAllocationsByLedger.get(currentLedgerId) || [];
        current.push(allocationRow);
        outputAllocationsByLedger.set(currentLedgerId, current);
    }
    const assessmentsByLedger = new Map(
        buildQAYieldAssessments(committedYields, inspectionsWithParameters, routes)
            .map((assessment) => [assessment.ledgerId, assessment] as const)
    );
    const evidenceLedgerIds = committedYields.map(ledgerId).filter(Boolean);
    let yieldEvidenceRows: DirectusRow[] = [];
    let yieldEvidenceAvailable = true;
    let yieldEvidenceWarning: string | null = null;
    if (evidenceLedgerIds.length > 0) {
        try {
            yieldEvidenceRows = await readRows(
                `/items/manufacturing_job_order_yield_evidence?filter[ledger_id][_in]=${evidenceLedgerIds.join(",")}&limit=-1&sort=sort_order,evidence_id&fields=evidence_id,ledger_id,directus_file_id,evidence_type,uploaded_by,uploaded_at,sort_order,file_size`,
                "Yield evidence lookup"
            );
        } catch (error) {
            // The legacy ledger image remains readable while the evidence migration is being rolled out.
            yieldEvidenceAvailable = false;
            yieldEvidenceWarning = "Yield evidence is temporarily unavailable. Only legacy shift evidence is displayed.";
            console.warn("Yield evidence collection is unavailable; displaying legacy shift evidence only:", error);
        }
    }
    const evidenceFileIds = [
        ...committedYields.map((yieldRow) => directusFileId(yieldRow.daily_qa_image_id)),
        ...yieldEvidenceRows.map((row) => directusFileId(row.directus_file_id))
    ];
    const evidenceFilesById = await fetchDirectusFileMetadata(evidenceFileIds);
    const evidenceRowsByLedger = new Map<number, DirectusRow[]>();
    for (const evidenceRow of yieldEvidenceRows) {
        const currentLedgerId = relationId(evidenceRow.ledger_id, ["ledger_id", "id"]);
        if (!currentLedgerId) continue;
        const existing = evidenceRowsByLedger.get(currentLedgerId) || [];
        existing.push(evidenceRow);
        evidenceRowsByLedger.set(currentLedgerId, existing);
    }

    const yieldRows = committedYields
        .map((yieldRow) => {
            const currentLedgerId = ledgerId(yieldRow);
            const assessment = assessmentsByLedger.get(currentLedgerId);
            const audits = assessment?.audits || [];
            const outcome = assessment?.outcome || {
                status: "Pending" as const,
                hasFailure: false,
                isComplete: false
            };
            const goodQuantity = Math.max(0, numberValue(yieldRow.yield_quantity));
            const rejectedQuantity = Math.max(0, numberValue(yieldRow.rejected_quantity));
            const scrapQuantity = Math.max(0, numberValue(yieldRow.scrap_quantity));
            const outputTotals = getYieldOutputTotals(goodQuantity, rejectedQuantity, scrapQuantity);
            const qaAcceptedQuantity = Math.max(0, numberValue(yieldRow.qa_accepted_quantity ?? goodQuantity));
            const qaRejectedQuantity = Math.max(0, numberValue(yieldRow.qa_rejected_quantity ?? outputTotals.rejectedQuantity));
            const allocationCapacity = qaAllocationCapacities?.byLedgerId.get(currentLedgerId);
            const mmLotId = relationId(yieldRow.mm_lot_id, ["mm_lot_id", "lot_id", "id"]);
            const rejectedMmLotId = relationId(yieldRow.rejected_mm_lot_id, ["mm_lot_id", "lot_id", "id"]);
            const savedOutputAllocations = outputAllocationsByLedger.get(currentLedgerId) || [];
            const mapOutputAllocation = (allocationRow: DirectusRow) => {
                const rejectionReasonId = relationId(allocationRow.rejection_reason_id, ["id"]) || null;
                return {
                    allocationId: relationId(allocationRow.allocation_id, ["allocation_id", "id"]) || null,
                    allocationKey: textValue(allocationRow.allocation_key),
                    quantity: Math.max(0, numberValue(allocationRow.quantity)),
                    mmLotId: relationId(allocationRow.mm_lot_id, ["lot_id", "mm_lot_id", "id"]) || null,
                    lotName: null as string | null,
                    batchNo: textValue(allocationRow.batch_no) || null,
                    manufacturingDate: dateValue(allocationRow.manufacturing_date),
                    expiryDate: dateValue(allocationRow.expiry_date),
                    rejectionReasonId,
                    rejectionReasonName: rejectionReasonId ? rejectionReasonNames.get(rejectionReasonId) || null : null
                };
            };
            const evidenceImageFileId = directusFileId(yieldRow.daily_qa_image_id);
            const evidenceImageMetadata = directusFileMetadata(yieldRow.daily_qa_image_id)
                || (evidenceImageFileId ? evidenceFilesById.get(evidenceImageFileId) : null);
            const evidenceByChannel: Record<YieldEvidenceChannel, any[]> = {
                INSPECTOR_SHIFT: [],
                QA_ACCEPTED_STOCK: [],
                QA_REJECTED_STOCK: []
            };
            for (const evidenceRow of evidenceRowsByLedger.get(currentLedgerId) || []) {
                const channel = textValue(evidenceRow.evidence_type) as YieldEvidenceChannel;
                const fileId = directusFileId(evidenceRow.directus_file_id);
                if (!fileId || !Object.hasOwn(evidenceByChannel, channel)) continue;
                const fileMetadata = directusFileMetadata(evidenceRow.directus_file_id)
                    || evidenceFilesById.get(fileId);
                evidenceByChannel[channel].push({
                    evidenceId: evidenceRow.evidence_id,
                    channel,
                    fileId,
                    fileName: fileMetadata?.fileName || null,
                    mimeType: fileMetadata?.mimeType || null,
                    fileSize: fileMetadata?.fileSize ?? null,
                    url: productionYieldImageUrl(fileId),
                    uploadedById: relationId(evidenceRow.uploaded_by, ["user_id", "id"]) || null,
                    uploadedAt: timestampValue(evidenceRow.uploaded_at),
                    sortOrder: numberValue(evidenceRow.sort_order)
                });
            }
            if (evidenceImageFileId && !evidenceByChannel.INSPECTOR_SHIFT.some((item) => item.fileId === evidenceImageFileId)) {
                evidenceByChannel.INSPECTOR_SHIFT.unshift({
                    evidenceId: `legacy-${currentLedgerId}`,
                    channel: "INSPECTOR_SHIFT",
                    fileId: evidenceImageFileId,
                    fileName: evidenceImageMetadata?.fileName || null,
                    mimeType: evidenceImageMetadata?.mimeType || null,
                    fileSize: evidenceImageMetadata?.fileSize ?? null,
                    url: productionYieldImageUrl(evidenceImageFileId),
                    uploadedById: relationId(yieldRow.logged_by, ["user_id", "id"]) || null,
                    uploadedAt: timestampValue(yieldRow.logged_at),
                    sortOrder: -1
                });
            }

            return {
                ledgerId: currentLedgerId,
                jobOrderId: id,
                shiftName: textValue(yieldRow.shift_name) || "—",
                sessionKey: textValue(yieldRow.session_key) || null,
                productionDate: dateValue(yieldRow.production_date),
                loggedAt: timestampValue(yieldRow.logged_at),
                loggedById: relationId(yieldRow.logged_by, ["user_id", "id"]) || null,
                goodQuantity,
                rejectedQuantity,
                qaAcceptedQuantity,
                qaRejectedQuantity,
                qaAllocationLimit: allocationCapacity?.maxAuditQuantity ?? 0,
                scrapQuantity,
                totalQuantity: outputTotals.totalQuantity,
                mmLotId: mmLotId || null,
                batchNo: textValue(yieldRow.lot_number || yieldRow.batch_no) || null,
                manufacturingDate: dateValue(yieldRow.manufacturing_date),
                expiryDate: dateValue(yieldRow.expiry_date),
                rejectedMmLotId: rejectedMmLotId || null,
                rejectedBatchNo: textValue(yieldRow.rejected_lot_number) || null,
                rejectedManufacturingDate: dateValue(yieldRow.rejected_manufacturing_date),
                rejectedExpiryDate: dateValue(yieldRow.rejected_expiry_date),
                acceptedAllocations: savedOutputAllocations
                    .filter((row) => textValue(row.allocation_type).toUpperCase() === "ACCEPTED")
                    .map(mapOutputAllocation),
                rejectedAllocations: savedOutputAllocations
                    .filter((row) => textValue(row.allocation_type).toUpperCase() === "REJECTED")
                    .map(mapOutputAllocation),
                evidenceImage: evidenceImageFileId
                    ? {
                        fileId: evidenceImageFileId,
                        fileName: evidenceImageMetadata?.fileName || null,
                        mimeType: evidenceImageMetadata?.mimeType || null,
                        fileSize: evidenceImageMetadata?.fileSize ?? null,
                        url: productionYieldImageUrl(evidenceImageFileId)
                    }
                    : null,
                evidence: {
                    inspectorShift: evidenceByChannel.INSPECTOR_SHIFT,
                    acceptedStock: evidenceByChannel.QA_ACCEPTED_STOCK,
                    rejectedStock: evidenceByChannel.QA_REJECTED_STOCK
                },
                qaStatus: assessment?.qaStatus || outcome.status,
                processQaStatus: assessment?.qaStatus || outcome.status,
                qaRevocation: yieldRow.qa_revoked_at ? (() => {
                    const revokedById = relationId(yieldRow.qa_revoked_by, ["user_id", "id"]);
                    return {
                        revokedAt: timestampValue(yieldRow.qa_revoked_at),
                        revokedById: revokedById || null,
                        revokedByName: revokedByNames.get(revokedById) || null,
                        reason: textValue(yieldRow.qa_revoke_reason) || null
                    };
                })() : null,
                outcome,
                audits
            };
        })
        .filter((row) => row.ledgerId > 0)
        .sort((left, right) => sortTimestamp(right.loggedAt || right.productionDate) - sortTimestamp(left.loggedAt || left.productionDate) || right.ledgerId - left.ledgerId);

    const mmLotIds = Array.from(new Set([
        ...yieldRows.flatMap((row) => [row.mmLotId, row.rejectedMmLotId]).filter((value): value is number => Boolean(value)),
        ...outputAllocationRows.map((row) => relationId(row.mm_lot_id, ["lot_id", "mm_lot_id", "id"])).filter(Boolean)
    ]));
    const mmLots = mmLotIds.length > 0
        ? await readRows(
            `/items/mm_lots?filter[lot_id][_in]=${mmLotIds.join(",")}&limit=-1&fields=lot_id,lot_name`,
            "Storage lot lookup"
        )
        : [];
    const mmLotsById = new Map<number, DirectusRow>(
        mmLots.map((lot) => [relationId(lot.lot_id, ["lot_id", "id"]), lot])
    );
    const dailyYields = yieldRows.map((row) => ({
        ...row,
        lotName: row.mmLotId ? textValue(mmLotsById.get(row.mmLotId)?.lot_name) || `Lot #${row.mmLotId}` : null,
        rejectedLotName: row.rejectedMmLotId
            ? textValue(mmLotsById.get(row.rejectedMmLotId)?.lot_name) || null
            : null,
        acceptedAllocations: row.acceptedAllocations.map((allocation) => ({
            ...allocation,
            lotName: allocation.mmLotId ? textValue(mmLotsById.get(allocation.mmLotId)?.lot_name) || `Lot #${allocation.mmLotId}` : null
        })),
        rejectedAllocations: row.rejectedAllocations.map((allocation) => ({
            ...allocation,
            lotName: allocation.mmLotId ? textValue(mmLotsById.get(allocation.mmLotId)?.lot_name) || `Lot #${allocation.mmLotId}` : null
        }))
    }));
    const qaStatusCounts = buildYieldQAStatusCountIndex(
        dailyYields,
        (row) => row.jobOrderId,
        (row) => row.qaStatus
    ).get(id);

    let closeReadiness: JobOrderClosureReadiness;
    try {
        closeReadiness = await getJobOrderClosureReadiness(id, { yields, inspections: activeInspections, routes });
    } catch (error) {
        console.error(`Unable to determine close readiness for Job Order ${id}:`, error);
        closeReadiness = {
            ready: false,
            autoResolvableDispositionCount: 0,
            blockers: [{
                code: "CLOSURE_VALIDATION_UNAVAILABLE",
                message: "Close readiness could not be verified. Retry before closing this Job Order."
            }]
        };
    }

    return {
        jobOrderId: id,
        jobOrderNo: textValue(jobOrder.job_order_no) || `JO-${id}`,
        status: formatJobOrderStatus(jobOrder.status),
        productId: productId || null,
        productName: textValue(product?.product_name) || (productId ? `Product #${productId}` : "—"),
        productCode: textValue(product?.product_code) || null,
        productUom: productUomValue(product),
        productShelfLifeDays: shelfLifeDaysValue(product?.product_shelf_life),
        branchId: relationId(jobOrder.branch_id, ["branch_id", "id"]) || null,
        targetQuantity: numberValue(jobOrder.target_quantity),
        completedQuantity: numberValue(jobOrder.completed_quantity),
        totalProducedQuantity: qaAllocationCapacities?.totalProducedQuantity ?? 0,
        producedQuantity: dailyYields.reduce((sum, row) => (
            sum + (row.qaStatus === "Passed" ? row.totalQuantity : 0)
        ), 0),
        pendingYieldCount: qaStatusCounts?.pendingYieldCount || 0,
        discrepancyYieldCount: qaStatusCounts?.discrepancyYieldCount || 0,
        unresolvedYieldCount: qaStatusCounts?.unresolvedYieldCount || 0,
        latestYieldAt: timestampValue(dailyYields[0]?.loggedAt || dailyYields[0]?.productionDate),
        yieldEvidenceAvailable,
        yieldEvidenceWarning,
        routes: routeModels,
        dailyYields,
        canRevokeYieldAudit,
        closeReadiness
    };
}

export async function GET(request: Request) {
    try {
        const authorizedUser = await requireJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.inspectionQa);
        const { searchParams } = new URL(request.url);
        const rawJoId = textValue(searchParams.get("joId"));
        const rawJobOrderNo = textValue(searchParams.get("jobOrderNo"));

        if (rawJoId) {
            const joId = Number(rawJoId);
            if (!Number.isSafeInteger(joId) || joId <= 0) {
                throw new JobOrderInspectionQAError(400, "A valid Job Order identifier is required.");
            }
            return NextResponse.json({ data: await loadJobOrderDetails(joId, authorizedUser.canRevokeYieldAudit) });
        }

        if (rawJobOrderNo) {
            return NextResponse.json({ data: await loadJobOrderSummaryByNumber(rawJobOrderNo) });
        }

        const query = parseSummaryQuery(searchParams);
        const summaries = await loadJobOrderSummaries();
        return NextResponse.json({ data: buildJobOrderDailyYieldSummaryPage(summaries, query) });
    } catch (error) {
        const status = error instanceof JobOrderInspectionQAError || error instanceof JobOrderModuleAccessError ? error.status : 500;
        const message = error instanceof Error ? error.message : "Failed to load JO Daily Yields.";
        console.error("JO Daily Yields API error:", error);
        return NextResponse.json({ error: message, code: error instanceof JobOrderModuleAccessError ? error.code : undefined }, { status });
    }
}
