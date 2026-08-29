import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { resolveVersions } from "../version-resolver";
import { getUserIdFromToken } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CandidateProductLineResolved {
    productId: number;
    productName: string;
    productCode: string;
    quantity: number;
    versionId: number | null;
    versionName: string | null;
}

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get("branchId");

        if (!branchId) {
            return NextResponse.json({ message: "branchId is required" }, { status: 400 });
        }

        const filter: Record<string, unknown> = {
            _and: [
                { branch_id: { _eq: Number(branchId) } },
                { transaction_status: { _eq: "Prepared" } },
                {
                    _or: [
                        { isDispatched: { _eq: false } },
                        { isDispatched: { _null: true } },
                    ],
                },
            ],
        };

        const qs = new URLSearchParams();
        qs.set("filter", JSON.stringify(filter));
        qs.set("limit", "-1");
        qs.set("fields", "invoice_id,invoice_no,invoice_date,gross_amount,net_amount,branch_id,customer_code,order_id,sales_order_id");

        const invRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice?${qs.toString()}`, {
            headers: directusHeaders,
            cache: "no-store",
        });
        if (!invRes.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${invRes.status})` }, { status: invRes.status });
        }

        const invJson = await invRes.json();
        let invoices: {
            invoice_id: number;
            invoice_no: string;
            invoice_date: string;
            gross_amount: number;
            net_amount: number;
            branch_id: number;
            customer_code: string;
            order_id?: number | null;
            sales_order_id?: number | null;
        }[] = invJson.data || [];

        if (invoices.length === 0) {
            return NextResponse.json([]);
        }

        const clinvRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][is_delete][_eq]=0&limit=-1&fields=invoice_id`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!clinvRes.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${clinvRes.status})` }, { status: clinvRes.status });
        }

        const clinvData = (await clinvRes.json()).data || [];
        const linkedIds = new Set(clinvData.map((j: { invoice_id: number }) => j.invoice_id));
        invoices = invoices.filter((inv) => !linkedIds.has(inv.invoice_id));

        const customerCodes = [...new Set(invoices.map((inv) => inv.customer_code).filter(Boolean))];
        let customerMap = new Map<string, { id: number; customer_name: string }>();
        if (customerCodes.length > 0) {
            const custRes = await fetch(
                `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${customerCodes.map((c) => encodeURIComponent(c)).join(",")}&limit=-1&fields=id,customer_code,customer_name`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (custRes.ok) {
                const custData = (await custRes.json()).data || [];
                customerMap = new Map(custData.map((c: { id: number; customer_code: string; customer_name: string }) => [c.customer_code, c]));
            }
        }

        const invoiceIds = invoices.map((inv) => inv.invoice_id);
        const detsRes = await fetch(
            `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&limit=-1&fields=detail_id,invoice_no,product_id,quantity`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const detsData: { detail_id: number; invoice_no: number; product_id: number; quantity: number }[] = detsRes.ok ? (await detsRes.json()).data || [] : [];

        // Exclude invoice details with non-positive quantities so incomplete or zero-value
        // placeholder lines cannot become consolidation candidates.
        const positiveDetails = detsData.filter((d) => Number(d.quantity || 0) > 0);

        // Exclude invoices whose customer cannot be resolved; consolidation needs the customer
        // to resolve a recipe version per product.
        invoices = invoices.filter((invoice) => {
            if (!customerMap.has(invoice.customer_code)) return false;
            const invoiceDetails = positiveDetails.filter((detail) => Number(detail.invoice_no) === Number(invoice.invoice_id));
            return invoiceDetails.length > 0;
        });

        if (invoices.length === 0) {
            return NextResponse.json([]);
        }

        const prodIds = [...new Set(positiveDetails.map((d) => d.product_id))];
        let prodMap = new Map<number, { product_name: string; product_code: string; description?: string }>();
        if (prodIds.length > 0) {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${prodIds.join(",")}&fields=product_id,product_name,product_code,description&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (prodRes.ok) {
                const prodData = (await prodRes.json()).data || [];
                prodMap = new Map(prodData.map((p: { product_id: number; product_name: string; product_code: string; description?: string }) => [p.product_id, p]));
            }
        }

        // Fetch linked sales orders for all candidate invoices
        const orderIds = [...new Set(invoices.map((inv) => Number(inv.order_id || inv.sales_order_id || 0)).filter(Boolean))];
        let orderMap = new Map<number, { order_id: number; order_no: string; po_no: string; order_status: string }>();
        if (orderIds.length > 0) {
            const orderRes = await fetch(
                `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${orderIds.join(",")}&limit=-1&fields=order_id,order_no,po_no,order_status`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (orderRes.ok) {
                const orderData = (await orderRes.json()).data || [];
                orderMap = new Map(orderData.map((o: { order_id: number; order_no: string; po_no: string; order_status: string }) => [o.order_id, o]));
            }
        }

        // Build unique (customer_id, product_id) pairs for version resolution
        const versionPairs = new Map<string, { customerId: number; productId: number }>();
        for (const inv of invoices) {
            const cust = customerMap.get(inv.customer_code);
            if (!cust) continue;
            const invDetails = positiveDetails.filter((d) => d.invoice_no === inv.invoice_id);
            for (const d of invDetails) {
                const key = `${cust.id}:${d.product_id}`;
                if (!versionPairs.has(key)) {
                    versionPairs.set(key, { customerId: cust.id, productId: d.product_id });
                }
            }
        }

        const versionMap = await resolveVersions(Array.from(versionPairs.values()));

        // Aggregate detail rows within each invoice by product_id, attach version
        const detailsByInvoice = new Map<number, CandidateProductLineResolved[]>();
        for (const d of positiveDetails) {
            const invId = d.invoice_no;
            if (!detailsByInvoice.has(invId)) detailsByInvoice.set(invId, []);
            const existingLines = detailsByInvoice.get(invId)!;
            const existing = existingLines.find((l) => l.productId === d.product_id);
            const qty = Number(d.quantity || 0);
            if (existing) {
                existing.quantity += qty;
            } else {
                const prod = prodMap.get(d.product_id);
                const inv = invoices.find((i) => i.invoice_id === invId);
                const cust = inv ? customerMap.get(inv.customer_code) : undefined;
                const versionKey = cust ? `${cust.id}:${d.product_id}` : "";
                const version = versionMap.get(versionKey);
                existingLines.push({
                    productId: d.product_id,
                    productName: prod?.description || prod?.product_name || `Product #${d.product_id}`,
                    productCode: prod?.product_code || "",
                    quantity: qty,
                    versionId: version?.versionId ?? null,
                    versionName: version?.versionName ?? null,
                });
            }
        }

        // Exclude invoices whose product lines cannot be fully resolved to a manufacturing
        // version. Consolidation creation cannot reserve stock without an exact version match.
        invoices = invoices.filter((invoice) => {
            const lines = detailsByInvoice.get(invoice.invoice_id) || [];
            return lines.length > 0 && lines.every((line) => line.versionId !== null);
        });

        // Build each candidate invoice entry
        const enriched = invoices.map((inv) => {
            const cust = customerMap.get(inv.customer_code);
            const order = orderMap.get(Number(inv.order_id || inv.sales_order_id || 0));
            return {
                invoiceId: inv.invoice_id,
                invoiceNo: inv.invoice_no,
                invoiceDate: inv.invoice_date,
                grossAmount: Number(inv.gross_amount || 0),
                netAmount: Number(inv.net_amount || 0),
                branchId: inv.branch_id,
                customerCode: inv.customer_code,
                customerName: cust?.customer_name || inv.customer_code,
                orderId: order?.order_id ?? (inv.order_id || inv.sales_order_id || null),
                orderNo: order?.order_no ?? "",
                poNo: order?.po_no ?? "",
                orderStatus: order?.order_status ?? "For Consolidation",
                products: detailsByInvoice.get(inv.invoice_id) || [],
            };
        });

        return NextResponse.json(enriched);
    } catch (e) {
        console.error("invoice-consolidation candidates GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
