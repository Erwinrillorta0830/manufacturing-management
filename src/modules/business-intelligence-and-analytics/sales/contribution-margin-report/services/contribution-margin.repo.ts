import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export interface RawInvoice {
    invoice_id: number;
    invoice_no: string;
    order_id?: string | number | null;
    customer_code?: string | null;
    invoice_date?: string | null;
    dispatch_date?: string | null;
    due_date?: string | null;
    payment_status?: string | null;
    transaction_status?: string | null;
    total_amount?: number | string | null;
    gross_amount?: number | string | null;
    discount_amount?: number | string | null;
    net_amount?: number | string | null;
    vat_amount?: number | string | null;
    branch_id?: number | null;
}

export interface RawInvoiceDetail {
    detail_id: number;
    invoice_no: string | number;
    order_id?: string | number | null;
    product_id: number;
    quantity: number | string;
    unit_price?: number | string | null;
    net_amount?: number | string | null;
    amount?: number | string | null;
}

export interface RawSalesReturn {
    return_id: number;
    return_number: string;
    invoice_no?: string | null;
    order_id?: string | null;
    customer_code?: string | null;
    return_date?: string | null;
    total_amount?: number | string | null;
    gross_amount?: number | string | null;
    discount_amount?: number | string | null;
    status?: string | null;
    isReceived?: boolean | number | null;
}

export interface RawSalesReturnDetail {
    detail_id: number;
    return_no: string;
    product_id: number;
    quantity: number | string;
    unit_price?: number | string | null;
    total_amount?: number | string | null;
    gross_amount?: number | string | null;
    discount_amount?: number | string | null;
}

export interface RawSalesOrderDetail {
    detail_id: number;
    product_id: number;
    order_id: number;
    unit_price: number | string;
    ordered_quantity: number | string;
    allocated_quantity: number | string;
    net_amount?: number | string | null;
}

export interface RawJobOrderAllocation {
    id: number;
    sales_order_detail_id: number;
    job_order_id: number;
    allocated_quantity: number | string;
}

export interface RawJobOrder {
    job_order_id: number;
    job_order_no: string;
    branch_id?: number | null;
    product_id: number;
    version_id?: number | null;
    target_quantity?: number | string | null;
    actual_quantity_produced?: number | string | null;
    completed_quantity?: number | string | null;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
}

export interface RawYieldLedger {
    ledger_id: number;
    job_order_id: number;
    yield_quantity?: number | string | null;
}

export interface RawYieldConsumage {
    consumage_id: number;
    ledger_id: number;
    product_id: number;
    quantity_consumed: number | string;
    batch_no?: string | null;
}

export interface RawRoute {
    jo_route_id: number;
    job_order_id: number;
    work_center_id?: number | null;
    planned_run_hours?: number | string | null;
    actual_run_hours?: number | string | null;
    estimated_labor_cost?: number | string | null;
    status?: string | null;
}

export interface RawRouteOperator {
    jo_route_operator_id: number;
    jo_route_id: number;
    operator_id: number;
    logged_hours: number | string;
    hourly_rate: number | string;
    started_at?: string | null;
    stopped_at?: string | null;
}

export interface RawWorkCenter {
    work_center_id: number;
    work_center_name: string;
    overhead_cost_per_hour?: number | string | null;
}

export interface RawProductOverhead {
    id: number;
    product_id: number;
    version_id: number;
    overhead_id: number;
    amount?: number | string | null;
}

export interface RawProduct {
    product_id: number;
    product_name?: string | null;
    product_code?: string | null;
    product_category?: number | null;
    product_brand?: number | null;
    price_per_unit?: number | string | null;
    cost_per_unit?: number | string | null;
    estimated_unit_cost?: number | string | null;
    unit_of_measurement?: number | string | null;
}

export interface RawCategory {
    category_id: number;
    category_name: string;
}

export interface RawBrand {
    brand_id: number;
    brand_name: string;
}

export interface RawUser {
    user_id: number;
    user_fname?: string | null;
    user_lname?: string | null;
}

export interface RawProductVersion {
    version_id: number;
    product_id: number;
    version_name: string;
    custom_overhead?: number | string | null;
}

