/* eslint-disable */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers, getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { createJobOrder } from "@/app/api/manufacturing/planning-engineering/planning-helper";
import { twoPointQAInspectionRequestSchema } from "./_two-point-contract";
import {
    createDisposition,
    DispositionPersistenceError,
    enrichDispositions,
    getDisposition,
    readDispositions,
    updateDisposition,
    resolveDispositionMetadata
} from "./_dispositions";
import { hasPagination, paginate } from "../_pagination";
import { resolveOrCreateMmLot, resolveProductUnitId } from "../services/mm-lots.service";

async function getUserIdFromSession(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
                const rawId = payload?.id || payload?.user_id || payload?.sub;
                const id = Number(rawId);
                if (Number.isSafeInteger(id) && id > 0) return id;
            }
        }
    } catch (error) {
        console.warn("Unable to resolve the QA inspector from the session:", error);
    }
    return null;
}

class QAPersistenceError extends Error {
    constructor(message: string, readonly statusCode = 502) {
        super(message);
    }
}

function directusErrorMessage(payload: unknown, fallback: string): string {
    if (payload && typeof payload === "object") {
        const record = payload as Record<string, any>;
        const errors = Array.isArray(record.errors) ? record.errors : [];
        const firstError = errors[0];
        if (firstError && typeof firstError === "object" && typeof firstError.message === "string" && firstError.message.trim()) {
            return firstError.message;
        }
        if (typeof record.error === "string" && record.error.trim()) return record.error;
        if (typeof record.message === "string" && record.message.trim()) return record.message;
    }
    return fallback;
}

async function directusMutation(pathname: string, init: RequestInit, operation: string): Promise<Record<string, any>> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${pathname}`, init);
    } catch (error) {
        throw new QAPersistenceError(`${operation} could not reach Directus: ${error instanceof Error ? error.message : String(error)}`);
    }

    const text = await response.text();
    let payload: unknown = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new QAPersistenceError(`${operation} failed: ${directusErrorMessage(payload, `Directus returned ${response.status}`)}`);
    }

    const data = payload && typeof payload === "object" ? (payload as Record<string, any>).data : null;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new QAPersistenceError(`${operation} returned no persisted record from Directus.`);
    }
    return data as Record<string, any>;
}

function numericRecordId(record: Record<string, any>, fields: string[]): number | null {
    for (const field of fields) {
        const value = Number(record[field]);
        if (Number.isSafeInteger(value) && value > 0) return value;
    }
    return null;
}

function numericRelationId(value: unknown, fields: string[]): number | null {
    if (value && typeof value === "object") {
        return numericRecordId(value as Record<string, any>, fields);
    }
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function deleteDirectusRecord(pathname: string, operation: string): Promise<void> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${pathname}`, { method: "DELETE", headers });
    } catch (error) {
        throw new QAPersistenceError(`${operation} could not reach Directus: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
        const text = await response.text();
        let payload: unknown = null;
        try {
            payload = text ? JSON.parse(text) : null;
        } catch {
            payload = null;
        }
        throw new QAPersistenceError(`${operation} failed: ${directusErrorMessage(payload, `Directus returned ${response.status}`)}`);
    }
}

async function rollbackTwoPointWrites(state: {
    parentJobOrderId: number;
    previousJobOrder: Record<string, any>;
    parentJobOrderPatched: boolean;
    inspectionLogId: number | null;
    reworkJobOrderId: number | null;
    statusHistoryId: number | null;
    inventoryMovementId: number | null;
    productLedgerId: number | null;
}): Promise<string[]> {
    const failures: string[] = [];

    if (state.parentJobOrderPatched) {
        try {
            await directusMutation(
                `/items/manufacturing_job_orders/${state.parentJobOrderId}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(state.previousJobOrder)
                },
                "Rollback Job Order QA state"
            );
        } catch (error) {
            failures.push(error instanceof Error ? error.message : "Rollback Job Order QA state failed.");
        }
    }

    const cleanupTargets: Array<[number | null, string, string]> = [
        [state.productLedgerId, "product_ledger", "Rollback product ledger entry"],
        [state.inventoryMovementId, "inventory_movements", "Rollback inventory movement"],
        [state.statusHistoryId, "manufacturing_job_order_status_history", "Rollback status history entry"],
        [state.inspectionLogId, "qa_jo_inspection_logs", "Rollback QA inspection log"],
        [state.reworkJobOrderId, "manufacturing_job_orders", "Rollback rework Job Order"]
    ];

    for (const [id, collection, operation] of cleanupTargets) {
        if (!id) continue;
        try {
            await deleteDirectusRecord(`/items/${collection}/${id}`, operation);
        } catch (error) {
            failures.push(error instanceof Error ? error.message : `${operation} failed.`);
        }
    }

    return failures;
}

