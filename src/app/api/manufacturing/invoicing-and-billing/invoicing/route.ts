import { NextResponse } from "next/server";
import { DIRECTUS_URL, getISOStringInConfiguredTimezone, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ApiError extends Error {
    constructor(public status: number, message: string, public details?: Record<string, unknown>) {
        super(message);
    }
}

type Row = Record<string, unknown>;
const locks = new Map<number, Promise<void>>();

async function directus(collection: string, params = new URLSearchParams()) {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params}`, { headers: directusHeaders, cache: "no-store" });
    if (!response.ok) throw new ApiError(503, `Unable to read ${collection}.`);
    return (await response.json()).data;
}

async function remove(collection: string, id: number) {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}/${id}`, { method: "DELETE", headers: directusHeaders });
    if (!response.ok && response.status !== 404) throw new Error(`${collection} ${id} delete returned ${response.status}`);
}

async function withLock<T>(orderId: number, operation: () => Promise<T>) {
    const previous = locks.get(orderId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    locks.set(orderId, queued);
    await previous;
    try {
        return await operation();
    } finally {
        release();
        if (locks.get(orderId) === queued) locks.delete(orderId);
    }
}

export async function POST(request: Request) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId) throw new ApiError(401, "Authentication is required.");
        const body = await request.json().catch(() => null) as Row | null;
        const salesOrderId = Number(body?.salesOrderId);
        const invoiceNo = typeof body?.invoiceNo === "string" ? body.invoiceNo.trim() : "";
        const invoiceTypeId = Number(body?.invoiceTypeId);
        const invoiceDate = typeof body?.invoiceDate === "string" ? body.invoiceDate : "";
        const dueDate = typeof body?.dueDate === "string" ? body.dueDate : "";
        const remarks = typeof body?.remarks === "string" ? body.remarks.trim() : "";

        if (!Number.isSafeInteger(salesOrderId) || salesOrderId < 1 || !Number.isSafeInteger(invoiceTypeId) || invoiceTypeId < 1 || !invoiceNo || !invoiceDate || !dueDate) {
            throw new ApiError(400, "salesOrderId, invoiceTypeId, invoiceNo, invoiceDate, and dueDate are required.");
        }
        if (!Number.isFinite(Date.parse(invoiceDate)) || !Number.isFinite(Date.parse(dueDate))) {
            throw new ApiError(400, "invoiceDate and dueDate must be valid dates.");
        }

        return await withLock(salesOrderId, async () => {
            const invoiceTypes = await directus("sales_invoice_type", new URLSearchParams({
                "filter[id][_eq]": String(invoiceTypeId),
                fields: "id,type,isOfficial,max_length",
                limit: "1",
            })) as Row[];
            const invoiceType = invoiceTypes[0];
            if (!invoiceType) throw new ApiError(400, "Selected receipt type does not exist.");
            const maxLength = Number(invoiceType.max_length || 0);
            if (maxLength > 0 && invoiceNo.length > maxLength) {
                throw new ApiError(400, `Receipt number cannot exceed ${maxLength} characters.`);
            }

            const orderResponse = await fetch(
                `${DIRECTUS_URL}/items/sales_order/${salesOrderId}?fields=order_id,order_no,order_status,customer_code,branch_id,salesman_id,payment_terms,discount_amount`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (orderResponse.status === 404) throw new ApiError(404, "Sales order not found.");
            if (!orderResponse.ok) throw new ApiError(503, "Unable to load the sales order.");
            const order = (await orderResponse.json()).data as Row;
            if (order.order_status !== "For Invoicing") throw new ApiError(409, "Sales order must be For Invoicing.");
            const branchId = Number(order.branch_id);
            if (!Number.isSafeInteger(branchId) || branchId < 1) throw new ApiError(409, "Sales order has no valid branch.");

            const details = await directus("sales_order_details", new URLSearchParams({
                "filter[order_id][_eq]": String(salesOrderId),
                fields: "detail_id,product_id,bom_version_id,unit_price,ordered_quantity,net_amount,gross_amount",
                limit: "-1",
            })) as Row[];
            if (!details.length || details.some((detail) => Number(detail.ordered_quantity) <= 0 || !Number.isFinite(Number(detail.ordered_quantity)))) {
                throw new ApiError(409, "Sales order must contain positive detail quantities.");
            }

            const activeInvoices = await directus("sales_invoice", new URLSearchParams({
                "filter[order_id][_eq]": String(salesOrderId),
                fields: "invoice_id,transaction_status",
                limit: "-1",
            })) as Row[];
            if (activeInvoices.some((invoice) => invoice.transaction_status !== "Cancelled")) {
                throw new ApiError(409, "Sales order already has an active invoice.");
            }

            const duplicateInvoices = await directus("sales_invoice", new URLSearchParams({
                "filter[invoice_no][_eq]": invoiceNo,
                fields: "invoice_id",
                limit: "1",
            })) as Row[];
            if (duplicateInvoices.length) throw new ApiError(409, `Invoice number "${invoiceNo}" already exists.`);

            const productIds = [...new Set(details.map((detail) => Number(detail.product_id)))];
            const products = await directus("products", new URLSearchParams({
                "filter[product_id][_in]": productIds.join(","),
                fields: "product_id,product_name,unit_of_measurement.unit_id",
                limit: "-1",
            })) as Row[];
            const productMap = new Map(products.map((product) => [Number(product.product_id), product]));

            const discount = Number(order.discount_amount || 0);
            const gross = details.reduce((sum, detail) => sum + Number(detail.unit_price) * Number(detail.ordered_quantity), 0);
            if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(discount) || discount < 0 || discount > gross) {
                throw new ApiError(409, "Sales order has invalid invoice amounts.");
            }

            let invoiceId: number | null = null;
            const detailIds: number[] = [];
            try {
                const nowIso = await getISOStringInConfiguredTimezone();
                const headerResponse = await fetch(`${DIRECTUS_URL}/items/sales_invoice`, {
                    method: "POST",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        invoice_no: invoiceNo,
                        invoice_date: invoiceDate,
                        due_date: dueDate,
                        created_date: nowIso,
                        customer_code: order.customer_code,
                        order_id: salesOrderId,
                        salesman_id: order.salesman_id || null,
                        branch_id: branchId,
                        payment_terms: order.payment_terms || null,
                        invoice_type: invoiceTypeId,
                        transaction_status: "Prepared",
                        payment_status: "Unpaid",
                        total_amount: gross,
                        gross_amount: gross,
                        discount_amount: discount,
                        vat_amount: 0,
                        net_amount: gross - discount,
                        remarks,
                    }),
                });
                if (!headerResponse.ok) throw new Error(`Invoice header insert failed (HTTP ${headerResponse.status})`);
                invoiceId = Number((await headerResponse.json()).data?.invoice_id);
                if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) throw new Error("Invoice header returned no valid ID");

                for (const detail of details) {
                    const quantity = Number(detail.ordered_quantity);
                    const unitPrice = Number(detail.unit_price);
                    const unitId = Number((productMap.get(Number(detail.product_id))?.unit_of_measurement as Row | undefined)?.unit_id || 1);
                    const detailResponse = await fetch(`${DIRECTUS_URL}/items/sales_invoice_details`, {
                        method: "POST",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            order_id: salesOrderId,
                            invoice_no: invoiceId,
                            product_id: Number(detail.product_id),
                            unit: unitId,
                            unit_price: unitPrice,
                            quantity,
                            discount_amount: 0,
                            gross_amount: quantity * unitPrice,
                            total_amount: quantity * unitPrice,
                            net_amount: quantity * unitPrice,
                        }),
                    });
                    if (!detailResponse.ok) throw new Error(`Invoice detail insert failed (HTTP ${detailResponse.status})`);
                    const detailId = Number((await detailResponse.json()).data?.detail_id);
                    if (!Number.isSafeInteger(detailId) || detailId < 1) throw new Error("Invoice detail returned no valid ID");
                    detailIds.push(detailId);
                }

                // Transition sales order to "Dispatched"
                await fetch(`${DIRECTUS_URL}/items/sales_order/${salesOrderId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        order_status: "Dispatched",
                        modified_date: nowIso,
                        modified_by: userId,
                    }),
                }).catch(() => undefined);

                return NextResponse.json({
                    invoiceId,
                    invoiceNo,
                    transactionStatus: "Prepared",
                    itemCount: detailIds.length,
                }, { status: 201 });
            } catch (error) {
                // Compensating cleanup
                for (const detailId of detailIds.reverse()) {
                    await remove("sales_invoice_details", detailId).catch(() => undefined);
                }
                if (invoiceId) {
                    await remove("sales_invoice", invoiceId).catch(() => undefined);
                }
                console.error("Invoice creation failed:", error);
                throw new ApiError(503, "Invoice creation failed. Partial records were removed; please retry.");
            }
        });
    } catch (error) {
        if (error instanceof ApiError) return NextResponse.json({ error: error.message, ...error.details }, { status: error.status });
        console.error("Invoicing creation error:", error);
        return NextResponse.json({ error: "Failed to create invoice." }, { status: 500 });
    }
}
