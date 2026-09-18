import { ContributionMarginRepo } from "./contribution-margin.repo";
import {
    round,
    resolveMarginStatus,
    computeSummaryKPIs,
    aggregateByCategoryLine,
    aggregateByBrandLine
} from "./contribution-margin.helpers";
import {
    ContributionMarginRow,
    ContributionMarginReportResponse,
    ContributionMarginFilters,
    ProductCostBreakdownDetail,
    DirectMaterialLine,
    DirectLaborLine,
    VariableOverheadLine
} from "../types/contribution-margin.types";

export class ContributionMarginService {
    /**
     * Generate full Contribution Margin Report (Strictly Paid invoices)
     */
    static async generateReport(filters?: Partial<ContributionMarginFilters>): Promise<ContributionMarginReportResponse> {
        // Fetch all operational data in parallel
        const [
            invoices,
            returnsData,
            allocationsData,
            manufacturingData,
            routingData,
            catalogData
        ] = await Promise.all([
            ContributionMarginRepo.fetchPaidInvoices(),
            ContributionMarginRepo.fetchSalesReturns(),
            ContributionMarginRepo.fetchSalesOrderAllocations(),
            ContributionMarginRepo.fetchJobOrdersAndConsumage(),
            ContributionMarginRepo.fetchRoutingLaborAndOverheads(),
            ContributionMarginRepo.fetchProductsAndCatalogs()
        ]);

        // Build Product lookup map
        const productsMap = new Map<number, {
            name: string;
            code: string;
            categoryId: number | null;
            brandId: number | null;
            price: number;
            cost: number;
            uomId: number | null;
        }>();

        catalogData.products.forEach(p => {
            const price = Number(p.price_per_unit || 0);
            const cost = Number(p.cost_per_unit || p.estimated_unit_cost || 0);
            productsMap.set(p.product_id, {
                name: String(p.product_name || `Product #${p.product_id}`),
                code: String(p.product_code || `PRD-${p.product_id}`),
                categoryId: p.product_category || null,
                brandId: p.product_brand || null,
                price,
                cost,
                uomId: Number(p.unit_of_measurement || 0) || null
            });
        });

        // Category Map
        const categoryMap = new Map<number, string>();
        catalogData.categories.forEach(c => categoryMap.set(c.category_id, c.category_name));

        // Brand Map
        const brandMap = new Map<number, string>();
        catalogData.brands.forEach(b => brandMap.set(b.brand_id, b.brand_name));

        // Work Center Map
        const workCentersMap = new Map<number, { name: string; rate: number }>();
        routingData.workCenters.forEach(wc => {
            workCentersMap.set(wc.work_center_id, {
                name: wc.work_center_name,
                rate: Number(wc.overhead_cost_per_hour || 0)
            });
        });

        // Filter Paid invoices by date if provided
        let filteredInvoices = invoices;
        if (filters?.startDate) {
            const start = new Date(filters.startDate).getTime();
            filteredInvoices = filteredInvoices.filter(inv => {
                if (!inv.invoice_date) return true;
                return new Date(inv.invoice_date).getTime() >= start;
            });
        }
        if (filters?.endDate) {
            const end = new Date(filters.endDate).getTime() + 86400000;
            filteredInvoices = filteredInvoices.filter(inv => {
                if (!inv.invoice_date) return true;
                return new Date(inv.invoice_date).getTime() <= end;
            });
        }

        const invoiceIds = filteredInvoices.map(i => Number(i.invoice_id)).filter(Boolean);
        const invoiceDetails = await ContributionMarginRepo.fetchInvoiceDetails(invoiceIds);

        const paidInvoiceIdSet = new Set(invoiceIds);
        const invoiceIdToOrderMap = new Map<number, number | string>();
        filteredInvoices.forEach(i => {
            if (i.order_id) {
                invoiceIdToOrderMap.set(Number(i.invoice_id), i.order_id);
            }
        });

        // Map sales returns that strictly belong to the filtered Paid invoices
        const paidInvoiceNoSet = new Set(filteredInvoices.map(i => String(i.invoice_no || "").trim().toLowerCase()).filter(Boolean));
        const paidOrderIdSet = new Set(filteredInvoices.map(i => String(i.order_id || "").trim()).filter(Boolean));

        const matchedReturnNumbers = new Set<string>();
        returnsData.returns.forEach(r => {
            const rInvNo = String(r.invoice_no || "").trim().toLowerCase();
            const rOrdId = String(r.order_id || "").trim();
            const rInvId = Number(r.invoice_no);

            if (
                (rInvNo && paidInvoiceNoSet.has(rInvNo)) ||
                (rOrdId && paidOrderIdSet.has(rOrdId)) ||
                (Number.isFinite(rInvId) && paidInvoiceIdSet.has(rInvId))
            ) {
                if (r.return_number) matchedReturnNumbers.add(r.return_number);
            }
        });

        const productReturnsMap = new Map<number, { qty: number; amount: number }>();
        if (matchedReturnNumbers.size > 0) {
            returnsData.details.forEach(rd => {
                if (!matchedReturnNumbers.has(rd.return_no)) return;
                const pid = Number(rd.product_id);
                const cur = productReturnsMap.get(pid) || { qty: 0, amount: 0 };
                const q = Number(rd.quantity || 0);
                const a = Number(rd.total_amount || rd.gross_amount || 0);
                productReturnsMap.set(pid, { qty: cur.qty + q, amount: cur.amount + a });
            });
        }

        // Map SOD to Job Order Allocations
        const sodToJoMap = new Map<number, number[]>();
        allocationsData.allocations.forEach(a => {
            const sodId = Number(a.sales_order_detail_id);
            const joId = Number(a.job_order_id);
            const list = sodToJoMap.get(sodId) || [];
            list.push(joId);
            sodToJoMap.set(sodId, list);
        });

        const soProdToSodMap = new Map<string, number[]>();
        allocationsData.sodList.forEach(sod => {
            const key = `${sod.order_id}_${sod.product_id}`;
            const list = soProdToSodMap.get(key) || [];
            list.push(Number(sod.detail_id));
            soProdToSodMap.set(key, list);
        });

        // Map Yield Ledger to Job Order
        const ledgerToJoMap = new Map<number, number>();
        manufacturingData.yieldLedgers.forEach(y => {
            ledgerToJoMap.set(Number(y.ledger_id), Number(y.job_order_id));
        });

        // Compute Total Manufacturing Cost (TMC) per Job Order
        const joMaterialsCostMap = new Map<number, number>();
        manufacturingData.consumage.forEach(c => {
            const ledgerId = Number(c.ledger_id);
            const joId = ledgerToJoMap.get(ledgerId);
            if (!joId) return;

            const matProdId = Number(c.product_id);
            const matProd = productsMap.get(matProdId);
            const qty = Number(c.quantity_consumed || 0);
            const uCost = matProd?.cost || 0;
            const currentTotal = joMaterialsCostMap.get(joId) || 0;
            joMaterialsCostMap.set(joId, currentTotal + qty * uCost);
        });

        // Operator Labor per route
        const routeLaborMap = new Map<number, number>();
        routingData.routeOperators.forEach(ro => {
            const rId = Number(ro.jo_route_id);
            const hrs = Number(ro.logged_hours || 0);
            const rate = Number(ro.hourly_rate || 0);
            const current = routeLaborMap.get(rId) || 0;
            routeLaborMap.set(rId, current + hrs * rate);
        });

        // Job Order Labor & Overhead
        const joLaborCostMap = new Map<number, number>();
        const joOverheadCostMap = new Map<number, number>();

        routingData.routes.forEach(r => {
            const joId = Number(r.job_order_id);
            const rId = Number(r.jo_route_id);
            const wcId = Number(r.work_center_id);
            const wc = workCentersMap.get(wcId);
            const runHrs = Number(r.actual_run_hours || r.planned_run_hours || 0);
            const rate = wc?.rate || 0;
            const overheadCost = runHrs * rate;

            const curOvh = joOverheadCostMap.get(joId) || 0;
            joOverheadCostMap.set(joId, curOvh + overheadCost);

            const opLabor = routeLaborMap.get(rId) || Number(r.estimated_labor_cost || 0);
            const curLabor = joLaborCostMap.get(joId) || 0;
            joLaborCostMap.set(joId, curLabor + opLabor);
        });

        // Produced Quantities per JO
        const joProducedQtyMap = new Map<number, number>();
        manufacturingData.jobOrders.forEach(jo => {
            const actualQty = Math.max(
                Number(jo.actual_quantity_produced || 0),
                Number(jo.completed_quantity || 0),
                Number(jo.target_quantity || 1)
            );
            joProducedQtyMap.set(Number(jo.job_order_id), actualQty);
        });

        // Aggregate by Invoiced Product from Paid Invoices
        const productAggregationMap = new Map<number, {
            invoiced_quantity: number;
            gross_revenue: number;
            discount_amount: number;
            net_sales_revenue: number;
            invoices_set: Set<string | number>;
            job_orders_set: Set<number>;
        }>();

        if (invoiceDetails.length > 0) {
            invoiceDetails.forEach(d => {
                const invId = Number(d.invoice_no);
                // Ensure detail belongs to a paid invoice
                if (invoiceIds.length > 0 && !paidInvoiceIdSet.has(invId)) {
                    return;
                }

                const pid = Number(d.product_id);
                if (!pid) return;
                const qty = Number(d.quantity || 0);
                const price = Number(d.unit_price || 0);
                const gross = d.gross_amount !== undefined && d.gross_amount !== null ? Number(d.gross_amount) : (qty * price);
                const net = d.total_amount !== undefined && d.total_amount !== null ? Number(d.total_amount) : (d.net_amount !== undefined && d.net_amount !== null ? Number(d.net_amount) : gross);
                const discount = d.discount_amount !== undefined && d.discount_amount !== null ? Number(d.discount_amount) : Math.max(0, gross - net);

                const current = productAggregationMap.get(pid) || {
                    invoiced_quantity: 0,
                    gross_revenue: 0,
                    discount_amount: 0,
                    net_sales_revenue: 0,
                    invoices_set: new Set(),
                    job_orders_set: new Set()
                };

                current.invoiced_quantity += qty;
                current.gross_revenue += gross;
                current.discount_amount += discount;
                current.net_sales_revenue += net;
                if (d.invoice_no) current.invoices_set.add(d.invoice_no);

                const orderId = d.order_id || invoiceIdToOrderMap.get(invId);
                if (orderId) {
                    const soKey = `${orderId}_${pid}`;
                    const sodIds = soProdToSodMap.get(soKey) || [];
                    sodIds.forEach(sodId => {
                        const joIds = sodToJoMap.get(sodId) || [];
                        joIds.forEach(j => current.job_orders_set.add(j));
                    });
                }

                productAggregationMap.set(pid, current);
            });
        }

        // Build Contribution Margin Rows
        const rows: ContributionMarginRow[] = [];

        productAggregationMap.forEach((agg, pid) => {
            const product = productsMap.get(pid);
            const ret = productReturnsMap.get(pid) || { qty: 0, amount: 0 };

            const effectiveInvoicedQty = agg.invoiced_quantity > 0 ? agg.invoiced_quantity : 1;
            const netRevenue = round(Math.max(0, agg.net_sales_revenue - ret.amount));
            const avgSellingPrice = effectiveInvoicedQty > 0 ? round(netRevenue / effectiveInvoicedQty) : (product?.price || 0);

            // Compute Total Manufacturing Cost (TMC)
            let totalTMC = 0;
            const joIds = Array.from(agg.job_orders_set);

            if (joIds.length > 0) {
                let totalBatchProduced = 0;
                let totalBatchCost = 0;

                joIds.forEach(joId => {
                    const batchQty = joProducedQtyMap.get(joId) || 1;
                    totalBatchProduced += batchQty;

                    const matCost = joMaterialsCostMap.get(joId) || 0;
                    const labCost = joLaborCostMap.get(joId) || 0;
                    const ovhCost = joOverheadCostMap.get(joId) || 0;
                    totalBatchCost += (matCost + labCost + ovhCost);
                });

                if (totalBatchProduced > 0) {
                    const unitTMC = totalBatchCost / totalBatchProduced;
                    totalTMC = round(unitTMC * effectiveInvoicedQty);
                }
            }

            // Fallback to product standard unit cost if production run is unlinked
            const standardCost = product?.cost || 0;
            if (totalTMC === 0 && standardCost > 0) {
                totalTMC = round(effectiveInvoicedQty * standardCost);
            }

            const unitTMC = effectiveInvoicedQty > 0 ? round(totalTMC / effectiveInvoicedQty) : 0;
            const unitCM = round(avgSellingPrice - unitTMC);
            const cmAmount = round(netRevenue - totalTMC);
            const cmRatio = netRevenue > 0 ? round((cmAmount / netRevenue) * 100, 1) : 0;
            const marginStatus = resolveMarginStatus(cmRatio);

            const catId = product?.categoryId || null;
            const catName = catId && categoryMap.has(catId) ? categoryMap.get(catId)! : "Uncategorized";
            const bId = product?.brandId || null;
            const bName = bId && brandMap.has(bId) ? brandMap.get(bId)! : "Unbranded";

            rows.push({
                product_id: pid,
                product_name: product?.name || `Product #${pid}`,
                product_code: product?.code || `PRD-${pid}`,
                category_id: catId,
                category_name: catName,
                brand_id: bId,
                brand_name: bName,
                uom_name: "pcs",
                invoiced_quantity: effectiveInvoicedQty,
                gross_revenue: round(agg.gross_revenue),
                discount_amount: round(agg.discount_amount),
                returned_quantity: round(ret.qty),
                returned_amount: round(ret.amount),
                net_sales_revenue: netRevenue,
                average_selling_price: avgSellingPrice,
                total_manufacturing_cost: totalTMC,
                unit_manufacturing_cost: unitTMC,
                unit_contribution_margin: unitCM,
                contribution_margin_amount: cmAmount,
                contribution_margin_ratio: cmRatio,
                margin_status: marginStatus,
                invoices_count: agg.invoices_set.size,
                job_orders_count: joIds.length,
                job_order_ids: joIds
            });
        });

        // Apply client filters if specified
        let filteredRows = rows;
        if (filters?.categoryId && filters.categoryId !== "ALL") {
            const targetCatId = Number(filters.categoryId);
            filteredRows = filteredRows.filter(r => r.category_id === targetCatId);
        }
        if (filters?.brandId && filters.brandId !== "ALL") {
            const targetBrandId = Number(filters.brandId);
            filteredRows = filteredRows.filter(r => r.brand_id === targetBrandId);
        }
        if (filters?.marginStatus && filters.marginStatus !== "ALL") {
            filteredRows = filteredRows.filter(r => r.margin_status === filters.marginStatus);
        }
        if (filters?.searchQuery && filters.searchQuery.trim()) {
            const query = filters.searchQuery.toLowerCase().trim();
            filteredRows = filteredRows.filter(r =>
                r.product_name.toLowerCase().includes(query) ||
                r.product_code.toLowerCase().includes(query) ||
                r.category_name.toLowerCase().includes(query) ||
                r.brand_name.toLowerCase().includes(query)
            );
        }

        filteredRows.sort((a, b) => b.net_sales_revenue - a.net_sales_revenue);

        // Compute Line Rollups and Summary KPIs
        const categorySummaries = aggregateByCategoryLine(filteredRows);
        const brandSummaries = aggregateByBrandLine(filteredRows);
        const summary = computeSummaryKPIs(filteredRows, categorySummaries, brandSummaries);

        // Available Filter Dropdown Options
        const availableCategories = Array.from(categoryMap.entries()).map(([id, name]) => ({ id, name }));
        const availableBrands = Array.from(brandMap.entries()).map(([id, name]) => ({ id, name }));

        return {
            rows: filteredRows,
            categorySummaries,
            brandSummaries,
            summary,
            availableCategories,
            availableBrands
        };
    }