// Helper to resolve job_order_id (integer) and product_id from job_order_no (string)
async function getJobOrderIdByNo(joNo: string): Promise<{ id: number; productId: number; status: string | null } | null> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joNo)}&fields=job_order_id,product_id,status&limit=1`, { headers });
        if (res.ok) {
            const data = (await res.json()).data?.[0];
            if (data) {
                return {
                    id: Number(data.job_order_id),
                    productId: Number(data.product_id),
                    status: typeof data.status === "string" ? data.status : null
                };
            }
        }
    } catch (e) {
        console.error("Failed to resolve job_order_id for", joNo, e);
    }
    return null;
}

async function getJobOrderById(jobOrderId: number): Promise<{ id: number; productId: number; status: string | null; jobOrderNo: string } | null> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}?fields=job_order_id,job_order_no,product_id,status`, { headers });
        if (!res.ok) return null;
        const data = (await res.json()).data;
        if (!data) return null;
        return {
            id: Number(data.job_order_id),
            productId: Number(data.product_id),
            status: typeof data.status === "string" ? data.status : null,
            jobOrderNo: typeof data.job_order_no === "string" ? data.job_order_no : `JO-${jobOrderId}`
        };
    } catch (e) {
        console.error("Failed to load job order for QA disposition", jobOrderId, e);
        return null;
    }
}

