/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import {
    acceptedQuantityByJobOrder,
    buildQAYieldAssessments,
} from "../_qa-accepted-output";
import {
    isCancelledJobOrderStatus,
    normalizeJobOrderStatus,
} from "@/modules/manufacturing-management/job-order-status";
import {
    getJobOrderClosureReadiness,
    type JobOrderClosureReadiness,
} from "../../job-orders/_workflow-service";
import { productionYieldImageUrl } from "@/modules/manufacturing-management/production-workflow/services/production-yield-image";

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

function textValue(value: unknown): string {
    return String(value ?? "").trim();
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

async function loadJobOrderSummaries() {
    const [jobOrders, yields, products, routes, inspections] = await Promise.all([
        readRows(
            "/items/manufacturing_job_orders?limit=-1&sort=-job_order_id",
            "Job Order lookup"
        ),
        readRows(
            "/items/manufacturing_job_order_yield_ledger?limit=-1&sort=-logged_at",
            "Yield ledger lookup"
        ),
        readRows(
            "/items/products?limit=-1&fields=product_id,product_name,product_code",
            "Product lookup"
        ),
        readRows(
            "/items/manufacturing_job_order_routes?limit=-1&fields=*",
            "Job Order routing lookup"
        ),
        readRows(
            "/items/manufacturing_daily_qa_inspections?limit=-1&fields=*",
            "Daily QA inspection lookup"
        )
    ]);

    const productsById = new Map<number, DirectusRow>(
        products.map((product) => [
            relationId(product.product_id, ["product_id", "id"]),
            product
        ])
    );
    const yieldsByJobOrder = new Map<number, DirectusRow[]>();
    yields.forEach((yieldRow) => {
        const id = relationId(yieldRow.job_order_id, ["job_order_id", "id"]);
        if (!id) return;
        const current = yieldsByJobOrder.get(id) || [];
        current.push(yieldRow);
        yieldsByJobOrder.set(id, current);
    });
    const acceptedByJobOrder = acceptedQuantityByJobOrder(
        buildQAYieldAssessments(yields, inspections, routes)
    );

    const rows = jobOrders
        .map((jobOrder) => {
            const id = jobOrderId(jobOrder);
            const ledgerRows = yieldsByJobOrder.get(id) || [];
            return { jobOrder, id, ledgerRows };
        })
        .filter(({ jobOrder, id, ledgerRows }) => id > 0 && ledgerRows.length > 0 && !isCancelledJobOrderStatus(jobOrder.status))
        .map(({ jobOrder, id, ledgerRows }) => {
            const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
            const product = productsById.get(productId);
            const latest = ledgerRows
                .slice()
                .sort((left, right) => sortTimestamp(right.logged_at || right.production_date) - sortTimestamp(left.logged_at || left.production_date))[0];
            const producedQuantity = acceptedByJobOrder.get(id) || 0;

            return {
                jobOrderId: id,
                jobOrderNo: textValue(jobOrder.job_order_no) || `JO-${id}`,
                status: formatJobOrderStatus(jobOrder.status),
                productId: productId || null,
                productName: textValue(product?.product_name) || (productId ? `Product #${productId}` : "—"),
                productCode: textValue(product?.product_code) || null,
                branchId: relationId(jobOrder.branch_id, ["branch_id", "id"]) || null,
                targetQuantity: numberValue(jobOrder.target_quantity ?? jobOrder.quantity),
                producedQuantity,
                yieldCount: ledgerRows.length,
                latestYieldAt: timestampValue(latest?.logged_at || latest?.production_date),
                createdAt: timestampValue(jobOrder.created_at),
                modifiedAt: timestampValue(jobOrder.modified_at)
            };
        })
        .sort((left, right) => sortTimestamp(right.latestYieldAt) - sortTimestamp(left.latestYieldAt) || right.jobOrderId - left.jobOrderId);

    return rows;
}

async function loadJobOrderDetails(id: number) {
    const [jobOrder, yields, inspections, routes, products, operations] = await Promise.all([
        readRecord(
            `/items/manufacturing_job_orders/${encodeURIComponent(String(id))}?fields=*`,
            `Job Order ${id} lookup`
        ),
        readRows(
            `/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${encodeURIComponent(String(id))}&limit=-1&sort=-logged_at&fields=*`,
            `Yield ledger lookup for Job Order ${id}`
        ),
        readRows(
            `/items/manufacturing_daily_qa_inspections?filter[job_order_id][_eq]=${encodeURIComponent(String(id))}&limit=-1&sort=-inspected_at&fields=*`,
            `Daily QA inspection lookup for Job Order ${id}`
        ),
        readRows(
            `/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${encodeURIComponent(String(id))}&limit=-1&fields=*`,
            `Routing lookup for Job Order ${id}`
        ),
        readRows(
            "/items/products?limit=-1&fields=product_id,product_name,product_code",
            "Product lookup"
        ),
        readRows(
            "/items/manufacturing_operations?limit=-1&fields=id,operation_name",
            "Manufacturing operation lookup"
        ),
    ]);

    const actualJobOrderId = jobOrderId(jobOrder);
    if (actualJobOrderId !== id) {
        throw new JobOrderInspectionQAError(404, `Job Order ${id} was not found.`);
    }
    if (isCancelledJobOrderStatus(jobOrder.status)) {
        throw new JobOrderInspectionQAError(404, `Job Order ${id} is cancelled and is not available in this queue.`);
    }

    const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
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

    const assessmentsByLedger = new Map(
        buildQAYieldAssessments(yields, inspections, routes)
            .map((assessment) => [assessment.ledgerId, assessment] as const)
    );

    const yieldRows = yields
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
            const mmLotId = relationId(yieldRow.mm_lot_id, ["mm_lot_id", "lot_id", "id"]);
            const evidenceImageFileId = directusFileId(yieldRow.daily_qa_image_id);
            const evidenceImageRecord = yieldRow.daily_qa_image_id && typeof yieldRow.daily_qa_image_id === "object"
                ? yieldRow.daily_qa_image_id as DirectusRow
                : null;

            return {
                ledgerId: currentLedgerId,
                jobOrderId: id,
                shiftName: textValue(yieldRow.shift_name) || "—",
                sessionKey: textValue(yieldRow.session_key) || null,
                productionDate: dateValue(yieldRow.production_date),
                loggedAt: timestampValue(yieldRow.logged_at),
                goodQuantity,
                rejectedQuantity,
                scrapQuantity,
                totalQuantity: goodQuantity + rejectedQuantity + scrapQuantity,
                mmLotId: mmLotId || null,
                batchNo: textValue(yieldRow.lot_number || yieldRow.batch_no) || null,
                manufacturingDate: dateValue(yieldRow.manufacturing_date),
                expiryDate: dateValue(yieldRow.expiry_date),
                evidenceImage: evidenceImageFileId
                    ? {
                        fileId: evidenceImageFileId,
                        fileName: textValue(evidenceImageRecord?.filename_download || evidenceImageRecord?.title) || null,
                        mimeType: textValue(evidenceImageRecord?.type) || null,
                        fileSize: numberValue(evidenceImageRecord?.filesize) || null,
                        url: productionYieldImageUrl(evidenceImageFileId)
                    }
                    : null,
                qaStatus: assessment?.qaStatus || outcome.status,
                processQaStatus: assessment?.qaStatus || outcome.status,
                outcome,
                audits
            };
        })
        .filter((row) => row.ledgerId > 0)
        .sort((left, right) => sortTimestamp(right.loggedAt || right.productionDate) - sortTimestamp(left.loggedAt || left.productionDate) || right.ledgerId - left.ledgerId);

    const mmLotIds = Array.from(new Set(yieldRows.map((row) => row.mmLotId).filter((value): value is number => Boolean(value))));
    const mmLots = mmLotIds.length > 0
        ? await readRows(
            `/items/mm_lots?filter[lot_id][_in]=${mmLotIds.join(",")}&limit=-1&fields=*`,
            "Storage lot lookup"
        )
        : [];
    const mmLotsById = new Map<number, DirectusRow>(
        mmLots.map((lot) => [relationId(lot.lot_id, ["lot_id", "id"]), lot])
    );
    const dailyYields = yieldRows.map((row) => ({
        ...row,
        lotName: row.mmLotId ? textValue(mmLotsById.get(row.mmLotId)?.lot_name) || `Lot #${row.mmLotId}` : null
    }));

    let closeReadiness: JobOrderClosureReadiness;
    try {
        closeReadiness = await getJobOrderClosureReadiness(id);
    } catch (error) {
        console.error(`Unable to determine close readiness for Job Order ${id}:`, error);
        closeReadiness = {
            ready: false,
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
        branchId: relationId(jobOrder.branch_id, ["branch_id", "id"]) || null,
        targetQuantity: numberValue(jobOrder.target_quantity ?? jobOrder.quantity),
        completedQuantity: numberValue(jobOrder.completed_quantity),
        producedQuantity: dailyYields.reduce((sum, row) => (
            sum + (row.qaStatus === "Passed" ? row.goodQuantity + row.rejectedQuantity : 0)
        ), 0),
        latestYieldAt: timestampValue(dailyYields[0]?.loggedAt || dailyYields[0]?.productionDate),
        routes: routeModels,
        dailyYields,
        closeReadiness
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const rawJoId = textValue(searchParams.get("joId"));

        if (rawJoId) {
            const joId = Number(rawJoId);
            if (!Number.isSafeInteger(joId) || joId <= 0) {
                throw new JobOrderInspectionQAError(400, "A valid Job Order identifier is required.");
            }
            return NextResponse.json({ data: await loadJobOrderDetails(joId) });
        }

        return NextResponse.json({ data: await loadJobOrderSummaries() });
    } catch (error) {
        const status = error instanceof JobOrderInspectionQAError ? error.status : 500;
        const message = error instanceof Error ? error.message : "Failed to load JO Daily Yields.";
        console.error("JO Daily Yields API error:", error);
        return NextResponse.json({ error: message }, { status });
    }
}