/**
 * Repository layer for Directus I/O calls
 */
export class ContributionMarginRepo {
    /**
     * Fetch ONLY Paid sales invoices (excluding Unpaid)
     */
    static async fetchPaidInvoices(): Promise<RawInvoice[]> {
        try {
            const url = `${DIRECTUS_URL}/items/sales_invoice?limit=-1&sort=-invoice_id`;
            const res = await fetch(url, { headers, cache: "no-store" });
            if (!res.ok) return [];
            const json = await res.json();
            const allInvoices: RawInvoice[] = json.data || [];

            // Strict filter: ONLY Paid invoices, explicitly exclude Unpaid / Cancelled
            const strictlyPaid = allInvoices.filter(inv => {
                if (inv.transaction_status === "Cancelled") return false;
                if (!inv.payment_status) return false;
                const statusStr = String(inv.payment_status).trim().toLowerCase();
                if (statusStr === "unpaid") return false;
                if (statusStr === "paid") return true;

                // If stored as JSON payments history
                try {
                    const parsed = JSON.parse(inv.payment_status);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const totalPaid = parsed.reduce((sum: number, p: { amount?: number }) => sum + Number(p.amount || 0), 0);
                        const net = Number(inv.net_amount || inv.total_amount || 0);
                        return net > 0 && totalPaid >= net;
                    }
                } catch {
                    return false;
                }
                return false;
            });

            return strictlyPaid;
        } catch (err) {
            console.error("[ContributionMarginRepo] fetchPaidInvoices error:", err);
            return [];
        }
    }

    /**
     * Fetch invoice details for specific invoice IDs or all
     */
    static async fetchInvoiceDetails(invoiceIds?: (string | number)[]): Promise<RawInvoiceDetail[]> {
        try {
            let url = `${DIRECTUS_URL}/items/sales_invoice_details?limit=-1`;
            if (invoiceIds && invoiceIds.length > 0) {
                const esc = invoiceIds.map(id => encodeURIComponent(String(id))).join(",");
                url += `&filter[invoice_no][_in]=${esc}`;
            }
            const res = await fetch(url, { headers, cache: "no-store" });
            if (!res.ok) return [];
            const json = await res.json();
            return json.data || [];
        } catch (err) {
            console.error("[ContributionMarginRepo] fetchInvoiceDetails error:", err);
            return [];
        }
    }

    /**
     * Fetch sales returns & details
     */
    static async fetchSalesReturns(): Promise<{ returns: RawSalesReturn[]; details: RawSalesReturnDetail[] }> {
        try {
            const [retRes, retDetRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/sales_return?limit=-1&fields=return_id,return_number,invoice_no,order_id,customer_code,return_date,total_amount,gross_amount,discount_amount,status,isReceived`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/sales_return_details?limit=-1&fields=detail_id,return_no,product_id,quantity,unit_price,total_amount,gross_amount,discount_amount`, { headers, cache: "no-store" }).catch(() => null)
            ]);

            const returns = retRes && retRes.ok ? (await retRes.json()).data || [] : [];
            const details = retDetRes && retDetRes.ok ? (await retDetRes.json()).data || [] : [];
            return { returns, details };
        } catch (err) {
            console.error("[ContributionMarginRepo] fetchSalesReturns error:", err);
            return { returns: [], details: [] };
        }
    }

    /**
     * Fetch sales order details and job order allocations
     */
    static async fetchSalesOrderAllocations(): Promise<{ sodList: RawSalesOrderDetail[]; allocations: RawJobOrderAllocation[] }> {
        try {
            const [sodRes, allocRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/sales_order_details?limit=-1&fields=detail_id,product_id,order_id,unit_price,ordered_quantity,allocated_quantity,net_amount`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations?limit=-1&fields=id,sales_order_detail_id,job_order_id,allocated_quantity`, { headers, cache: "no-store" }).catch(() => null)
            ]);

            const sodList = sodRes && sodRes.ok ? (await sodRes.json()).data || [] : [];
            const allocations = allocRes && allocRes.ok ? (await allocRes.json()).data || [] : [];
            return { sodList, allocations };
        } catch (err) {
            console.error("[ContributionMarginRepo] fetchSalesOrderAllocations error:", err);
            return { sodList: [], allocations: [] };
        }
    }

    /**
     * Fetch job orders and yield consumage
     */
    static async fetchJobOrdersAndConsumage(): Promise<{
        jobOrders: RawJobOrder[];
        yieldLedgers: RawYieldLedger[];
        consumage: RawYieldConsumage[];
    }> {
        try {
            const [joRes, yRes, cRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,branch_id,product_id,version_id,target_quantity,actual_quantity_produced,completed_quantity,status,start_date,end_date`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&fields=ledger_id,job_order_id,yield_quantity`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage?limit=-1&fields=consumage_id,ledger_id,product_id,quantity_consumed,batch_no`, { headers, cache: "no-store" }).catch(() => null)
            ]);

            const jobOrders = joRes && joRes.ok ? (await joRes.json()).data || [] : [];
            const yieldLedgers = yRes && yRes.ok ? (await yRes.json()).data || [] : [];
            const consumage = cRes && cRes.ok ? (await cRes.json()).data || [] : [];
            return { jobOrders, yieldLedgers, consumage };
        } catch (err) {
            console.error("[ContributionMarginRepo] fetchJobOrdersAndConsumage error:", err);
            return { jobOrders: [], yieldLedgers: [], consumage: [] };
        }
    }

    /**
     * Fetch routing operations and operator time tracking
     */
    static async fetchRoutingLaborAndOverheads(): Promise<{
        routes: RawRoute[];
        routeOperators: RawRouteOperator[];
        workCenters: RawWorkCenter[];
        productOverheads: RawProductOverhead[];
        versions: RawProductVersion[];
        users: RawUser[];
    }> {
        try {
            const [rRes, roRes, wcRes, poRes, vRes, uRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?limit=-1&fields=jo_route_id,job_order_id,work_center_id,planned_run_hours,actual_run_hours,estimated_labor_cost,status`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?limit=-1&fields=jo_route_operator_id,jo_route_id,operator_id,logged_hours,hourly_rate,started_at,stopped_at`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name,overhead_cost_per_hour`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/product_overheads?limit=-1&fields=id,product_id,version_id,overhead_id,amount`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=version_id,product_id,version_name,custom_overhead`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
            ]);

            return {
                routes: rRes && rRes.ok ? (await rRes.json()).data || [] : [],
                routeOperators: roRes && roRes.ok ? (await roRes.json()).data || [] : [],
                workCenters: wcRes && wcRes.ok ? (await wcRes.json()).data || [] : [],
                productOverheads: poRes && poRes.ok ? (await poRes.json()).data || [] : [],
                versions: vRes && vRes.ok ? (await vRes.json()).data || [] : [],
                users: uRes && uRes.ok ? (await uRes.json()).data || [] : []
            };
        } catch (err) {
            console.error("[ContributionMarginRepo] fetchRoutingLaborAndOverheads error:", err);
            return {
                routes: [],
                routeOperators: [],
                workCenters: [],
                productOverheads: [],
                versions: [],
                users: []
            };
        }
    }

    /**
     * Fetch products, categories, and brand catalogs
     */
    static async fetchProductsAndCatalogs(): Promise<{
        products: RawProduct[];
        categories: RawCategory[];
        brands: RawBrand[];
    }> {
        try {
            const [pRes, cRes, bRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,product_category,product_brand,price_per_unit,cost_per_unit,estimated_unit_cost,unit_of_measurement`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/categories?limit=-1&fields=category_id,category_name`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/brand?limit=-1&fields=brand_id,brand_name`, { headers, cache: "no-store" }).catch(() => null)
            ]);

            return {
                products: pRes && pRes.ok ? (await pRes.json()).data || [] : [],
                categories: cRes && cRes.ok ? (await cRes.json()).data || [] : [],
                brands: bRes && bRes.ok ? (await bRes.json()).data || [] : []
            };
        } catch (err) {
            console.error("[ContributionMarginRepo] fetchProductsAndCatalogs error:", err);
            return { products: [], categories: [], brands: [] };
        }
    }
}
