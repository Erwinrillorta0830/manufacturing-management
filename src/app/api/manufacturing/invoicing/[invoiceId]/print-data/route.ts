import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../../../directus-api";
import { getUserIdFromToken } from "../../../invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const TEMPLATE_DIRECTUS_URL = (process.env.CRM_DIRECTUS_URL || "http://goatedcodoer:8056").replace(/\/$/, "");
const TEMPLATE_DIRECTUS_TOKEN = process.env.CRM_DIRECTUS_STATIC_TOKEN || "";

async function rows(collection: string, params: URLSearchParams): Promise<Row[]> {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`${collection} returned ${response.status}`);
    return (await response.json()).data || [];
}

async function templateRows(params: URLSearchParams): Promise<Row[]> {
    const response = await fetch(`${TEMPLATE_DIRECTUS_URL}/items/sales_invoice_template?${params}`, {
        headers: TEMPLATE_DIRECTUS_TOKEN ? { Authorization: `Bearer ${TEMPLATE_DIRECTUS_TOKEN}` } : undefined,
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`sales_invoice_template returned ${response.status}`);
    return (await response.json()).data || [];
}

function address(customer?: Row) {
    return [customer?.brgy, customer?.city, customer?.province].filter(Boolean).join(", ");
}

export async function GET(_request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
    try {
        if (!(await getUserIdFromToken())) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
        const invoiceId = Number((await params).invoiceId);
        if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) return NextResponse.json({ error: "Invalid invoice ID." }, { status: 400 });

        const invoiceResponse = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoiceId}?fields=*`, { headers, cache: "no-store" });
        if (invoiceResponse.status === 404) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
        if (!invoiceResponse.ok) throw new Error(`sales_invoice returned ${invoiceResponse.status}`);
        const invoice = (await invoiceResponse.json()).data as Row;

        const detailRows = await rows("sales_invoice_details", new URLSearchParams({
            "filter[invoice_no][_eq]": String(invoiceId), fields: "detail_id,product_id,unit_price,quantity,discount_amount,gross_amount,total_amount", limit: "-1",
        }));
        const productIds = [...new Set(detailRows.map((detail) => Number(detail.product_id)).filter(Boolean))];
        const [orders, customers, salesmen, terms, types, products, templates] = await Promise.all([
            rows("sales_order", new URLSearchParams({ "filter[order_id][_eq]": String(invoice.order_id), fields: "order_id,order_no,po_no", limit: "1" })),
            rows("customer", new URLSearchParams({ "filter[customer_code][_eq]": String(invoice.customer_code || ""), fields: "customer_code,customer_name,store_name,customer_tin,brgy,city,province", limit: "1" })),
            invoice.salesman_id ? rows("salesman", new URLSearchParams({ "filter[id][_eq]": String(invoice.salesman_id), fields: "id,salesman_name", limit: "1" })) : [],
            invoice.payment_terms ? rows("payment_terms", new URLSearchParams({ "filter[id][_eq]": String(invoice.payment_terms), fields: "id,payment_name,payment_days", limit: "1" })) : [],
            invoice.invoice_type ? rows("sales_invoice_type", new URLSearchParams({ "filter[id][_eq]": String(invoice.invoice_type), fields: "id,type,isOfficial,max_length", limit: "1" })) : [],
            productIds.length ? rows("products", new URLSearchParams({ "filter[product_id][_in]": productIds.join(","), fields: "product_id,product_code,product_name,unit_of_measurement.unit_shortcut", limit: "-1" })) : [],
            invoice.invoice_type ? templateRows(new URLSearchParams({ "filter[sales_invoice_type_id][_eq]": String(invoice.invoice_type), fields: "id,template_config", limit: "1" })) : [],
        ]);
        const productMap = new Map(products.map((product) => [Number(product.product_id), product]));
        const customer = customers[0];
        const type = types[0];
        const template = templates[0] as Row | undefined;
        const templateConfig = template?.template_config as Record<string, unknown> | undefined;

        return NextResponse.json({
            invoiceId,
            invoiceNo: String(invoice.invoice_no || ""),
            invoiceDate: String(invoice.invoice_date || ""),
            dueDate: String(invoice.due_date || ""),
            transactionStatus: String(invoice.transaction_status || ""),
            receiptType: {
                id: Number(type?.id || invoice.invoice_type || 0),
                type: String(type?.type || "Sales Invoice"),
                isOfficial: type?.isOfficial === true || type?.isOfficial === 1 || type?.isOfficial === "1",
                maxLength: Number(type?.max_length || 0),
            },
            orderNo: String(orders[0]?.order_no || invoice.order_id || ""),
            poNo: String(orders[0]?.po_no || ""),
            customerName: String(customer?.customer_name || invoice.customer_code || ""),
            storeName: String(customer?.store_name || customer?.customer_name || ""),
            customerTin: String(customer?.customer_tin || "N/A"),
            customerAddress: address(customer),
            salesmanName: String(salesmen[0]?.salesman_name || "N/A"),
            paymentTermName: String(terms[0]?.payment_name || "N/A"),
            lines: detailRows.map((detail) => {
                const product = productMap.get(Number(detail.product_id));
                const gross = Number(detail.gross_amount || Number(detail.quantity) * Number(detail.unit_price));
                const discount = Number(detail.discount_amount || 0);
                return {
                    detailId: Number(detail.detail_id),
                    productCode: String(product?.product_code || ""),
                    productName: String(product?.product_name || `Product ${detail.product_id}`),
                    quantity: Number(detail.quantity || 0),
                    unit: String((product?.unit_of_measurement as Row | undefined)?.unit_shortcut || "PCS"),
                    unitPrice: Number(detail.unit_price || 0),
                    discountAmount: discount,
                    grossAmount: gross,
                    netAmount: Number(detail.total_amount ?? gross - discount),
                };
            }),
            totals: {
                gross: Number(invoice.gross_amount || invoice.total_amount || 0),
                discount: Number(invoice.discount_amount || 0),
                vat: Number(invoice.vat_amount || 0),
                net: Number(invoice.net_amount || 0),
            },
            templateConfig: templateConfig ? templateConfig as unknown as Record<string, unknown> : undefined,
        });
    } catch (error) {
        console.error("Printable invoice error:", error);
        return NextResponse.json({ error: "Failed to load printable invoice." }, { status: 500 });
    }
}
