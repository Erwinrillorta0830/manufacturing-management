/* eslint-disable */
import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

interface InventoryMovement {
    movement_id: number;
    product_id: number | { product_id: number };
    lot_id?: number;
    branch_id?: number;
    transaction_type_id?: number;
    source_document_id?: number;
    source_document_no?: string | null;
    batch_no?: string;
    expiry_date?: string | null;
    manufacturing_date?: string | null;
    quantity?: string | number;
    created_at?: string;
    remarks?: string | null;
}

interface Product {
    product_id: number;
    product_name?: string;
    product_code?: string;
    product_type?: string | number;
    cost_per_unit?: string | number;
    price_per_unit?: string | number;
    product_category?: {
        category_name?: string;
    } | null;
    unit_of_measurement?: {
        unit_name?: string;
        unit_shortcut?: string;
    } | null;
}

interface QaLog {
    recorded_at: string;
    deviation_quantity?: string | number;
    task_id?: string | number;
}

interface Task {
    id: number;
    jo_id: number;
    status?: string;
}

interface JoProduct {
    jo_id: number;
    product_id: number;
    product_name?: string;
    quantity?: string | number;
    routings?: Array<{ id: number; name?: string }> | null;
}

interface DailyBreakdownDay {
    status?: string;
    completed_steps?: unknown[] | null;
}

interface JobOrder {
    jo_id: number;
    status: string;
    product_name?: string;
    quantity?: string | number;
    due_date?: string;
    daily_breakdown?: DailyBreakdownDay[] | null;
}

interface Invoice {
    invoice_no?: string;
    invoice_id?: string;
    status?: string;
    invoice_date?: string;
    created_date?: string;
}

interface InvoiceDetail {
    invoice_no: string | number;
    product_id: string | number;
    quantity?: string | number;
    unit_price?: string | number;
    net_amount?: string | number;
}

interface ProductVersion {
    version_id: number;
    product_id: number | { product_id: number };
    version_name?: string;
    expected_yield_percentage?: string | number;
    base_quantity?: string | number;
    status?: string;
}

interface RouteStep {
    route_id: number;
    version_id: number | { version_id: number };
    sequence_order: number;
    setup_time_hours?: string | number;
    run_time_hours?: string | number;
    step_batch_size?: string | number;
}

interface RouteBOMItem {
    id: number;
    route_id: number | { route_id: number };
    product_id: number | { product_id: number };
    quantity_required?: string | number;
    wastage_factor_percentage?: string | number;
}

interface DashboardProductItem {
    product_id: number;
    product_name: string;
    product_code: string;
    category: string;
    unit: string;
    unit_shortcut: string;
    cost: number;
    price: number;
    stock: number;
    value: number;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get("startDate") || "";
        const endDate = searchParams.get("endDate") || "";