// Helper to resolve or create a canonical MM master lot for QA output.
async function resolveMasterLotId(name: string, _typeId: number, branchId: number, productId: number): Promise<number> {
    const unitId = await resolveProductUnitId(productId);
    const lot = await resolveOrCreateMmLot({
        lotName: name,
        branchId,
        unitId,
        maxBatchCapacity: 100000,
        createdBy: 24
    });
    return lot.lot_id;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get("action");

        // Action 1: Fetch QA Rejection Reasons (from qa_rejection_reasons)
        if (action === "rejection-reasons") {
            try {
                const res = await fetch(`${DIRECTUS_URL}/items/qa_rejection_reasons?filter[is_active][_eq]=true&limit=-1&sort=reason_code`, { headers, cache: "no-store" });
                if (res.ok) {
                    const data = (await res.json()).data || [];
                    return NextResponse.json(data);
                }
            } catch (err) {
                console.error("Error fetching rejection reasons from Directus:", err);
            }
            // Fallback standard reasons if table is still loading
            const fallbackReasons = [
                { id: 1, reason_code: "DIM_OOS", reason_name: "Dimension Out of Specification", category: "Dimensional" },
                { id: 2, reason_code: "SURF_DEF", reason_name: "Surface & Visual Defect", category: "Visual" },
                { id: 3, reason_code: "CONTAM", reason_name: "Foreign Material Contamination", category: "Quality" },
                { id: 4, reason_code: "WEIGHT_DEV", reason_name: "Weight Deviation", category: "Weight" },
                { id: 5, reason_code: "PACK_LEAK", reason_name: "Packaging Seal / Leak Failure", category: "Packaging" },
                { id: 6, reason_code: "ASSEMBLY_ERR", reason_name: "Assembly / Alignment Error", category: "Assembly" },
                { id: 7, reason_code: "LABEL_MISPRINT", reason_name: "Label / Barcode Misprint", category: "Labeling" },
                { id: 8, reason_code: "MOISTURE_OOS", reason_name: "Moisture / Viscosity Out of Spec", category: "Chemical" },
                { id: 9, reason_code: "MECH_FAIL", reason_name: "Mechanical / Strength Failure", category: "Functional" },
                { id: 10, reason_code: "OTHER", reason_name: "Other Non-Conformance", category: "General" }
            ];
            return NextResponse.json(fallbackReasons);
        }

        // Action 2: Fetch QA Inspection Logs (from qa_jo_inspection_logs)
        if (action === "inspection-logs") {
            const jobOrderId = searchParams.get("jobOrderId");
            const paginated = hasPagination(searchParams);
            let url = `${DIRECTUS_URL}/items/qa_jo_inspection_logs?limit=-1&sort=-id`;
            if (jobOrderId) {
                url += `&filter[job_order_id][_eq]=${Number(jobOrderId)}`;
            }

            try {
                const [logsRes, reasonsRes, josRes, productsRes] = await Promise.all([
                    fetch(url, { headers, cache: "no-store" }),
                    fetch(`${DIRECTUS_URL}/items/qa_rejection_reasons?limit=-1`, { headers, cache: "no-store" }),
                    fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,product_id`, { headers, cache: "no-store" }),
                    fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name`, { headers, cache: "no-store" })
                ]);

                const rawLogs = logsRes.ok ? (await logsRes.json()).data || [] : [];
                const reasons = reasonsRes.ok ? (await reasonsRes.json()).data || [] : [];
                const jos = josRes.ok ? (await josRes.json()).data || [] : [];
                const products = productsRes.ok ? (await productsRes.json()).data || [] : [];

                const enrichedLogs = rawLogs.map((log: any) => {
                    const matchedJO = jos.find((j: any) => Number(j.job_order_id) === Number(log.job_order_id));
                    const matchedReworkJO = log.rework_job_order_id ? jos.find((j: any) => Number(j.job_order_id) === Number(log.rework_job_order_id)) : null;
                    const matchedProduct = matchedJO ? products.find((p: any) => Number(p.product_id) === Number(matchedJO.product_id)) : null;
                    const matchedReason = log.rejection_reason_id ? reasons.find((r: any) => Number(r.id) === Number(log.rejection_reason_id)) : null;

                    return {
                        id: log.id,
                        job_order_id: log.job_order_id,
                        job_order_no: matchedJO?.job_order_no || `JO-${log.job_order_id}`,
                        product_id: matchedJO?.product_id,
                        product_name: matchedProduct?.product_name || "Finished Good",
                        inspected_quantity: Number(log.inspected_quantity || 0),
                        passed_quantity: Number(log.passed_quantity || 0),
                        rejected_quantity: Number(log.rejected_quantity || 0),
                        rejection_reason_id: log.rejection_reason_id || null,
                        rejection_reason: matchedReason || null,
                        rejection_reason_name: matchedReason?.reason_name || null,
                        rejection_reason_code: matchedReason?.reason_code || null,
                        rework_job_order_id: log.rework_job_order_id || null,
                        rework_job_order_no: matchedReworkJO?.job_order_no || null,
                        inspected_by: log.inspected_by || null,
                        inspector_name: log.inspected_by ? `Inspector #${log.inspected_by}` : "QA Inspector",
                        inspected_at: log.inspected_at || new Date().toISOString(),
                        status: log.status || (Number(log.rejected_quantity) > 0 ? "REWORK_TRIGGERED" : "PASSED"),
                        remarks: log.remarks || ""
                    };
                });

                const search = (searchParams.get("search") || "").trim().toLowerCase();
                const status = (searchParams.get("status") || "").trim().toLowerCase();
                const reason = searchParams.get("reason") || "";
                const filteredLogs = enrichedLogs.filter((log: any) => {
                    const haystack = `${log.job_order_no} ${log.product_name} ${log.rework_job_order_no || ""} ${log.remarks || ""} ${log.rejection_reason_name || ""}`.toLowerCase();
                    const matchesSearch = !search || haystack.includes(search);
                    const matchesStatus = !status
                        || (status === "passed" && Number(log.rejected_quantity) === 0)
                        || (status === "rework" && Number(log.rejected_quantity) > 0)
                        || String(log.status || "").toLowerCase() === status;
                    const matchesReason = !reason || String(log.rejection_reason_id || "") === reason;
                    return matchesSearch && matchesStatus && matchesReason;
                });

                return NextResponse.json(paginated ? paginate(filteredLogs, searchParams) : filteredLogs);
            } catch (err) {
                console.error("Error loading inspection logs:", err);
                if (paginated) {
                    return NextResponse.json({ error: "Failed to load inspection logs." }, { status: 502 });
                }
                return NextResponse.json([]);
            }
        }

        // Action 3: Fetch Status History (from manufacturing_job_order_status_history)
        if (action === "status-history") {
            const jobOrderId = searchParams.get("jobOrderId");
            let url = `${DIRECTUS_URL}/items/manufacturing_job_order_status_history?limit=-1&sort=-history_id`;
            if (jobOrderId) {
                url += `&filter[job_order_id][_eq]=${Number(jobOrderId)}`;
            }

            try {
                const res = await fetch(url, { headers, cache: "no-store" });
                if (res.ok) {
                    const data = (await res.json()).data || [];
                    return NextResponse.json(data);
                }
            } catch (err) {
                console.error("Error fetching status history:", err);
            }
            return NextResponse.json([]);
        }

        // Action: Fetch QA templates and parameters
        if (action === "templates") {
            const [templatesRes, parametersRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/quality_inspection_templates?limit=-1`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters?limit=-1`, { headers, cache: "no-store" })
            ]);

            if (!templatesRes.ok || !parametersRes.ok) {
                throw new Error("Failed to fetch templates/parameters from Directus");
            }

            const templates = (await templatesRes.json()).data || [];
            const parameters = (await parametersRes.json()).data || [];

            const templatesWithParams = templates.map((tpl: any) => ({
                ...tpl,
                parameters: parameters.filter((param: any) => param.template_id === tpl.template_id)
            }));

            return NextResponse.json(templatesWithParams);
        }

        // Action: Fetch supervisor dispositions
        if (action === "dispositions") {
            const list = await readDispositions();
            const enriched = await enrichDispositions(list);
            if (!hasPagination(searchParams)) return NextResponse.json(enriched);

            const search = (searchParams.get("search") || "").trim().toLowerCase();
            const branch = searchParams.get("branch") || searchParams.get("branchId") || "";
            const status = (searchParams.get("status") || "").trim().toLowerCase();
            const filtered = enriched.filter((hold: any) => {
                const haystack = `${hold.jo_id} ${hold.product_name} ${hold.station_name || ""} ${hold.task_name} ${hold.inspection_remarks || ""}`.toLowerCase();
                return (!search || haystack.includes(search))
                    && (!branch || String(hold.branch_id || "") === branch)
                    && (!status || String(hold.disposition_status || "").toLowerCase() === status);
            });
            return NextResponse.json(paginate(filtered, searchParams));
        }

        if (action === "summary") {
            const [jobOrdersRes, logsRes, dispositions] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&fields=job_order_id,status`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/qa_jo_inspection_logs?limit=-1&fields=id`, { headers, cache: "no-store" }),
                readDispositions()
            ]);
            if (!jobOrdersRes.ok || !logsRes.ok) {
                return NextResponse.json({ error: "Failed to load QA summary." }, { status: 502 });
            }
            const jobOrders = (await jobOrdersRes.json()).data || [];
            const logs = (await logsRes.json()).data || [];
            const isFinished = (value: unknown) => ["finished", "completed", "closed"].includes(String(value || "").toLowerCase());
            return NextResponse.json({
                jobOrderCount: jobOrders.length,
                activeJobOrderCount: jobOrders.filter((jo: any) => !isFinished(jo.status) && String(jo.status || "").toLowerCase() !== "cancelled").length,
                closedJobOrderCount: jobOrders.filter((jo: any) => isFinished(jo.status)).length,
                inspectionLogCount: logs.length,
                pendingHoldCount: dispositions.filter((hold: any) => hold.disposition_status === "Pending").length
            });
        }

        // Action: Match dynamic checklist template for a specific task and product
        if (action === "matching-template") {
            const taskName = searchParams.get("taskName") || "";
            const productId = searchParams.get("productId") || "";
            const requestedTemplateId = Number(searchParams.get("templateId") || 0);

            const [templatesRes, parametersRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/quality_inspection_templates?limit=-1`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters?limit=-1`, { headers, cache: "no-store" })
            ]);

            if (!templatesRes.ok || !parametersRes.ok) {
                throw new Error("Failed to fetch templates/parameters from Directus");
            }

            const templates = (await templatesRes.json()).data || [];
            const parameters = (await parametersRes.json()).data || [];

            const isActiveTemplate = (tpl: any): boolean => {
                if (tpl.is_active === true || tpl.is_active === 1) return true;
                const normalized = String(tpl.is_active ?? "").trim().toLowerCase();
                return normalized === "1" || normalized === "true" || normalized === "yes";
            };

            let matchedTpl = null;
            if (requestedTemplateId > 0) {
                matchedTpl = templates.find((tpl: any) =>
                    isActiveTemplate(tpl) && Number(tpl.template_id || tpl.id) === requestedTemplateId
                );
                if (!matchedTpl) {
                    return NextResponse.json(
                        { error: `QA template ${requestedTemplateId} was not found or is inactive.` },
                        { status: 404 }
                    );
                }
            } else {
                matchedTpl = templates.find((tpl: any) =>
                    isActiveTemplate(tpl) &&
                    taskName.toLowerCase().includes(String(tpl.template_name || "").toLowerCase())
                );

                if (!matchedTpl) {
                    matchedTpl = templates.find((tpl: any) => isActiveTemplate(tpl));
                }
            }

            if (!matchedTpl) {
                return NextResponse.json({ template: null, parameters: [] });
            }

            const matchedTemplateId = Number(matchedTpl.template_id || matchedTpl.id);
            const tplParams = parameters.filter((param: any) => Number(param.template_id || param.template?.template_id || param.template?.id) === matchedTemplateId);
            return NextResponse.json({
                template: matchedTpl,
                parameters: tplParams
            });
        }

        return NextResponse.json({ error: "Invalid action parameter" }, { status: 400 });
    } catch (e) {
        console.error("API Error in QA GET:", e);
        return NextResponse.json(
            { error: (e as Error).message || "Failed to process QA request" },
            { status: e instanceof DispositionPersistenceError ? e.statusCode : 500 }
        );
    }
}