    /**
     * Fetch itemized cost breakdown drilldown for a specific product
     */
    static async fetchProductCostBreakdown(productId: number): Promise<ProductCostBreakdownDetail | null> {
        const report = await this.generateReport();
        const row = report.rows.find(r => r.product_id === productId);
        if (!row) return null;

        const [manufacturingData, routingData, catalogData] = await Promise.all([
            ContributionMarginRepo.fetchJobOrdersAndConsumage(),
            ContributionMarginRepo.fetchRoutingLaborAndOverheads(),
            ContributionMarginRepo.fetchProductsAndCatalogs()
        ]);

        const productsMap = new Map<number, { name: string; code: string; cost: number }>();
        catalogData.products.forEach(p => {
            productsMap.set(p.product_id, {
                name: String(p.product_name || `Product #${p.product_id}`),
                code: String(p.product_code || `PRD-${p.product_id}`),
                cost: Number(p.cost_per_unit || p.estimated_unit_cost || 0)
            });
        });

        const usersMap = new Map<number, string>();
        routingData.users.forEach(u => {
            const name = [u.user_fname, u.user_lname].filter(Boolean).join(" ");
            usersMap.set(u.user_id, name || `User #${u.user_id}`);
        });

        const workCentersMap = new Map<number, { name: string; rate: number }>();
        routingData.workCenters.forEach(wc => {
            workCentersMap.set(wc.work_center_id, {
                name: wc.work_center_name,
                rate: Number(wc.overhead_cost_per_hour || 0)
            });
        });

        const ledgerToJoMap = new Map<number, number>();
        manufacturingData.yieldLedgers.forEach(y => {
            ledgerToJoMap.set(Number(y.ledger_id), Number(y.job_order_id));
        });

        const joSet = new Set(row.job_order_ids);

        // Materials
        const materials: DirectMaterialLine[] = [];
        manufacturingData.consumage.forEach(c => {
            const joId = ledgerToJoMap.get(Number(c.ledger_id));
            if (!joId || !joSet.has(joId)) return;
            const p = productsMap.get(Number(c.product_id));
            const qty = Number(c.quantity_consumed || 0);
            const uCost = p?.cost || 0;
            materials.push({
                product_name: p?.name || `Material #${c.product_id}`,
                product_code: p?.code || `RAW-${c.product_id}`,
                batch_no: c.batch_no || null,
                quantity_consumed: qty,
                unit_cost: uCost,
                total_cost: qty * uCost
            });
        });

        // Labor
        const labor: DirectLaborLine[] = [];
        const routeIdToJoMap = new Map<number, number>();
        routingData.routes.forEach(r => {
            routeIdToJoMap.set(Number(r.jo_route_id), Number(r.job_order_id));
        });

        routingData.routeOperators.forEach(ro => {
            const joId = routeIdToJoMap.get(Number(ro.jo_route_id));
            if (!joId || !joSet.has(joId)) return;
            const opName = usersMap.get(Number(ro.operator_id)) || `Operator #${ro.operator_id}`;
            const hrs = Number(ro.logged_hours || 0);
            const rate = Number(ro.hourly_rate || 0);
            labor.push({
                operator_name: opName,
                logged_hours: hrs,
                hourly_rate: rate,
                labor_cost: hrs * rate
            });
        });

        // Overheads
        const overheads: VariableOverheadLine[] = [];
        routingData.routes.forEach(r => {
            const joId = Number(r.job_order_id);
            if (!joSet.has(joId)) return;
            const wc = workCentersMap.get(Number(r.work_center_id));
            const hrs = Number(r.actual_run_hours || r.planned_run_hours || 0);
            const rate = wc?.rate || 0;
            overheads.push({
                work_center_name: wc?.name || `Work Center #${r.work_center_id}`,
                actual_run_hours: hrs,
                overhead_cost_per_hour: rate,
                total_overhead_cost: hrs * rate
            });
        });

        return {
            product_id: row.product_id,
            product_name: row.product_name,
            product_code: row.product_code,
            category_name: row.category_name,
            brand_name: row.brand_name,
            invoiced_quantity: row.invoiced_quantity,
            average_selling_price: row.average_selling_price,
            unit_variable_cost: row.unit_manufacturing_cost,
            contribution_margin_amount: row.contribution_margin_amount,
            contribution_margin_ratio: row.contribution_margin_ratio,
            materials,
            labor,
            overheads
        };
    }
}