        const [movementsRes, productsRes, versionsRes, invoiceRes, invoiceDetailsRes, branchesRes, qaLogsRes, tasksRes, routesRes, routesBomRes, joRes, yieldLedgerRes, yieldConsumageRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/inventory_movements?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,product_type,cost_per_unit,price_per_unit,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut,product_category.category_name`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/sales_invoice?limit=-1&sort=-invoice_date`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/sales_invoice_details?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/branches?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?limit=-1&fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_routes?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_routes_bom?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage?limit=-1`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!movementsRes.ok) throw new Error("Failed to fetch inventory_movements");
        if (!productsRes.ok) throw new Error("Failed to fetch products");
        if (!invoiceRes.ok) throw new Error("Failed to fetch sales invoices");
        if (!invoiceDetailsRes.ok) throw new Error("Failed to fetch sales invoice details");
        if (!branchesRes.ok) throw new Error("Failed to fetch branches");

        const movements: InventoryMovement[] = (await movementsRes.json()).data || [];
        const products: Product[] = (await productsRes.json()).data || [];
        const qaLogs: any[] = qaLogsRes && qaLogsRes.ok ? (await qaLogsRes.json()).data || [] : [];
        const tasks: any[] = tasksRes && tasksRes.ok ? (await tasksRes.json()).data || [] : [];
        const jobOrders: any[] = joRes && joRes.ok ? (await joRes.json()).data || [] : [];
        const yieldLogs: any[] = yieldLedgerRes && yieldLedgerRes.ok ? (await yieldLedgerRes.json()).data || [] : [];
        const consumages: any[] = yieldConsumageRes && yieldConsumageRes.ok ? (await yieldConsumageRes.json()).data || [] : [];
        
        // Resolve versions for has_versions check
        const versionProductIds = new Set<number>();
        const versionsRaw: ProductVersion[] = versionsRes && versionsRes.ok ? (await versionsRes.json()).data || [] : [];
        versionsRaw.forEach((v: ProductVersion) => {
            const vProductId = typeof v.product_id === "object" ? Number((v.product_id as any)?.product_id) : Number(v.product_id);
            if (vProductId) versionProductIds.add(vProductId);
        });

        const invoices: Invoice[] = (await invoiceRes.json()).data || [];
        const invoiceDetails: InvoiceDetail[] = (await invoiceDetailsRes.json()).data || [];
        const branches = (await branchesRes.json()).data || [];

        // 1. Group movements by product for correct inventory levels
        const stockMap: Record<number, number> = {};
        movements.forEach((entry: InventoryMovement) => {
            const pId = typeof entry.product_id === "object" ? Number(entry.product_id?.product_id) : Number(entry.product_id);
            const qty = Number(entry.quantity) || 0;
            if (pId) {
                stockMap[pId] = (stockMap[pId] || 0) + qty;
            }
        });

        // 2. Classify products into Raw Materials, Packaging Materials, vs Finished Goods
        const rawMaterials: DashboardProductItem[] = [];
        const packagingMaterials: DashboardProductItem[] = [];
        const finishedGoods: DashboardProductItem[] = [];

        products.forEach((prod: Product) => {
            const pId = Number(prod.product_id);
            const stock = stockMap[pId] || 0;
            const value = stock * (Number(prod.cost_per_unit) || 0);

            const has_versions = versionProductIds.has(pId);
            const catName = (prod.product_category?.category_name || "").toLowerCase();

            const item = {
                product_id: pId,
                product_name: prod.product_name || "Unnamed Product",
                product_code: prod.product_code || `SKU-${pId}`,
                category: prod.product_category?.category_name || "Unassigned",
                unit: prod.unit_of_measurement?.unit_name || "Units",
                unit_shortcut: prod.unit_of_measurement?.unit_shortcut || "PCS",
                cost: Number(prod.cost_per_unit) || 0,
                price: Number(prod.price_per_unit) || 0,
                stock,
                value
            };

            const pName = (prod.product_name || "").toLowerCase();
            const pCode = (prod.product_code || "").toUpperCase();
            const pTypeStr = String(prod.product_type || "").toLowerCase();

            const isFG = Number(prod.product_type) === 388 ||
                         pTypeStr === "finished_good" ||
                         has_versions === true || 
                         catName.includes("finished") || 
                         catName === "fg";

            const isPackaging = Number(prod.product_type) === 390 ||
                                pTypeStr.includes("pack") ||
                                catName.includes("pack") ||
                                catName.includes("box") ||
                                catName.includes("label") ||
                                catName.includes("bottle") ||
                                catName.includes("wrapper") ||
                                catName.includes("container") ||
                                catName.includes("carton") ||
                                catName.includes("pouch") ||
                                catName.includes("sticker") ||
                                catName.includes("film") ||
                                catName.includes("cap") ||
                                pName.includes("packaging") ||
                                pName.includes("pouch") ||
                                pName.includes("bottle") ||
                                pName.includes("sticker") ||
                                pName.includes("carton") ||
                                pName.includes("label") ||
                                pName.includes("wrapper") ||
                                pName.includes("box") ||
                                pName.includes("container") ||
                                pCode.startsWith("PKG") ||
                                pCode.startsWith("BOX") ||
                                pCode.startsWith("LBL");

            if (isFG) {
                finishedGoods.push(item);
            } else if (isPackaging) {
                packagingMaterials.push(item);
            } else {
                rawMaterials.push(item);
            }
        });

        // Helper to check if a date falls within selected range
        const isWithinRange = (dateStr: string) => {
            if (!dateStr) return false;
            const date = new Date(dateStr.split("T")[0]);
            if (startDate) {
                const start = new Date(startDate);
                if (date < start) return false;
            }
            if (endDate) {
                const end = new Date(endDate);
                if (date > end) return false;
            }
            return true;
        };

        // 3. Aggregate wastage for time period from inventory movements
        let totalWastageQty = 0;
        let totalWastageVal = 0;
        const wastageItems: Record<number, { name: string; code: string; qty: number; value: number; reason: string }> = {};

        // A. Aggregate Raw Material / Stock Scrap from inventory movements
        movements.forEach((entry: InventoryMovement) => {
            const dateStr = entry.created_at || entry.manufacturing_date;
            if (!dateStr || !isWithinRange(dateStr)) return;

            const qty = Number(entry.quantity) || 0;
            const remarks = entry.remarks || "";
            const isWaste = qty < 0 && (
                entry.transaction_type_id === 5 || // Manual Adjustment
                remarks.toLowerCase().includes("scrap") ||
                remarks.toLowerCase().includes("loss") ||
                remarks.toLowerCase().includes("damage") ||
                remarks.toLowerCase().includes("waste") ||
                remarks.toLowerCase().includes("reject")
            );

            if (isWaste) {
                const absQty = Math.abs(qty);
                const pId = typeof entry.product_id === "object" ? Number(entry.product_id?.product_id) : Number(entry.product_id);
                if (!pId) return;

                const prod = products.find((p: Product) => Number(p.product_id) === pId);
                const cost = prod ? (Number(prod.cost_per_unit) || 0) : 0;
                const value = absQty * cost;

                totalWastageQty += absQty;
                totalWastageVal += value;

                if (!wastageItems[pId]) {
                    wastageItems[pId] = {
                        name: prod?.product_name || `Product #${pId}`,
                        code: prod?.product_code || `SKU-${pId}`,
                        qty: 0,
                        value: 0,
                        reason: remarks || "Scrap/Loss Adjustment"
                    };
                }
                wastageItems[pId].qty += absQty;
                wastageItems[pId].value += value;
            }
        });

        // B. Aggregate Production Yield Wastage from Completed Job Orders
        jobOrders.forEach((jo: any) => {
            if (jo.status !== "Completed") return;
            const dateStr = jo.end_date || jo.created_on;
            if (!dateStr || !isWithinRange(dateStr)) return;

            const planned = Number(jo.target_quantity || 0);
            const actual = Number(jo.actual_quantity_produced || 0);
            const deviation = planned - actual;

            if (deviation > 0) {
                const pId = Number(jo.product_id);
                const prod = products.find((p: Product) => Number(p.product_id) === pId);
                const cost = prod ? (Number(prod.cost_per_unit) || 0) : 0;
                const value = deviation * cost;

                totalWastageQty += deviation;
                totalWastageVal += value;

                if (!wastageItems[pId]) {
                    wastageItems[pId] = {
                        name: prod?.product_name || `Product #${pId}`,
                        code: prod?.product_code || `SKU-${pId}`,
                        qty: 0,
                        value: 0,
                        reason: "Production Yield Shortfall"
                    };
                }
                wastageItems[pId].qty += deviation;
                wastageItems[pId].value += value;
            }
        });

        // 4. Aggregate Production for time period directly from manufacturing_job_order_yield_ledger with true COGS calculation
        let totalProducedQty = 0;
        let totalProducedVal = 0;
        const producedItems: Record<number, { name: string; code: string; qty: number; value: number }> = {};

        yieldLogs.forEach((entry: any) => {
            const qty = Number(entry.yield_quantity) || 0;
            if (qty <= 0) return;

            const dateStr = entry.logged_at;
            if (!dateStr || !isWithinRange(dateStr)) return;

            const joId = Number(entry.job_order_id);
            const jo = jobOrders.find((j: any) => Number(j.job_order_id) === joId);
            if (!jo) return;

            const pId = Number(jo.product_id);
            if (!pId) return;

            // Calculate actual direct material COGS for this ledger entry from yield ledger bom consumage
            const entryConsumages = consumages.filter((c: any) => {
                const cLedgerId = typeof c.ledger_id === "object" ? Number((c.ledger_id as any)?.ledger_id) : Number(c.ledger_id);
                return cLedgerId === entry.ledger_id;
            });

            let entryCOGS = 0;
            entryConsumages.forEach((c: any) => {
                const rawProdId = typeof c.product_id === "object" ? Number((c.product_id as any)?.product_id) : Number(c.product_id);
                const rawProd = products.find((p: Product) => Number(p.product_id) === rawProdId);
                const rawCost = rawProd ? (Number(rawProd.cost_per_unit) || 0) : 0;
                entryCOGS += Number(c.quantity_consumed || 0) * rawCost;
            });

            // Fallback to qty * finished_good.cost_per_unit if no consumage details are logged yet
            const prod = products.find((p: Product) => Number(p.product_id) === pId);
            if (entryCOGS === 0) {
                const cost = prod ? (Number(prod.cost_per_unit) || 0) : 0;
                entryCOGS = qty * cost;
            }

            totalProducedQty += qty;
            totalProducedVal += entryCOGS;

            if (!producedItems[pId]) {
                producedItems[pId] = {
                    name: prod?.product_name || `Product #${pId}`,
                    code: prod?.product_code || `SKU-${pId}`,
                    qty: 0,
                    value: 0
                };
            }
            producedItems[pId].qty += qty;
            producedItems[pId].value += entryCOGS;
        });

        // 5. Aggregate Sellout Reports for time period
        let totalSalesQty = 0;
        let totalSalesRevenue = 0;
        const salesItems: Record<number, { name: string; code: string; qty: number; revenue: number }> = {};

        invoices.forEach((inv: Invoice) => {
            if (inv.status?.toLowerCase() === "cancelled") return;
            const dateStr = inv.invoice_date || inv.created_date;
            if (!dateStr || !isWithinRange(dateStr)) return;

            const details = invoiceDetails.filter((d: InvoiceDetail) => String(d.invoice_no) === String(inv.invoice_id));

            details.forEach((d: InvoiceDetail) => {
                const qty = Number(d.quantity) || 0;
                const price = Number(d.unit_price) || 0;
                const net = Number(d.net_amount) || (qty * price);

                totalSalesQty += qty;
                totalSalesRevenue += net;

                const pId = typeof d.product_id === "object" ? Number((d.product_id as any)?.product_id) : Number(d.product_id);
                if (!pId) return;

                if (!salesItems[pId]) {
                    const prod = products.find((p: Product) => Number(p.product_id) === pId);
                    salesItems[pId] = {
                        name: prod?.product_name || `Product #${pId}`,
                        code: prod?.product_code || `SKU-${pId}`,
                        qty: 0,
                        revenue: 0
                    };
                }
                salesItems[pId].qty += qty;
                salesItems[pId].revenue += net;
            });
        });

        // 6. Calculate Maximum Producible finished goods and estimated time based on current Raw Material Inventory
        const routesRaw: RouteStep[] = routesRes && routesRes.ok ? (await routesRes.json()).data || [] : [];
        const routesBomRaw: RouteBOMItem[] = routesBomRes && routesBomRes.ok ? (await routesBomRes.json()).data || [] : [];

        // For each finished good (product_type === 388 or matching active versions), calculate production potential
        const fgProducts = products.filter((prod: Product) => {
            const pId = Number(prod.product_id);
            const isFG = Number(prod.product_type) === 388 ||
                         versionProductIds.has(pId) || 
                         prod.product_category?.category_name?.toLowerCase().includes("finished") || 
                         prod.product_category?.category_name?.toLowerCase() === "fg";
            return isFG;
        });

        const producibleGoods = fgProducts.map((prod: Product) => {
            const pId = Number(prod.product_id);
            
            // 1. Resolve its active version
            const activeVer = versionsRaw.find((v: ProductVersion) => {
                const vProductId = typeof v.product_id === "object" ? Number((v.product_id as any)?.product_id) : Number(v.product_id);
                return vProductId === pId && v.status === "Active";
            });
            if (!activeVer) return null;

            // 2. Fetch the version's routing steps
            const verRoutes = routesRaw.filter((r: RouteStep) => {
                const rVersionId = typeof r.version_id === "object" ? Number((r.version_id as any)?.version_id) : Number(r.version_id);
                return rVersionId === activeVer.version_id;
            }).sort((a, b) => a.sequence_order - b.sequence_order);

            // 3. Get all BOM components for these routes
            const routeIds = new Set(verRoutes.map(r => r.route_id));
            const verBomItems = routesBomRaw.filter((b: RouteBOMItem) => {
                const bRouteId = typeof b.route_id === "object" ? Number((b.route_id as any)?.route_id) : Number(b.route_id);
                return routeIds.has(bRouteId);
            });

            // 4. Calculate total component requirements per unit of finished good
            const compRequirements: Record<number, { qtyRequiredPerUnit: number; componentName: string; componentCode: string; unit: string }> = {};
            
            verBomItems.forEach((b: RouteBOMItem) => {
                const compProductId = typeof b.product_id === "object" ? Number((b.product_id as any)?.product_id) : Number(b.product_id);
                if (!compProductId) return;

                const bRouteId = typeof b.route_id === "object" ? Number((b.route_id as any)?.route_id) : Number(b.route_id);
                const routeStep = verRoutes.find(r => r.route_id === bRouteId);
                if (!routeStep) return;

                const compProduct = products.find((p: Product) => p.product_id === compProductId);
                const name = compProduct ? compProduct.product_name || "Unnamed Ingredient" : `Ingredient ID: ${compProductId}`;
                const code = compProduct ? compProduct.product_code || `SKU-${compProductId}` : `SKU-${compProductId}`;
                const unit = compProduct?.unit_of_measurement?.unit_shortcut || "PCS";

                const wastageFactor = 1 - (Number(b.wastage_factor_percentage || 0) / 100);
                const quantityRequiredPerRun = Number(b.quantity_required || 0) / (wastageFactor > 0 ? wastageFactor : 1);
                const baseQty = Number(activeVer.base_quantity) || 1;
                const qtyPerUnit = quantityRequiredPerRun / baseQty;

                if (!compRequirements[compProductId]) {
                    compRequirements[compProductId] = {
                        qtyRequiredPerUnit: 0,
                        componentName: name,
                        componentCode: code,
                        unit
                    };
                }
                compRequirements[compProductId].qtyRequiredPerUnit += qtyPerUnit;
            });

            // 5. Calculate max units of finished good we can make
            let minProducible = Infinity;
            let bottleneckProductId: number | null = null;
            
            const componentsDetails = Object.entries(compRequirements).map(([compProductIdStr, req]) => {
                const compProductId = Number(compProductIdStr);
                const available = stockMap[compProductId] || 0;
                const qtyRequiredPerUnit = req.qtyRequiredPerUnit;

                let maxWithThis = 0;
                if (qtyRequiredPerUnit > 0) {
                    maxWithThis = Math.floor(available / qtyRequiredPerUnit);
                }

                if (maxWithThis < minProducible) {
                    minProducible = maxWithThis;
                    bottleneckProductId = compProductId;
                }

                return {
                    product_id: compProductId,
                    component_name: req.componentName,
                    component_code: req.componentCode,
                    unit: req.unit,
                    required_per_unit: qtyRequiredPerUnit,
                    available,
                    max_producible_with_this: maxWithThis
                };
            });

            const finalProducible = minProducible === Infinity ? 0 : minProducible;

            // Calculate next bottleneck if current primary bottleneck is solved/fulfilled
            let nextMinProducible = Infinity;
            componentsDetails.forEach(c => {
                if (c.product_id !== bottleneckProductId) {
                    if (c.max_producible_with_this < nextMinProducible) {
                        nextMinProducible = c.max_producible_with_this;
                    }
                }
            });
            const producibleIfFulfilled = nextMinProducible === Infinity ? null : nextMinProducible;

            // 6. Calculate total time to produce
            let totalSetupHours = 0;
            let totalRunHoursPerUnit = 0;
            verRoutes.forEach((r: RouteStep) => {
                totalSetupHours += Number(r.setup_time_hours || 0);
                
                const stepBatchSize = Number(r.step_batch_size) > 0 ? Number(r.step_batch_size) : 1;
                const runHoursPerUnit = Number(r.run_time_hours || 0) / stepBatchSize;
                totalRunHoursPerUnit += runHoursPerUnit;
            });

            const estimatedTimeHours = finalProducible > 0 
                ? totalSetupHours + (totalRunHoursPerUnit * finalProducible)
                : 0;

            const estimatedTimeHoursIfFulfilled = (producibleIfFulfilled !== null && producibleIfFulfilled !== Infinity)
                ? totalSetupHours + (totalRunHoursPerUnit * producibleIfFulfilled)
                : (producibleIfFulfilled === Infinity ? 0 : null);

            const uomName = (prod.unit_of_measurement as any)?.unit_name || (prod.unit_of_measurement as any)?.unit_shortcut || "";

            return {
                product_id: pId,
                product_name: prod.product_name || "Unnamed FG",
                uom_name: uomName,
                product_code: prod.product_code || `FG-${pId}`,
                category: prod.product_category?.category_name || "FG",
                bom_name: activeVer.version_name || `Recipe v${activeVer.version_id}`,
                base_quantity: Number(activeVer.base_quantity) || 1,
                max_producible: finalProducible,
                producible_if_fulfilled: producibleIfFulfilled,
                estimated_time_hours: Number(estimatedTimeHours.toFixed(2)),
                estimated_time_hours_if_fulfilled: estimatedTimeHoursIfFulfilled !== null ? Number(estimatedTimeHoursIfFulfilled.toFixed(2)) : null,
                components: componentsDetails
            };
        }).filter(Boolean);

        // Calculate ongoing production runs progress breakdown
        const ongoingRuns = jobOrders.filter((jo: any) => ["In Progress", "Released", "On Hold"].includes(jo.status));
        const ongoingBreakdown = ongoingRuns.map((jo: any) => {
            const mainProduct = (products.find((p: Product) => Number(p.product_id) === Number(jo.product_id)) || {}) as any;
            const productName = mainProduct.product_name || "Unknown Product";
            const targetQty = Number(jo.target_quantity || 0);

            // Fetch tasks/routing steps for this job order
            const joTasks = tasks.filter((t: any) => Number(t.job_order_id) === Number(jo.job_order_id));
            const totalTasks = joTasks.length;
            const completedTasks = joTasks.filter((t: any) => t.status === "Completed" || t.status === "Skipped").length;

            const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
            const progressText = `${completedTasks} of ${totalTasks} operations completed`;

            return {
                jo_id: jo.job_order_no,
                status: jo.status,
                product_name: productName,
                quantity: targetQty,
                percentage: Number(percentage.toFixed(1)),
                progress_text: progressText,
                due_date: jo.end_date
            };
        });

        const totalPercentage = ongoingBreakdown.length > 0
            ? ongoingBreakdown.reduce((sum: number, run) => sum + run.percentage, 0) / ongoingBreakdown.length
            : 0;

        return NextResponse.json({
            ongoingProduction: {
                overallPercentage: Number(totalPercentage.toFixed(1)),
                runs: ongoingBreakdown
            },
            wastage: {
                totalQuantity: totalWastageQty,
                totalValue: totalWastageVal,
                items: Object.values(wastageItems)
            },
            production: {
                totalQuantity: totalProducedQty,
                totalValue: totalProducedVal,
                items: Object.values(producedItems)
            },
            inventory: {
                rawMaterials: {
                    totalSKUs: rawMaterials.length,
                    totalStock: rawMaterials.reduce((sum, item) => sum + item.stock, 0),
                    totalValue: rawMaterials.reduce((sum, item) => sum + item.value, 0),
                    items: rawMaterials.sort((a, b) => b.value - a.value).slice(0, 50)
                },
                packagingMaterials: {
                    totalSKUs: packagingMaterials.length,
                    totalStock: packagingMaterials.reduce((sum, item) => sum + item.stock, 0),
                    totalValue: packagingMaterials.reduce((sum, item) => sum + item.value, 0),
                    items: packagingMaterials.sort((a, b) => b.value - a.value).slice(0, 50)
                },
                finishedGoods: {
                    totalSKUs: finishedGoods.length,
                    totalStock: finishedGoods.reduce((sum, item) => sum + item.stock, 0),
                    totalValue: finishedGoods.reduce((sum, item) => sum + item.value, 0),
                    items: finishedGoods.sort((a, b) => b.value - a.value).slice(0, 50)
                }
            },
            sellout: {
                totalQuantity: totalSalesQty,
                totalRevenue: totalSalesRevenue,
                items: Object.values(salesItems).sort((a, b) => b.revenue - a.revenue).slice(0, 50)
            },
            producibleGoods,
            branches
        });
    } catch (e) {
        console.error("[Dashboard BFF GET] Error:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to compile dashboard reports" }, { status: 500 });
    }
}