// POST handler
export async function POST(request: Request) {
    try {
        const todayStr = await getTodayDateString();
        const rawBody: unknown = await request.json().catch(() => null);
        if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
            return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
        }
        const body = rawBody as Record<string, any>;
        const { action } = body;

        // Action: Simplified 2-Point QA Entry & Rework Trigger
        if (action === "two-point-inspection" || action === "2-point-inspection") {
            const parsed = twoPointQAInspectionRequestSchema.safeParse(body);
            if (!parsed.success) {
                return NextResponse.json({
                    error: "Invalid two-point QA inspection request.",
                    details: parsed.error.flatten()
                }, { status: 400 });
            }

            const {
                job_order_id,
                job_order_no,
                product_id: requestedProductId,
                branch_id: requestedBranchId,
                inspected_quantity,
                passed_quantity,
                rejected_quantity,
                rejection_reason_id,
                lot_number,
                manufacturing_date,
                expiry_date,
                unit_cost,
                remarks,
                user_id
            } = parsed.data;

            const inspQty = inspected_quantity;
            const passQty = passed_quantity;
            const rejQty = rejected_quantity;

            // 2. Resolve Job Order details from Directus
            let joQuery = "";
            if (job_order_id) {
                joQuery = `filter[job_order_id][_eq]=${job_order_id}`;
            } else if (job_order_no) {
                joQuery = `filter[job_order_no][_eq]=${encodeURIComponent(job_order_no)}`;
            }

            const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?${joQuery}&limit=1`, { headers, cache: "no-store" });
            if (!joRes.ok) {
                return NextResponse.json({ error: "Failed to query Job Order from database" }, { status: 500 });
            }
            const joList = (await joRes.json()).data || [];
            if (joList.length === 0) {
                return NextResponse.json({ error: `Job Order not found.` }, { status: 404 });
            }

            const parentJO = joList[0];
            const parentJoIdInt = Number(parentJO.job_order_id);
            const parentJoNo = String(parentJO.job_order_no);
            const productId = Number(parentJO.product_id);
            const branchId = Number(parentJO.branch_id || requestedBranchId || 1);
            const userId = user_id ?? await getUserIdFromSession();

            if (job_order_no && parentJoNo !== job_order_no) {
                return NextResponse.json({ error: "job_order_id and job_order_no identify different Job Orders." }, { status: 409 });
            }
            if (requestedProductId !== productId) {
                return NextResponse.json({ error: "product_id does not match the selected Job Order." }, { status: 409 });
            }
            const versionId = parentJO.version_id ? Number(parentJO.version_id) : null;
            const finalLotNo = lot_number || `MFG-${parentJoNo}`;
            const finalExpDate = expiry_date || await getTodayDateString(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
            const finalMfgDate = manufacturing_date || todayStr;

            // Fetch rejection reason details if present
            let reasonObj: any = null;
            if (rejection_reason_id) {
                try {
                    const rRes = await fetch(`${DIRECTUS_URL}/items/qa_rejection_reasons/${rejection_reason_id}`, { headers, cache: "no-store" });
                    if (rRes.ok) {
                        reasonObj = (await rRes.json()).data;
                    }
                } catch (rErr) {
                    console.warn("Could not fetch rejection reason details:", rErr);
                }
            }
            const reasonName = reasonObj?.reason_name || (rejection_reason_id ? `Reason #${rejection_reason_id}` : "");

            let spawnedReworkJo: any = null;
            let reworkJoIdInt: number | null = null;
            let createdLog: any = null;
            let createdMovement: any = null;
            const transactionState = {
                parentJobOrderId: parentJoIdInt,
                previousJobOrder: {
                    status: parentJO.status ?? null,
                    completed_quantity: Number(parentJO.completed_quantity) || 0,
                    actual_quantity_produced: Number(parentJO.actual_quantity_produced) || 0,
                    rejected_quantity: Number(parentJO.rejected_quantity) || 0,
                    modified_at: parentJO.modified_at ?? null
                },
                parentJobOrderPatched: false,
                inspectionLogId: null as number | null,
                reworkJobOrderId: null as number | null,
                statusHistoryId: null as number | null,
                inventoryMovementId: null as number | null,
                productLedgerId: null as number | null
            };

            try {
                // 3. Auto-spawn Standalone Rework Job Order if rejected_quantity > 0
                if (rejQty > 0) {
                    // Find existing rework orders for this parent to determine suffix sequence.
                    const existingReworksRes = await fetch(
                        `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[parent_job_order_id][_eq]=${parentJoIdInt}&fields=job_order_id,job_order_no&limit=-1`,
                        { headers, cache: "no-store" }
                    );
                    if (!existingReworksRes.ok) {
                        throw new QAPersistenceError("Unable to determine the next rework Job Order number.");
                    }
                    const existingList = (await existingReworksRes.json()).data || [];
                    const existingReworkIds = new Set<number>(
                        existingList
                            .map((row: any) => numericRecordId(row, ["job_order_id"]))
                            .filter((id: number | null): id is number => id !== null)
                    );
                    const reworkSuffix = String(existingList.length + 1).padStart(2, "0");
                    const reworkJoNo = `JO-RWK-${parentJoNo}-${reworkSuffix}`;

                    console.log(`[QA Rework Spawner] Spawning standalone rework Job Order: ${reworkJoNo} for target quantity ${rejQty}`);

                    let reworkCreationError: unknown = null;
                    try {
                        // Create rework Job Order with parent_job_order_id link and exploded routings.
                        await createJobOrder({
                            jo_id: reworkJoNo,
                            product_id: productId,
                            quantity: rejQty,
                            target_quantity: rejQty,
                            due_date: parentJO.end_date || null,
                            status: "Released",
                            branch_id: branchId,
                            created_by: userId,
                            parent_job_order_id: parentJoIdInt,
                            shift_option: parentJO.shift_option || "8",
                            remarks: `Standalone Rework Job Order spawned from QA Inspection of ${parentJoNo}. Rejection reason: ${reasonName}. Remarks: ${remarks || "None"}`,
                            bom: versionId ? { version_id: versionId } : null
                        }, []);
                    } catch (reworkErr) {
                        reworkCreationError = reworkErr;
                        console.error("[QA Rework Spawner] Error auto-spawning rework JO:", reworkErr);
                    }

                    // Lookup the persisted rework JO, including the parent link used by the audit view.
                    const lookupRework = await fetch(
                        `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(reworkJoNo)}&fields=job_order_id,job_order_no,parent_job_order_id,target_quantity,status&limit=1`,
                        { headers, cache: "no-store" }
                    );
                    if (!lookupRework.ok) {
                        throw new QAPersistenceError("Unable to verify the rework Job Order after saving.");
                    }
                    let rData = (await lookupRework.json()).data?.[0];

                    // Keep the existing bare-record fallback, but only accept it after Directus returns a record.
                    if (!rData) {
                        try {
                            rData = await directusMutation(
                                "/items/manufacturing_job_orders",
                                {
                                    method: "POST",
                                    headers,
                                    body: JSON.stringify({
                                        job_order_no: reworkJoNo,
                                        parent_job_order_id: parentJoIdInt,
                                        product_id: productId,
                                        version_id: versionId,
                                        target_quantity: rejQty,
                                        actual_quantity_produced: 0,
                                        completed_quantity: 0,
                                        rejected_quantity: 0,
                                        start_date: todayStr,
                                        status: "Released",
                                        branch_id: branchId,
                                        created_by: userId,
                                        created_at: new Date().toISOString(),
                                        remarks: `Standalone Rework Job Order spawned from QA Inspection of ${parentJoNo}. Rejection: ${reasonName}`
                                    })
                                },
                                "Create fallback rework Job Order"
                            );
                        } catch (fallbackError) {
                            throw new QAPersistenceError(
                                `Rework Job Order could not be persisted${reworkCreationError ? `: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}` : "."}`
                            );
                        }
                    }

                    reworkJoIdInt = numericRecordId(rData, ["job_order_id"]);
                    if (!reworkJoIdInt) {
                        throw new QAPersistenceError("The persisted rework Job Order did not return a valid ID.");
                    }
                    if (
                        numericRelationId(rData.parent_job_order_id, ["job_order_id", "id"]) !== parentJoIdInt
                        || Number(rData.target_quantity) !== rejQty
                    ) {
                        throw new QAPersistenceError("The persisted rework Job Order is not linked to the expected parent and quantity.");
                    }
                    if (!existingReworkIds.has(reworkJoIdInt)) {
                        transactionState.reworkJobOrderId = reworkJoIdInt;
                    }
                    spawnedReworkJo = {
                        job_order_id: reworkJoIdInt,
                        job_order_no: String(rData.job_order_no || reworkJoNo),
                        target_quantity: Number(rData.target_quantity),
                        status: String(rData.status || "Released")
                    };
                }

                // 4. Insert Inspection Record into qa_jo_inspection_logs.
                const inspectionLogPayload = {
                    job_order_id: parentJoIdInt,
                    inspected_quantity: inspQty,
                    passed_quantity: passQty,
                    rejected_quantity: rejQty,
                    rejection_reason_id: rejQty > 0 ? Number(rejection_reason_id) : null,
                    rework_job_order_id: reworkJoIdInt,
                    inspected_by: userId,
                    inspected_at: new Date().toISOString(),
                    status: rejQty === 0 ? "PASSED" : "REWORK_TRIGGERED",
                    remarks: remarks || (rejQty === 0 ? "100% Passed QA Inspection" : `Rework required: ${rejQty} units due to ${reasonName}`)
                };

                createdLog = await directusMutation(
                    "/items/qa_jo_inspection_logs",
                    {
                        method: "POST",
                        headers,
                        body: JSON.stringify(inspectionLogPayload)
                    },
                    "Create QA inspection log"
                );
                transactionState.inspectionLogId = numericRecordId(createdLog, ["id"]);
                if (!transactionState.inspectionLogId) {
                    throw new QAPersistenceError("The QA inspection log did not return a valid ID.");
                }

                if (rejQty > 0) {
                    const verifyLogRes = await fetch(
                        `${DIRECTUS_URL}/items/qa_jo_inspection_logs/${transactionState.inspectionLogId}?fields=id,job_order_id,inspected_quantity,passed_quantity,rejected_quantity,rework_job_order_id`,
                        { headers, cache: "no-store" }
                    );
                    if (!verifyLogRes.ok) {
                        throw new QAPersistenceError("Unable to verify the saved QA inspection log.");
                    }
                    const persistedLog = (await verifyLogRes.json()).data;
                    if (numericRelationId(persistedLog?.rework_job_order_id, ["job_order_id", "id"]) !== reworkJoIdInt) {
                        throw new QAPersistenceError("The saved QA inspection log is not linked to the rework Job Order.");
                    }
                    createdLog = persistedLog;
                }

                // 5. Update Parent Job Order status and completed/rejected quantities.
                const oldStatus = parentJO.status || "In Progress";
                const newStatus = "COMPLETED"; // Transitions to COMPLETED on QA inspection signoff.

                const newCompletedQty = (Number(parentJO.completed_quantity) || 0) + passQty;
                const newProducedQty = (Number(parentJO.actual_quantity_produced) || 0) + passQty;
                const newRejectedQty = (Number(parentJO.rejected_quantity) || 0) + rejQty;

                await directusMutation(
                    `/items/manufacturing_job_orders/${parentJoIdInt}`,
                    {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({
                            status: newStatus,
                            completed_quantity: newCompletedQty,
                            actual_quantity_produced: newProducedQty,
                            rejected_quantity: newRejectedQty,
                            modified_at: new Date().toISOString()
                        })
                    },
                    "Update parent Job Order QA state"
                );
                transactionState.parentJobOrderPatched = true;

                // 6. Insert audit trail into manufacturing_job_order_status_history.
                const statusHistoryPayload = {
                    job_order_id: parentJoIdInt,
                    old_status: oldStatus,
                    new_status: newStatus,
                    changed_by: userId,
                    changed_at: new Date().toISOString(),
                    remarks: rejQty === 0
                        ? `QA Inspection Completed: 100% Passed (${passQty} units). Transitioned status to COMPLETED.`
                        : `QA Inspection Completed: ${passQty} Passed, ${rejQty} Rejected (${reasonName}). Spawned Rework Job Order ${spawnedReworkJo?.job_order_no || "JO-RWK"}.`
                };
                const createdStatusHistory = await directusMutation(
                    "/items/manufacturing_job_order_status_history",
                    {
                        method: "POST",
                        headers,
                        body: JSON.stringify(statusHistoryPayload)
                    },
                    "Create Job Order status history"
                );
                transactionState.statusHistoryId = numericRecordId(createdStatusHistory, ["history_id", "id"]);
                if (!transactionState.statusHistoryId) {
                    throw new QAPersistenceError("The Job Order status history did not return a valid ID.");
                }

                // 7. Positive Finished Goods Inventory Movement (if passed_quantity > 0).
                if (passQty > 0) {
                    const finishedLotId = await resolveMasterLotId(finalLotNo, 2, branchId, productId); // 2 = Finished Goods
                    const movementPayload = {
                        product_id: productId,
                        mm_lot_id: finishedLotId,
                        lot_id: null,
                        branch_id: branchId,
                        transaction_type_id: 2, // Job Order Finished Goods Receipt
                        source_document_id: parentJoIdInt,
                        source_document_no: parentJoNo,
                        version_id: versionId,
                        batch_no: finalLotNo,
                        expiry_date: finalExpDate,
                        manufacturing_date: finalMfgDate,
                        quantity: passQty,
                        created_by: userId,
                        remarks: `Positive finished goods receipt from QA Inspection of Job Order ${parentJoNo}`
                    };

                    createdMovement = await directusMutation(
                        "/items/inventory_movements",
                        {
                            method: "POST",
                            headers,
                            body: JSON.stringify(movementPayload)
                        },
                        "Create finished goods inventory movement"
                    );
                    transactionState.inventoryMovementId = numericRecordId(createdMovement, ["movement_id", "id"]);
                    if (!transactionState.inventoryMovementId) {
                        throw new QAPersistenceError("The finished goods inventory movement did not return a valid ID.");
                    }

                    // Also post to product_ledger for warehouse consistency
                    const createdProductLedger = await directusMutation(
                        "/items/product_ledger",
                        {
                            method: "POST",
                            headers,
                            body: JSON.stringify({
                                branchId: branchId,
                                productId: productId,
                                quantity: passQty,
                                documentType: "Job Order Receipt",
                                documentNo: parentJoNo,
                                documentDescription: `QA Passed Yield: ${finalLotNo}`,
                                documentDate: todayStr
                            })
                        },
                        "Create product ledger entry"
                    );
                    transactionState.productLedgerId = numericRecordId(createdProductLedger, ["id", "ledger_id"]);
                    if (!transactionState.productLedgerId) {
                        throw new QAPersistenceError("The product ledger entry did not return a valid ID.");
                    }
                }

                return NextResponse.json({
                    success: true,
                    message: rejQty === 0
                        ? `QA Inspection 100% Passed. Job Order ${parentJoNo} is marked COMPLETED with ${passQty} units released to inventory.`
                        : `QA Inspection logged: ${passQty} units passed to inventory, ${rejQty} units rejected. Standalone Rework Job Order ${spawnedReworkJo?.job_order_no || "JO-RWK"} spawned successfully.`,
                    inspectionLog: createdLog,
                    jobOrderStatus: newStatus,
                    reworkJobOrder: spawnedReworkJo,
                    inventoryMovement: createdMovement
                });
            } catch (error) {
                const rollbackFailures = await rollbackTwoPointWrites(transactionState);
                const message = error instanceof Error ? error.message : "Two-point QA persistence failed.";
                return NextResponse.json({
                    error: rollbackFailures.length > 0
                        ? `${message} Rollback was incomplete: ${rollbackFailures.join(" ")}`
                        : message
                }, { status: error instanceof QAPersistenceError ? error.statusCode : 502 });
            }
        }

        // Action: Verify a QA routing step checklist
        if (action === "verify") {
            const {
                joId,
                taskId,
                taskName,
                productName,
                expectedQty,
                actualQty,
                verifications,
                comments,
                userId
            } = body;

            if (!joId || !taskId) {
                return NextResponse.json({ error: "Missing joId or taskId" }, { status: 400 });
            }

            const joInfo = await getJobOrderIdByNo(joId);
            if (!joInfo) {
                return NextResponse.json({ error: `Job Order not found: ${joId}` }, { status: 404 });
            }
            const joIdInt = joInfo.id;
            const hasCriticalFailure = verifications?.some((v: any) => v.is_failed && v.is_critical);

            if (hasCriticalFailure) {
                const taskIdInt = Number(taskId);
                if (!Number.isSafeInteger(taskIdInt) || taskIdInt <= 0) {
                    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
                }

                const metadata = await resolveDispositionMetadata(joIdInt, taskIdInt);
                const newDisp = {
                    id: `DISP-${Date.now()}`,
                    job_order_id: joIdInt,
                    jo_id: metadata.jo_id || joId,
                    product_id: metadata.product_id || (joInfo.productId > 0 ? joInfo.productId : null),
                    task_id: metadata.task_id || taskIdInt,
                    task_name: metadata.task_name || taskName || "Routing Task",
                    station_id: metadata.station_id,
                    station_name: metadata.station_name,
                    product_name: metadata.product_name || productName || "Product unavailable",
                    expected_quantity: Number(expectedQty ?? metadata.expected_quantity ?? 0),
                    actual_quantity: Number(actualQty ?? 0),
                    failed_parameters: verifications.filter((v: any) => v.is_failed),
                    disposition_status: "Pending",
                    decision: null,
                    supervisor_comments: "",
                    inspection_remarks: comments || "",
                    recorded_at: new Date().toISOString(),
                    resolved_at: null,
                    resolved_by: null
                };

                let jobOrderPatched = false;
                try {
                    await directusMutation(
                        `/items/manufacturing_job_orders/${joIdInt}`,
                        {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ status: "On Hold" })
                        },
                        "Place Job Order on QA Hold"
                    );
                    jobOrderPatched = true;
                    const persistedDisposition = await createDisposition(newDisp);

                    return NextResponse.json({
                        success: false,
                        onHold: true,
                        message: "Critical parameter failure detected. Job Order has been placed ON HOLD.",
                        disposition: persistedDisposition
                    });
                } catch (error) {
                    const rollbackFailures: string[] = [];
                    if (jobOrderPatched && joInfo.status) {
                        try {
                            await directusMutation(
                                `/items/manufacturing_job_orders/${joIdInt}`,
                                {
                                    method: "PATCH",
                                    headers,
                                    body: JSON.stringify({ status: joInfo.status })
                                },
                                "Rollback Job Order QA Hold"
                            );
                        } catch (rollbackError) {
                            rollbackFailures.push(rollbackError instanceof Error ? rollbackError.message : "Job Order rollback failed.");
                        }
                    }
                    const message = error instanceof Error ? error.message : "QA disposition persistence failed.";
                    throw new DispositionPersistenceError(
                        rollbackFailures.length > 0
                            ? `${message} Rollback was incomplete: ${rollbackFailures.join(" ")}`
                            : message
                    );
                }
            } else {
                return NextResponse.json({
                    success: true,
                    onHold: false,
                    message: "All quality checks completed successfully."
                });
            }
        }

        // Action: Resolve a supervisor disposition override
        if (action === "disposition") {
            const { dispositionId, decision, supervisorComments, userId } = body;
            if (!dispositionId || !decision) {
                return NextResponse.json({ error: "Missing dispositionId or decision" }, { status: 400 });
            }

            const disp = await getDisposition(String(dispositionId));
            if (!disp) {
                return NextResponse.json({ error: "Disposition record not found" }, { status: 404 });
            }

            const dispositionJobOrderNo = String(disp.jo_id || "");
            const storedJobOrderId = Number(disp.job_order_id);
            const joInfo = Number.isSafeInteger(storedJobOrderId) && storedJobOrderId > 0
                ? await getJobOrderById(storedJobOrderId)
                : await getJobOrderIdByNo(dispositionJobOrderNo);
            if (!joInfo) {
                return NextResponse.json({ error: `Job Order not found: ${dispositionJobOrderNo}` }, { status: 404 });
            }
            const joIdInt = joInfo.id;

            const targetStatus = decision === "Scrap" ? "Cancelled" : "In Progress";
            let jobOrderPatched = false;
            try {
                await directusMutation(
                    `/items/manufacturing_job_orders/${joIdInt}`,
                    {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ status: targetStatus })
                    },
                    "Update Job Order after QA disposition"
                );
                jobOrderPatched = true;

                await updateDisposition(String(dispositionId), {
                    disposition_status: "Resolved",
                    decision,
                    supervisor_comments: supervisorComments || "",
                    resolved_at: new Date().toISOString(),
                    resolved_by: Number.isSafeInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null
                });
            } catch (error) {
                const rollbackFailures: string[] = [];
                if (jobOrderPatched && joInfo.status) {
                    try {
                        await directusMutation(
                            `/items/manufacturing_job_orders/${joIdInt}`,
                            {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify({ status: joInfo.status })
                            },
                            "Rollback Job Order after QA disposition failure"
                        );
                    } catch (rollbackError) {
                        rollbackFailures.push(rollbackError instanceof Error ? rollbackError.message : "Job Order rollback failed.");
                    }
                }
                const message = error instanceof Error ? error.message : "QA disposition resolution failed.";
                throw new DispositionPersistenceError(
                    rollbackFailures.length > 0
                        ? `${message} Rollback was incomplete: ${rollbackFailures.join(" ")}`
                        : message
                );
            }

            return NextResponse.json({
                success: true,
                message: `Disposition resolved successfully as ${decision}.`
            });
        }

        return NextResponse.json({ error: "Invalid action parameter" }, { status: 400 });
    } catch (e) {
        console.error("API Error in QA POST:", e);
        return NextResponse.json(
            { error: (e as Error).message || "Failed to save QA action" },
            { status: e instanceof DispositionPersistenceError ? e.statusCode : 500 }
        );
    }
}
