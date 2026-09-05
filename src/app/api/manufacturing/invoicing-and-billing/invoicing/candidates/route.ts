import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    addSalesOrderFilters,
    enrichSalesOrderReadModel,
    fetchDetailsForOrders,
    SALES_ORDER_FIELDS,
} from "@/app/api/manufacturing/sales-order/_read";
import { getUserIdFromToken } from "@/app/api/manufacturing/invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function read(collection: string, params: URLSearchParams) {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params}`, {
        headers,
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`Failed to fetch ${collection}: ${response.status}`);
    return response.json();
}

export async function GET(request: Request) {
    try {
        if (!(await getUserIdFromToken())) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const branchId = Number(searchParams.get("branchId"));
        const params = new URLSearchParams({
            "filter[order_status][_eq]": "For Invoicing",
            fields: SALES_ORDER_FIELDS,
            limit: "-1",
            sort: "-created_date",
        });
        if (Number.isSafeInteger(branchId) && branchId > 0) params.set("filter[branch_id][_eq]", String(branchId));
        addSalesOrderFilters(params, {
            search: searchParams.get("search")?.trim() || undefined,
            customerCode: searchParams.get("customerCode")?.trim() || undefined,
            dateFrom: searchParams.get("dateFrom")?.trim() || undefined,
            dateTo: searchParams.get("dateTo")?.trim() || undefined,
        });

        const orders = (await read("sales_order", params)).data || [];
        const orderIds = orders.map((order: Record<string, unknown>) => Number(order.order_id)).filter(Boolean);
        if (orderIds.length === 0) return NextResponse.json({ data: [] });

        const invoiceParams = new URLSearchParams({
            "filter[order_id][_in]": orderIds.join(","),
            fields: "order_id,transaction_status",
            limit: "-1",
        });
        const invoices = (await read("sales_invoice", invoiceParams)).data || [];
        const invoicedOrderIds = new Set(invoices
            .filter((invoice: Record<string, unknown>) => invoice.transaction_status !== "Cancelled")
            .map((invoice: Record<string, unknown>) => Number(invoice.order_id)));
        const candidates = orders.filter((order: Record<string, unknown>) => !invoicedOrderIds.has(Number(order.order_id)));
        const candidateIds = candidates.map((order: Record<string, unknown>) => Number(order.order_id));
        const details = await fetchDetailsForOrders(read, candidateIds);
        const detailsMap = await enrichSalesOrderReadModel(read, candidates, details);
        for (const candidate of candidates) candidate.details = detailsMap[Number(candidate.order_id)] || [];

        const branchIds = [...new Set(candidates.map((c: Record<string, unknown>) => Number(c.branch_id)).filter(Boolean))];
        if (branchIds.length > 0) {
            const branchParams = new URLSearchParams({
                fields: "id,branch_name",
                "filter[id][_in]": branchIds.join(","),
                limit: "-1",
            });
            const branches = (await read("branches", branchParams)).data || [];
            const branchMap = new Map(branches.map((b: Record<string, unknown>) => [Number(b.id), String(b.branch_name)]));
            for (const candidate of candidates) candidate.branch_name = branchMap.get(Number(candidate.branch_id)) || `Branch #${candidate.branch_id}`;
        }

        const customerCodes = [...new Set(candidates.map((c: Record<string, unknown>) => String(c.customer_code || "")).filter(Boolean))];
        const salesmanIds = [...new Set(candidates.map((c: Record<string, unknown>) => Number(c.salesman_id)).filter(Boolean))];
        const paymentTermIds = [...new Set(candidates.map((c: Record<string, unknown>) => Number(c.payment_terms)).filter(Boolean))];

        const [customersResult, salesmenResult, termsResult] = await Promise.all([
            customerCodes.length > 0 ? read("customer", new URLSearchParams({ "filter[customer_code][_in]": customerCodes.join(","), fields: "customer_code,customer_name,store_name,customer_tin,brgy,city,province", limit: "-1" })) : Promise.resolve({ data: [] }),
            salesmanIds.length > 0 ? read("salesman", new URLSearchParams({ "filter[id][_in]": salesmanIds.join(","), fields: "id,salesman_name", limit: "-1" })) : Promise.resolve({ data: [] }),
            paymentTermIds.length > 0 ? read("payment_terms", new URLSearchParams({ "filter[id][_in]": paymentTermIds.join(","), fields: "id,payment_name,payment_days", limit: "-1" })) : Promise.resolve({ data: [] }),
        ]);

        const customerMap = new Map<string, Record<string, unknown>>((customersResult.data || []).map((c: Record<string, unknown>) => [String(c.customer_code), c]));
        const salesmanMap = new Map((salesmenResult.data || []).map((s: Record<string, unknown>) => [Number(s.id), String(s.salesman_name)]));
        const termsMap = new Map((termsResult.data || []).map((t: Record<string, unknown>) => [Number(t.id), String(t.payment_name)]));

        for (const candidate of candidates) {
            const cust = customerMap.get(String(candidate.customer_code));
            if (cust) {
                candidate.customer_tin = String(cust.customer_tin || "N/A");
                candidate.customer_address = [cust.brgy, cust.city, cust.province].filter(Boolean).join(", ");
            }
            if (candidate.salesman_id) {
                candidate.salesman_name = salesmanMap.get(Number(candidate.salesman_id)) || "N/A";
            }
            if (candidate.payment_terms) {
                candidate.payment_term_name = termsMap.get(Number(candidate.payment_terms)) || "N/A";
            }
        }

        return NextResponse.json({ data: candidates });
    } catch (error) {
        console.error("Invoicing candidates error:", error);
        return NextResponse.json({ error: "Failed to load invoicing candidates." }, { status: 500 });
    }
}
