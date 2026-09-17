import * as repo from "./fpy.repo";
import {
    RawJobOrder,
    RawInspectionLog,
    RawYieldLedger,
    RawProduct,
    RawBranch,
    RawRejectionReason,
    RawRoute,
    RawQaRecord,
    RawWorkCenter,
    RawOperation,
    RawUser,
    RawQualityParam
} from "./fpy.repo";
import {
    FPYReportRow,
    FPYSummaryKPIs,
    FPYMasterData,
    FPYDetailBreakdown,
    InspectionLogItem,
    RouteStepItem,
    ParameterQARecord,
    ShiftYieldLedgerItem,
    LinkedReworkOrderItem
} from "../types/fpy.types";

export function determineQualityTier(fpyPercent: number): "Excellent" | "Acceptable" | "Needs Attention" {
    if (fpyPercent >= 95) return "Excellent";
    if (fpyPercent >= 85) return "Acceptable";
    return "Needs Attention";
}

export async function getFPYReportData(): Promise<{
    rows: FPYReportRow[];
    summary: FPYSummaryKPIs;
    masterData: FPYMasterData;
}> {
    const [
        jobOrdersRaw,
        inspectionLogsRaw,
        rejectionReasonsRaw,
        yieldLedgersRaw,
        productsRaw,
        branchesRaw
    ] = await Promise.all([
        repo.fetchAllJobOrders(),
        repo.fetchQAInspectionLogs(),
        repo.fetchQARejectionReasons(),
        repo.fetchYieldLedgers(),
        repo.fetchProducts(),
        repo.fetchBranches()
    ]);

    // Product lookup map
    const productMap = new Map<number, { name: string; code: string }>();
    productsRaw.forEach((p: RawProduct) => {
        productMap.set(p.product_id, {
            name: p.product_name || "Unknown Product",
            code: p.product_code || `PRD-${p.product_id}`
        });
    });

    // Branch lookup map
    const branchMap = new Map<number, string>();
    branchesRaw.forEach((b: RawBranch) => {
        branchMap.set(b.id, b.branch_name || `Branch #${b.id}`);
    });

    // Rejection reasons lookup map
    const rejectionReasonMap = new Map<number, { code: string; name: string; category?: string | null }>();
    rejectionReasonsRaw.forEach((r: RawRejectionReason) => {
        rejectionReasonMap.set(r.id, {
            code: r.reason_code || "",
            name: r.reason_name || "Unknown Defect",
            category: r.category || null
        });
    });

    // Index inspection logs by job_order_id
    const inspectionLogsByJO = new Map<number, RawInspectionLog[]>();
    inspectionLogsRaw.forEach((log: RawInspectionLog) => {
        const joId = log.job_order_id;
        if (!inspectionLogsByJO.has(joId)) {
            inspectionLogsByJO.set(joId, []);
        }
        inspectionLogsByJO.get(joId)!.push(log);
    });

    // Index yield ledgers by job_order_id
    const yieldLedgersByJO = new Map<number, RawYieldLedger[]>();
    yieldLedgersRaw.forEach((yl: RawYieldLedger) => {
        const joId = yl.job_order_id;
        if (!yieldLedgersByJO.has(joId)) {
            yieldLedgersByJO.set(joId, []);
        }
        yieldLedgersByJO.get(joId)!.push(yl);
    });

    // Index child/rework job orders by parent_job_order_id
    const reworkOrdersByParent = new Map<number, RawJobOrder[]>();
    jobOrdersRaw.forEach((jo: RawJobOrder) => {
        if (jo.parent_job_order_id) {
            const pId = Number(jo.parent_job_order_id);
            if (!reworkOrdersByParent.has(pId)) {
                reworkOrdersByParent.set(pId, []);
            }
            reworkOrdersByParent.get(pId)!.push(jo);
        }
    });

    // Defect frequency counter
    const defectFrequency = new Map<string, number>();

    const rows: FPYReportRow[] = jobOrdersRaw.map((jo: RawJobOrder) => {
        const joId = Number(jo.job_order_id);
        const productInfo = productMap.get(jo.product_id) || { name: `Product #${jo.product_id}`, code: "—" };
        const branchName = branchMap.get(jo.branch_id) || `Branch #${jo.branch_id}`;

        const joLogs = inspectionLogsByJO.get(joId) || [];
        const joLedgers = yieldLedgersByJO.get(joId) || [];
        const linkedReworks = reworkOrdersByParent.get(joId) || [];

        const targetQuantity = Number(jo.target_quantity || 0);
        const actualQuantityProduced = Number(jo.actual_quantity_produced || 0);
        const completedQuantity = Number(jo.completed_quantity || 0);

        let totalInspected = 0;
        let totalPassed = 0;
        let totalRejected = 0;
        let reworkQuantity = 0;
        const topReasons: Record<string, number> = {};
        let dominantCategory: string | null = null;

        if (joLogs.length > 0) {
            joLogs.forEach((log: RawInspectionLog) => {
                const insp = Number(log.inspected_quantity || 0);
                const pass = Number(log.passed_quantity || 0);
                const rej = Number(log.rejected_quantity || 0);

                totalInspected += insp;
                totalPassed += pass;
                totalRejected += rej;

                const statusUpper = (log.status || "").toUpperCase();
                const isReworkTriggered = Boolean(log.rework_job_order_id) || statusUpper.includes("REWORK");

                if (isReworkTriggered) {
                    reworkQuantity += rej;
                }

                if (log.rejection_reason_id && rejectionReasonMap.has(log.rejection_reason_id)) {
                    const r = rejectionReasonMap.get(log.rejection_reason_id)!;
                    topReasons[r.name] = (topReasons[r.name] || 0) + rej;
                    if (r.category) dominantCategory = r.category;
                    defectFrequency.set(r.name, (defectFrequency.get(r.name) || 0) + rej);
                }
            });
        } else {
            // If no final QA inspection logs exist, evaluate based on production quantities
            totalInspected = completedQuantity > 0 ? completedQuantity : (actualQuantityProduced > 0 ? actualQuantityProduced : 0);
            totalPassed = actualQuantityProduced;
            totalRejected = Number(jo.rejected_quantity || 0);
        }

        // If linked rework orders were spawned for this JO, ensure reworkQuantity captures them
        if (linkedReworks.length > 0) {
            const linkedReworkQty = linkedReworks.reduce((sum: number, r: RawJobOrder) => sum + Number(r.target_quantity || 0), 0);
            if (linkedReworkQty > reworkQuantity) {
                reworkQuantity = linkedReworkQty;
            }
            if (reworkQuantity > totalRejected) {
                totalRejected = reworkQuantity;
            }
            if (totalInspected === 0) {
                totalInspected = targetQuantity;
            }
        }

        // Ledger scrap calculation
        const ledgerScrap = joLedgers.reduce((sum: number, l: RawYieldLedger) => sum + Number(l.scrap_quantity || 0), 0);
        const scrapQuantity = ledgerScrap > 0 ? ledgerScrap : Math.max(0, totalRejected - reworkQuantity);

        // FPY %: First-pass passed divided by total inspected
        const fpyPercentage = totalInspected > 0
            ? Math.min(100, Math.max(0, Math.round((totalPassed / totalInspected) * 1000) / 10))
            : (actualQuantityProduced > 0 ? 100 : 0);

        const reworkRatePercentage = totalInspected > 0
            ? (reworkQuantity / totalInspected) * 100
            : 0;

        const scrapRatePercentage = totalInspected > 0
            ? (scrapQuantity / totalInspected) * 100
            : 0;

        // Top rejection reason for this JO
        let topRejectionReason: string | null = null;
        let highestDefectCount = 0;
        Object.entries(topReasons).forEach(([reason, count]) => {
            if (count > highestDefectCount) {
                highestDefectCount = count;
                topRejectionReason = reason;
            }
        });

        const isReworkOrder = Boolean(jo.parent_job_order_id) || (jo.job_order_no || "").includes("-RWK-");
        const linkedReworkNos = linkedReworks.map((r: RawJobOrder) => r.job_order_no);

        // Date resolution for latest-first sorting
        const date = jo.production_completed_at || jo.qa_started_at || jo.created_at || jo.start_date || null;

        return {
            job_order_id: joId,
            job_order_no: jo.job_order_no,
            parent_job_order_id: jo.parent_job_order_id ? Number(jo.parent_job_order_id) : null,
            is_rework_order: isReworkOrder,
            branch_id: jo.branch_id,
            branch_name: branchName,
            product_id: jo.product_id,
            product_name: productInfo.name,
            product_code: productInfo.code,
            target_quantity: targetQuantity,
            actual_quantity_produced: actualQuantityProduced,
            completed_quantity: completedQuantity,
            inspected_quantity: Math.round(totalInspected * 100) / 100,
            passed_quantity: Math.round(totalPassed * 100) / 100,
            rejected_quantity: Math.round(totalRejected * 100) / 100,
            rework_quantity: Math.round(reworkQuantity * 100) / 100,
            scrap_quantity: Math.round(scrapQuantity * 100) / 100,
            fpy_percentage: fpyPercentage,
            rework_rate_percentage: reworkRatePercentage,
            scrap_rate_percentage: scrapRatePercentage,
            rework_count: linkedReworks.length,
            linked_rework_nos: linkedReworkNos,
            top_rejection_reason: topRejectionReason,
            rejection_category: dominantCategory,
            quality_tier: determineQualityTier(fpyPercentage),
            status: jo.status || "Draft",
            date,
            start_date: jo.start_date || null,
            end_date: jo.end_date || null,
            production_completed_at: jo.production_completed_at || null,
            qa_started_at: jo.qa_started_at || null,
            closed_at: jo.closed_at || null
        };
    });

    // Sort rows by latest date descending by default
    rows.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return b.job_order_id - a.job_order_id;
    });

    // Compute Executive Summary KPIs
    const total_jobs = rows.length;
    const total_inspected_units = Math.round(rows.reduce((sum, r) => sum + r.inspected_quantity, 0) * 100) / 100;
    const total_passed_first_time = Math.round(rows.reduce((sum, r) => sum + r.passed_quantity, 0) * 100) / 100;
    const total_reworked_units = Math.round(rows.reduce((sum, r) => sum + r.rework_quantity, 0) * 100) / 100;
    const total_scrapped_units = Math.round(rows.reduce((sum, r) => sum + r.scrap_quantity, 0) * 100) / 100;

    const overall_fpy_percentage = total_inspected_units > 0
        ? Math.round((total_passed_first_time / total_inspected_units) * 1000) / 10
        : 0;

    const overall_rework_rate = total_inspected_units > 0
        ? (total_reworked_units / total_inspected_units) * 100
        : 0;

    const overall_scrap_rate = total_inspected_units > 0
        ? (total_scrapped_units / total_inspected_units) * 100
        : 0;

    const excellent_jobs_count = rows.filter(r => r.quality_tier === "Excellent").length;
    const acceptable_jobs_count = rows.filter(r => r.quality_tier === "Acceptable").length;
    const needs_attention_jobs_count = rows.filter(r => r.quality_tier === "Needs Attention").length;

    // Find top defect reason globally
    let top_defect_reason = "None Recorded";
    let maxGlobalDefects = 0;
    defectFrequency.forEach((count, reason) => {
        if (count > maxGlobalDefects) {
            maxGlobalDefects = count;
            top_defect_reason = `${reason} (${count} units)`;
        }
    });

    const summary: FPYSummaryKPIs = {
        total_jobs,
        total_inspected_units,
        total_passed_first_time,
        total_reworked_units,
        total_scrapped_units,
        overall_fpy_percentage,
        overall_rework_rate,
        overall_scrap_rate,
        excellent_jobs_count,
        acceptable_jobs_count,
        needs_attention_jobs_count,
        top_defect_reason
    };

    // Master Data for Select Filters
    const uniqueBranches = branchesRaw.map((b: RawBranch) => ({
        id: b.id,
        label: b.branch_name || `Branch #${b.id}`,
        code: b.branch_code || ""
    }));

    const uniqueProducts = productsRaw.map((p: RawProduct) => ({
        id: p.product_id,
        label: p.product_name || `Product #${p.product_id}`,
        code: p.product_code || ""
    }));

    const rejectionReasons = rejectionReasonsRaw.map((r: RawRejectionReason) => ({
        id: r.id,
        reason_code: r.reason_code || "",
        reason_name: r.reason_name || "",
        category: r.category || undefined
    }));

    const statuses = Array.from(new Set(rows.map(r => r.status))).filter(Boolean);

    const masterData: FPYMasterData = {
        branches: uniqueBranches,
        products: uniqueProducts,
        rejectionReasons,
        statuses
    };

    return { rows, summary, masterData };
}

