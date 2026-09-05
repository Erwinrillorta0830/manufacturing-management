import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

async function rows(collection: string, params: URLSearchParams): Promise<Row[]> {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`${collection} returned ${response.status}`);
    return (await response.json()).data || [];
}

async function templateRows(params: URLSearchParams): Promise<Row[]> {
    try {
        const response = await fetch(`${DIRECTUS_URL}/items/sales_invoice_template?${params}`, {
            headers,
            cache: "no-store",
        });
        if (!response.ok) return [];
        return (await response.json()).data || [];
    } catch {
        return [];
    }
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
        const orders = await rows("sales_order", new URLSearchParams({ "filter[order_id][_eq]": String(invoice.order_id), fields: "order_id,order_no,po_no,salesman_id,payment_terms,customer_code", limit: "1" }));
        const order = orders[0];
        const customerCode = String(invoice.customer_code || order?.customer_code || "");
        const salesmanId = invoice.salesman_id || order?.salesman_id;
        const paymentTermsId = invoice.payment_terms || order?.payment_terms;

        const [customers, salesmen, terms, types, products, templates, batchRows, companies] = await Promise.all([
            customerCode ? rows("customer", new URLSearchParams({ "filter[customer_code][_eq]": customerCode, fields: "customer_code,customer_name,store_name,customer_tin,brgy,city,province", limit: "1" })) : [],
            salesmanId ? rows("salesman", new URLSearchParams({ "filter[id][_eq]": String(salesmanId), fields: "id,salesman_name", limit: "1" })) : [],
            paymentTermsId ? rows("payment_terms", new URLSearchParams({ "filter[id][_eq]": String(paymentTermsId), fields: "id,payment_name,payment_days", limit: "1" })) : [],
            invoice.invoice_type ? rows("sales_invoice_type", new URLSearchParams({ "filter[id][_eq]": String(invoice.invoice_type), fields: "id,type,isOfficial,max_length", limit: "1" })) : [],
            productIds.length ? rows("products", new URLSearchParams({ "filter[product_id][_in]": productIds.join(","), fields: "product_id,product_code,product_name,description,unit_of_measurement.unit_shortcut", limit: "-1" })) : [],
            invoice.invoice_type ? templateRows(new URLSearchParams({ "filter[sales_invoice_type_id][_eq]": String(invoice.invoice_type), fields: "id,template_config", limit: "1" })) : [],
            rows("sales_invoice_batches", new URLSearchParams({ "filter[invoice_id][_eq]": String(invoiceId), fields: "id,invoice_detail_id,product_id,inventory_lot_id,batch_no,quantity", limit: "-1" })).catch(() => []),
            rows("company", new URLSearchParams({ "filter[company_id][_eq]": "2", fields: "company_id,company_name,company_tin,company_address,company_brgy,company_city,company_province,company_zipCode", limit: "1" })).catch(() => []),
        ]);
        const productMap = new Map(products.map((product) => [Number(product.product_id), product]));
        const customer = customers[0];
        const type = types[0];
        const company = companies[0];
        const template = templates[0] as Row | undefined;
        const templateConfig = template?.template_config as Record<string, unknown> | undefined;

        const companyAddress = [
            company?.company_address,
            company?.company_brgy,
            company?.company_city,
            company?.company_province,
            company?.company_zipCode
        ].filter(Boolean).join(", ");

        const companyInfo = {
            companyId: Number(company?.company_id || 2),
            companyName: String(company?.company_name || ""),
            companyTin: String(company?.company_tin || ""),
            companyAddress: companyAddress || "",
        };

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
            orderNo: String(order?.order_no || invoice.order_id || ""),
            poNo: String(order?.po_no || ""),
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
                const lineBatches = batchRows
                    .filter((b) => Number(b.invoice_detail_id) === Number(detail.detail_id))
                    .map((b) => ({
                        batchNo: String(b.batch_no || ""),
                        quantity: Number(b.quantity || 0),
                        inventoryLotId: Number(b.inventory_lot_id || 0),
                    }));
                return {
                    detailId: Number(detail.detail_id),
                    productCode: String(product?.product_code || ""),
                    productName: String(product?.description || product?.product_name || `Product ${detail.product_id}`),
                    quantity: Number(detail.quantity || 0),
                    unit: String((product?.unit_of_measurement as Row | undefined)?.unit_shortcut || "PCS"),
                    unitPrice: Number(detail.unit_price || 0),
                    discountAmount: discount,
                    grossAmount: gross,
                    netAmount: Number(detail.total_amount ?? gross - discount),
                    batches: lineBatches,
                };
            }),
            totals: {
                gross: Number(invoice.gross_amount || invoice.total_amount || 0),
                discount: Number(invoice.discount_amount || 0),
                vat: Number(invoice.vat_amount || 0),
                net: Number(invoice.net_amount || 0),
            },
            templateConfig: templateConfig ? templateConfig as unknown as Record<string, unknown> : undefined,
            companyInfo,
        });
    } catch (error) {
        console.error("Printable invoice error:", error);
        return NextResponse.json({ error: "Failed to load printable invoice." }, { status: 500 });
    }
}
