import * as repo from "./scrap-rejection.repo";
import {
    RawJobOrder,
    RawInspectionLog,
    RawYieldLedger,
    RawJobOrderMaterial,
    RawProduct,
    RawBranch,
    RawRejectionReason,
    RawRoute,
    RawRouteOperator,
    RawWorkCenter,
    RawOperation,
    RawUser
} from "./scrap-rejection.repo";
import {
    ScrapReportRow,
    ScrapSummaryKPIs,
    ScrapMasterData,
    DefectCategorySummary,
    ScrapDetailBreakdown,
    MaterialLossDetailItem,
    ReworkLaborDetailItem,
    InspectionLogItem
} from "../types/scrap-rejection.types";
import { calculateScrapRate, computeScrapSummaryKPIs } from "./scrap-rejection.helpers";

export async function getScrapAndRejectionReportData(): Promise<{
    rows: ScrapReportRow[];
    summary: ScrapSummaryKPIs;
    defectCategories: DefectCategorySummary[];
    masterData: ScrapMasterData;
}> {
    const [
        jobOrdersRaw,
        inspectionLogsRaw,
        rejectionReasonsRaw,
        yieldLedgersRaw,
        materialsRaw,
        routesRaw,
        routeOperatorsRaw,
        productsRaw,
        branchesRaw
    ] = await Promise.all([
        repo.fetchAllJobOrders(),
        repo.fetchQAInspectionLogs(),
        repo.fetchQARejectionReasons(),
        repo.fetchYieldLedgers(),
        repo.fetchJobOrderMaterials(),
        repo.fetchJobOrderRoutes(),
        repo.fetchRouteOperators(),
        repo.fetchProducts(),
        repo.fetchBranches()
    ]);

    // Product lookup map (with cost)
    const productMap = new Map<number, { name: string; code: string; cost: number }>();
    productsRaw.forEach((p: RawProduct) => {
        const cost = Number(p.cost_per_unit || p.estimated_unit_cost || 0);
        productMap.set(p.product_id, {
            name: p.product_name || "Unknown Product",
            code: p.product_code || `PRD-${p.product_id}`,
            cost
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
            category: r.category || "Uncategorized"
        });
    });

    // Index QA logs by job_order_id
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

    // Index materials by job_order_id
    const materialsByJO = new Map<number, RawJobOrderMaterial[]>();
    materialsRaw.forEach((m: RawJobOrderMaterial) => {
        const joId = m.job_order_id;
        if (!materialsByJO.has(joId)) {
            materialsByJO.set(joId, []);
        }
        materialsByJO.get(joId)!.push(m);
    });

    // Index routes and operators by job_order_id
    const routesByJO = new Map<number, RawRoute[]>();
    const routeIdToJO = new Map<number, number>();
    routesRaw.forEach((r: RawRoute) => {
        const joId = r.job_order_id;
        routeIdToJO.set(r.jo_route_id, joId);
        if (!routesByJO.has(joId)) {
            routesByJO.set(joId, []);
        }
        routesByJO.get(joId)!.push(r);
    });

    const routeOperatorsByJO = new Map<number, RawRouteOperator[]>();
    routeOperatorsRaw.forEach((ro: RawRouteOperator) => {
        const joId = routeIdToJO.get(ro.jo_route_id);
        if (joId) {
            if (!routeOperatorsByJO.has(joId)) {
                routeOperatorsByJO.set(joId, []);
            }
            routeOperatorsByJO.get(joId)!.push(ro);
        }
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

    // Track defect category aggregates
    const defectCategoryMap = new Map<string, { count: number; rejectedQty: number }>();

    const rows: ScrapReportRow[] = jobOrdersRaw.map((jo: RawJobOrder) => {
        const joId = Number(jo.job_order_id);
        const productInfo = productMap.get(jo.product_id) || { name: `Product #${jo.product_id}`, code: "—", cost: 0 };
        const branchName = branchMap.get(jo.branch_id) || `Branch #${jo.branch_id}`;

        const joLogs = inspectionLogsByJO.get(joId) || [];
        const joLedgers = yieldLedgersByJO.get(joId) || [];
        const joMaterials = materialsByJO.get(joId) || [];
        const joOperators = routeOperatorsByJO.get(joId) || [];
        const linkedReworks = reworkOrdersByParent.get(joId) || [];

        const targetQuantity = Number(jo.target_quantity || 0);
        const actualQuantityProduced = Number(jo.actual_quantity_produced || 0);
        const completedQuantity = Number(jo.completed_quantity || 0);

        let totalInspected = 0;
        let totalPassed = 0;
        let totalRejected = 0;
        let reworkQuantity = 0;
        const reasonsCount: Record<string, number> = {};
        const categoriesCount: Record<string, number> = {};

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
                    reasonsCount[r.name] = (reasonsCount[r.name] || 0) + rej;
                    const cat = r.category || "General Quality";
                    categoriesCount[cat] = (categoriesCount[cat] || 0) + rej;

                    const catStat = defectCategoryMap.get(cat) || { count: 0, rejectedQty: 0 };
                    catStat.count += 1;
                    catStat.rejectedQty += rej;
                    defectCategoryMap.set(cat, catStat);
                }
            });
        } else {
            totalInspected = completedQuantity > 0 ? completedQuantity : actualQuantityProduced;
            totalPassed = actualQuantityProduced;
            totalRejected = Number(jo.rejected_quantity || 0);
        }

        // Ledger Scrap & Material Loss calculation
        const ledgerScrap = joLedgers.reduce((sum, l) => sum + Number(l.scrap_quantity || 0), 0);
        const scrapQuantity = ledgerScrap > 0 ? ledgerScrap : Math.max(0, totalRejected - reworkQuantity);

        // Material loss in PHP calculated across BOM materials
        let materialLossPhp = 0;
        if (joMaterials.length > 0) {
            joMaterials.forEach((m: RawJobOrderMaterial) => {
                const matScrap = Number(m.scrap_quantity || 0);
                const matProd = productMap.get(m.product_id);
                const unitCost = matProd?.cost || 0;
                materialLossPhp += matScrap * unitCost;
            });
        } else {
            // Fallback valuation using FG cost if BOM materials not recorded
            materialLossPhp = scrapQuantity * productInfo.cost;
        }

        // Rework Labor Hours & Cost calculation
        let reworkHours = 0;
        let reworkLaborCostPhp = 0;

        // Collect operators from this JO if it is a rework order, plus any linked rework orders
        joOperators.forEach((ro: RawRouteOperator) => {
            const hrs = Number(ro.logged_hours || 0);
            const rate = Number(ro.hourly_rate || 0);
            if (jo.parent_job_order_id || (jo.job_order_no || "").includes("-RWK-")) {
                reworkHours += hrs;
                reworkLaborCostPhp += hrs * rate;
            }
        });

        linkedReworks.forEach((childJo: RawJobOrder) => {
            const childOperators = routeOperatorsByJO.get(childJo.job_order_id) || [];
            childOperators.forEach((ro: RawRouteOperator) => {
                const hrs = Number(ro.logged_hours || 0);
                const rate = Number(ro.hourly_rate || 0);
                reworkHours += hrs;
                reworkLaborCostPhp += hrs * rate;
            });
        });

        // Resolve top defect category & reason
        let topDefectCategory: string | null = null;
        let maxCatQty = 0;
        Object.entries(categoriesCount).forEach(([cat, qty]) => {
            if (qty > maxCatQty) {
                maxCatQty = qty;
                topDefectCategory = cat;
            }
        });

        let topRejectionReason: string | null = null;
        let maxReasonQty = 0;
        Object.entries(reasonsCount).forEach(([reason, qty]) => {
            if (qty > maxReasonQty) {
                maxReasonQty = qty;
                topRejectionReason = reason;
            }
        });

        const isReworkOrder = Boolean(jo.parent_job_order_id) || (jo.job_order_no || "").includes("-RWK-");
        const totalBase = actualQuantityProduced + scrapQuantity;
        const scrapRatePercentage = calculateScrapRate(scrapQuantity, totalBase > 0 ? totalBase : targetQuantity);
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
            scrap_quantity: Math.round(scrapQuantity * 100) / 100,
            scrap_rate_percentage: scrapRatePercentage,
            material_loss_php: Math.round(materialLossPhp * 100) / 100,
            rework_quantity: Math.round(reworkQuantity * 100) / 100,
            rework_hours: Math.round(reworkHours * 100) / 100,
            rework_labor_cost_php: Math.round(reworkLaborCostPhp * 100) / 100,
            top_defect_category: topDefectCategory,
            top_rejection_reason: topRejectionReason,
            status: jo.status || "Draft",
            date,
            start_date: jo.start_date || null,
            end_date: jo.end_date || null,
            production_completed_at: jo.production_completed_at || null,
            closed_at: jo.closed_at || null
        };
    });

    // Compute Defect Categories Pareto
    const totalDefectsCount = Array.from(defectCategoryMap.values()).reduce((sum, c) => sum + c.rejectedQty, 0);
    const defectCategories: DefectCategorySummary[] = Array.from(defectCategoryMap.entries())
        .map(([category, stats]) => ({
            category,
            defectCount: stats.count,
            rejectedQuantity: Math.round(stats.rejectedQty * 100) / 100,
            percentage: totalDefectsCount > 0 ? Math.round((stats.rejectedQty / totalDefectsCount) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.rejectedQuantity - a.rejectedQuantity);

    // Compute Summary KPIs
    const summary = computeScrapSummaryKPIs(rows, defectCategories);

    // Build Master Data Options
    const uniqueStatuses = Array.from(new Set(rows.map(r => r.status))).filter(Boolean);
    const uniqueDefectCategories = Array.from(new Set(rejectionReasonsRaw.map(r => r.category).filter(Boolean))) as string[];

    const masterData: ScrapMasterData = {
        branches: branchesRaw.map((b: RawBranch) => ({ id: b.id, label: b.branch_name || `Branch #${b.id}`, code: b.branch_code || "" })),
        products: productsRaw.map((p: RawProduct) => ({ id: p.product_id, label: p.product_name || `Product #${p.product_id}`, code: p.product_code || "" })),
        defectCategories: uniqueDefectCategories,
        rejectionReasons: rejectionReasonsRaw.map((r: RawRejectionReason) => ({ id: r.id, reason_code: r.reason_code || "", reason_name: r.reason_name || "", category: r.category || null })),
        statuses: uniqueStatuses
    };

    return {
        rows,
        summary,
        defectCategories,
        masterData
    };
}

export async function getScrapJobOrderDetail(jobOrderId: number): Promise<ScrapDetailBreakdown | null> {
    const [
        jo,
        inspectionLogsRaw,
        rejectionReasonsRaw,
        materialsRaw,
        routesRaw,
        routeOperatorsRaw,
        workCentersRaw,
        operationsRaw,
        usersRaw,
        productsRaw,
        branchesRaw
    ] = await Promise.all([
        repo.fetchJobOrderById(jobOrderId),
        repo.fetchQAInspectionLogs([jobOrderId]),
        repo.fetchQARejectionReasons(),
        repo.fetchJobOrderMaterials([jobOrderId]),
        repo.fetchJobOrderRoutes([jobOrderId]),
        repo.fetchRouteOperators(),
        repo.fetchWorkCenters(),
        repo.fetchOperations(),
        repo.fetchUsers(),
        repo.fetchProducts(),
        repo.fetchBranches()
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

    const reasonMap = new Map<number, { code: string; name: string; category?: string | null }>();
    rejectionReasonsRaw.forEach((r: RawRejectionReason) => {
        reasonMap.set(r.id, {
            code: r.reason_code || "",
            name: r.reason_name || "",
            category: r.category || null
        });
    });

    const productMap = new Map<number, { name: string; code: string; cost: number }>();
    productsRaw.forEach((p: RawProduct) => {
        productMap.set(p.product_id, {
            name: p.product_name || "Unknown Product",
            code: p.product_code || `PRD-${p.product_id}`,
            cost: Number(p.cost_per_unit || p.estimated_unit_cost || 0)
        });
    });

    // Material Losses
    let totalMaterialLoss = 0;
    const materialLosses: MaterialLossDetailItem[] = materialsRaw.map((m: RawJobOrderMaterial) => {
        const prod = productMap.get(m.product_id);
        const scrapQty = Number(m.scrap_quantity || 0);
        const unitCost = prod?.cost || 0;
        const lossPhp = Math.round(scrapQty * unitCost * 100) / 100;
        totalMaterialLoss += lossPhp;

        return {
            jo_material_id: m.jo_material_id,
            product_id: m.product_id,
            product_name: prod?.name || `Material #${m.product_id}`,
            product_code: prod?.code || `MAT-${m.product_id}`,
            allocated_quantity: Number(m.allocated_quantity || 0),
            actual_consumed_quantity: Number(m.actual_consumed_quantity || 0),
            scrap_quantity: scrapQty,
            unit_cost: unitCost,
            total_material_loss_php: lossPhp
        };
    });

    // Rework Labor
    const routeIdSet = new Set(routesRaw.map(r => r.jo_route_id));
    const joRouteMap = new Map<number, RawRoute>();
    routesRaw.forEach(r => joRouteMap.set(r.jo_route_id, r));

    let totalReworkHours = 0;
    let totalReworkCost = 0;
    const reworkLabor: ReworkLaborDetailItem[] = [];

    routeOperatorsRaw.forEach((ro: RawRouteOperator) => {
        if (routeIdSet.has(ro.jo_route_id)) {
            const r = joRouteMap.get(ro.jo_route_id);
            const hrs = Number(ro.logged_hours || 0);
            const rate = Number(ro.hourly_rate || 0);
            const cost = Math.round(hrs * rate * 100) / 100;
            totalReworkHours += hrs;
            totalReworkCost += cost;

            reworkLabor.push({
                jo_route_operator_id: ro.jo_route_operator_id,
                jo_route_id: ro.jo_route_id,
                operator_id: ro.operator_id,
                operator_name: userMap.get(ro.operator_id) || `Operator #${ro.operator_id}`,
                work_center_name: (r?.work_center_id ? workCenterMap.get(r.work_center_id) : undefined) || "Standard Workstation",
                operation_name: (r?.operation_id ? operationMap.get(r.operation_id) : undefined) || "Rework Operation",
                logged_hours: hrs,
                hourly_rate: rate,
                labor_cost_php: cost,
                started_at: ro.started_at || null,
                stopped_at: ro.stopped_at || null
            });
        }
    });

    // Inspection logs
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

    const targetQty = Number(jo.target_quantity || 0);
    const producedQty = Number(jo.actual_quantity_produced || 0);
    const scrapQty = Number(jo.rejected_quantity || 0);
    const scrapRate = calculateScrapRate(scrapQty, producedQty + scrapQty > 0 ? producedQty + scrapQty : targetQty);

    return {
        job_order_id: jo.job_order_id,
        job_order_no: jo.job_order_no,
        product_name: product?.product_name || `Product #${jo.product_id}`,
        product_code: product?.product_code || `PRD-${jo.product_id}`,
        branch_name: branch?.branch_name || `Branch #${jo.branch_id}`,
        status: jo.status || "Draft",
        target_quantity: targetQty,
        actual_quantity_produced: producedQty,
        scrap_quantity: scrapQty,
        scrap_rate_percentage: scrapRate,
        total_material_loss_php: Math.round(totalMaterialLoss * 100) / 100,
        total_rework_hours: Math.round(totalReworkHours * 100) / 100,
        total_rework_labor_cost_php: Math.round(totalReworkCost * 100) / 100,
        material_losses: materialLosses,
        rework_labor: reworkLabor,
        inspection_logs: inspectionLogs
    };
}