export async function getJobOrderFPYBreakdown(jobOrderId: number): Promise<FPYDetailBreakdown | null> {
    const [
        jo,
        inspectionLogsRaw,
        rejectionReasonsRaw,
        routesRaw,
        qaRecordsRaw,
        yieldLedgersRaw,
        workCentersRaw,
        operationsRaw,
        usersRaw,
        productsRaw,
        branchesRaw,
        qualityParamsRaw,
        allJobOrdersRaw
    ] = await Promise.all([
        repo.fetchJobOrderById(jobOrderId),
        repo.fetchQAInspectionLogs([jobOrderId]),
        repo.fetchQARejectionReasons(),
        repo.fetchJobOrderRoutes(jobOrderId),
        repo.fetchJobOrderQaRecords(jobOrderId),
        repo.fetchYieldLedgers([jobOrderId]),
        repo.fetchWorkCenters(),
        repo.fetchOperations(),
        repo.fetchUsers(),
        repo.fetchProducts(),
        repo.fetchBranches(),
        repo.fetchQualityParameters(),
        repo.fetchAllJobOrders()
    ]);

    if (!jo) return null;

    const product = productsRaw.find((p: RawProduct) => p.product_id === jo.product_id);
    const branch = branchesRaw.find((b: RawBranch) => b.id === jo.branch_id);

    const userMap = new Map<number, string>();
    usersRaw.forEach((u: RawUser) => {
        userMap.set(u.user_id, `${u.user_fname || ""} ${u.user_lname || ""}`.trim() || u.user_email || `User #${u.user_id}`);
    });

    const workCenterMap = new Map<number, string>();
    workCentersRaw.forEach((wc: RawWorkCenter) => {
        workCenterMap.set(wc.work_center_id, wc.work_center_name || `Station #${wc.work_center_id}`);
    });

    const operationMap = new Map<number, string>();
    operationsRaw.forEach((op: RawOperation) => {
        operationMap.set(op.id, op.operation_name || `Operation #${op.id}`);
    });

    const paramMap = new Map<number, string>();
    qualityParamsRaw.forEach((qp: RawQualityParam) => {
        paramMap.set(qp.parameter_id, qp.test_name || `Parameter #${qp.parameter_id}`);
    });

    const reasonMap = new Map<number, { code: string; name: string; category?: string | null }>();
    rejectionReasonsRaw.forEach((r: RawRejectionReason) => {
        reasonMap.set(r.id, {
            code: r.reason_code || "",
            name: r.reason_name || "",
            category: r.category || null
        });
    });

    // Format inspection logs
    const inspectionLogs: InspectionLogItem[] = inspectionLogsRaw.map((log: RawInspectionLog) => {
        const reason = log.rejection_reason_id ? reasonMap.get(log.rejection_reason_id) : null;
        return {
            id: log.id,
            job_order_id: log.job_order_id,
            inspected_quantity: Number(log.inspected_quantity || 0),
            passed_quantity: Number(log.passed_quantity || 0),
            rejected_quantity: Number(log.rejected_quantity || 0),
            rejection_reason_id: log.rejection_reason_id || null,
            rejection_reason_name: reason?.name || null,
            rejection_reason_code: reason?.code || null,
            rejection_category: reason?.category || null,
            rework_job_order_id: log.rework_job_order_id || null,
            rework_job_order_no: log.rework_job_order_id ? `JO-RWK-${log.rework_job_order_id}` : null,
            inspected_by: log.inspected_by || null,
            inspector_name: log.inspected_by ? userMap.get(log.inspected_by) || `Inspector #${log.inspected_by}` : null,
            inspected_at: log.inspected_at || null,
            status: log.status || "COMPLETED",
            remarks: log.remarks || null
        };
    });

    // Format route steps
    const routeSteps: RouteStepItem[] = routesRaw.map((r: RawRoute) => ({
        jo_route_id: r.jo_route_id,
        sequence_order: r.sequence_order || 0,
        work_center_name: (r.work_center_id ? workCenterMap.get(r.work_center_id) : null) || `Station #${r.work_center_id ?? "—"}`,
        operation_name: (r.operation_id ? operationMap.get(r.operation_id) : null) || `Operation #${r.operation_id ?? "—"}`,
        planned_run_hours: Number(r.planned_run_hours || 0),
        actual_run_hours: Number(r.actual_run_hours || 0),
        status: r.status || "Pending",
        completed_at: r.completed_at || null,
        requires_qa: Boolean(r.requires_qa)
    }));

    // Format QA parameter records
    const qaRecords: ParameterQARecord[] = qaRecordsRaw.map((rec: RawQaRecord) => ({
        qa_record_id: rec.qa_record_id,
        jo_route_id: rec.jo_route_id || null,
        parameter_id: rec.parameter_id || 0,
        parameter_name: (rec.parameter_id ? paramMap.get(rec.parameter_id) : null) || `Parameter #${rec.parameter_id ?? "—"}`,
        value_text: rec.value_text || null,
        value_numeric: rec.value_numeric !== null && rec.value_numeric !== undefined ? Number(rec.value_numeric) : null,
        value_boolean: rec.value_boolean !== null && rec.value_boolean !== undefined ? Boolean(rec.value_boolean) : null,
        is_passed: Boolean(rec.is_passed),
        inspected_at: rec.inspected_at || null,
        remarks: rec.remarks || null
    }));

    // Format yield ledger items
    const yieldLedgers: ShiftYieldLedgerItem[] = yieldLedgersRaw.map((yl: RawYieldLedger) => ({
        ledger_id: yl.ledger_id,
        shift_name: yl.shift_name || "Daily Production",
        yield_quantity: Number(yl.yield_quantity || 0),
        rejected_quantity: Number(yl.rejected_quantity || 0),
        scrap_quantity: Number(yl.scrap_quantity || 0),
        qa_status: yl.qa_status || "Passed",
        lot_number: yl.lot_number || null,
        logged_at: yl.logged_at || null,
        production_date: yl.production_date || null,
        remarks: yl.remarks || null
    }));

    // Find linked rework orders
    const reworkOrders: LinkedReworkOrderItem[] = allJobOrdersRaw
        .filter((o: RawJobOrder) => Number(o.parent_job_order_id) === jobOrderId)
        .map((o: RawJobOrder) => ({
            job_order_id: o.job_order_id,
            job_order_no: o.job_order_no,
            target_quantity: Number(o.target_quantity || 0),
            actual_quantity_produced: Number(o.actual_quantity_produced || 0),
            status: o.status || "Draft",
            created_at: o.created_at || null
        }));

    // Calculate FPY for this JO
    const totalInspected = inspectionLogs.reduce((sum, l) => sum + l.inspected_quantity, 0);
    const totalPassed = inspectionLogs.reduce((sum, l) => sum + l.passed_quantity, 0);
    const fpyPercentage = totalInspected > 0
        ? Math.round((totalPassed / totalInspected) * 1000) / 10
        : (Number(jo.actual_quantity_produced || 0) > 0 ? 100 : 0);

    return {
        jobOrder: {
            job_order_id: jo.job_order_id,
            job_order_no: jo.job_order_no,
            parent_job_order_id: jo.parent_job_order_id ? Number(jo.parent_job_order_id) : null,
            product_name: product?.product_name || `Product #${jo.product_id}`,
            product_code: product?.product_code || `PRD-${jo.product_id}`,
            branch_name: branch?.branch_name || `Branch #${jo.branch_id}`,
            target_quantity: Number(jo.target_quantity || 0),
            actual_quantity_produced: Number(jo.actual_quantity_produced || 0),
            completed_quantity: Number(jo.completed_quantity || 0),
            fpy_percentage: fpyPercentage,
            quality_tier: determineQualityTier(fpyPercentage),
            status: jo.status || "Draft",
            initialized_at: jo.initialized_at || null,
            production_started_at: jo.production_started_at || null,
            production_completed_at: jo.production_completed_at || null,
            qa_started_at: jo.qa_started_at || null,
            closed_at: jo.closed_at || null,
            remarks: jo.remarks || null
        },
        inspectionLogs,
        routeSteps,
        qaRecords,
        yieldLedgers,
        reworkOrders
    };
}
