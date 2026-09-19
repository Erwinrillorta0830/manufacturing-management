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
const locks = new Map<string, Promise<void>>();

async function directus(collection: string, params = new URLSearchParams()) {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params}`, { headers: directusHeaders, cache: "no-store" });
    if (!response.ok) throw new ApiError(503, `Unable to read ${collection}.`);
    return (await response.json()).data;
}

async function remove(collection: string, id: number) {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}/${id}`, { method: "DELETE", headers: directusHeaders });
    if (!response.ok && response.status !== 404) throw new Error(`${collection} ${id} delete returned ${response.status}`);
}

async function withLock<T>(key: string, operation: () => Promise<T>) {
    const previous = locks.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    locks.set(key, queued);
    await previous;
    try {
        return await operation();
    } finally {
        release();
        if (locks.get(key) === queued) locks.delete(key);
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

        const existingInvoiceId = Number(body?.existingInvoiceId) || null;
        const isReInvoice = existingInvoiceId !== null && existingInvoiceId > 0;

        if (!Number.isSafeInteger(salesOrderId) || salesOrderId < 1 || !Number.isSafeInteger(invoiceTypeId) || invoiceTypeId < 1 || !invoiceNo || !invoiceDate || !dueDate) {
            throw new ApiError(400, "salesOrderId, invoiceTypeId, invoiceNo, invoiceDate, and dueDate are required.");
        }
        if (!Number.isFinite(Date.parse(invoiceDate)) || !Number.isFinite(Date.parse(dueDate))) {
            throw new ApiError(400, "invoiceDate and dueDate must be valid dates.");
        }

        // Check if sales order belongs to a consolidation batch before acquiring lock
        let consolidatorId: number | null = null;
        try {
            const ciRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[invoice_id][_eq]=${salesOrderId}&fields=id,consolidator_id&limit=1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (ciRes.ok) {
                const ciData = (await ciRes.json()).data || [];
                if (ciData.length > 0) {
                    const rawC = ciData[0].consolidator_id;
                    const parsedId = typeof rawC === "object" && rawC !== null ? Number(rawC.id) : Number(rawC);
                    if (Number.isSafeInteger(parsedId) && parsedId > 0) {
                        consolidatorId = parsedId;
                    }
                }
            }
        } catch (ciErr) {
            console.warn("[Invoicing POST] Warning checking consolidator batch:", ciErr);
        }

        const lockKey = consolidatorId ? `batch:${consolidatorId}` : `order:${salesOrderId}`;

        return await withLock(lockKey, async () => {
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
                `${DIRECTUS_URL}/items/sales_order/${salesOrderId}?fields=order_id,order_no,order_status,customer_code,branch_id,salesman_id,payment_terms,discount_amount,sales_type,receipt_type,delivery_date`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (orderResponse.status === 404) throw new ApiError(404, "Sales order not found.");
            if (!orderResponse.ok) {
                const errText = await orderResponse.text().catch(() => "");
                throw new ApiError(503, `Unable to load the sales order (HTTP ${orderResponse.status}): ${errText}`);
            }
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

            // "Not Delivered" invoices are re-invoiceable (unfulfilled path) — only truly active ones block
            const blockingInvoices = activeInvoices.filter(
                (inv) => inv.transaction_status !== "Cancelled" && inv.transaction_status !== "Not Delivered"
            );
            if (blockingInvoices.length > 0) {
                throw new ApiError(409, "Sales order already has an active invoice.");
            }

            // Validate the re-invoice target if provided
            if (isReInvoice) {
                const staleMatch = activeInvoices.find(
                    (inv) => Number(inv.invoice_id) === existingInvoiceId && inv.transaction_status === "Not Delivered"
                );
                if (!staleMatch) {
                    throw new ApiError(409, "Re-invoice target invoice not found or is not in Not Delivered status.");
                }
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

            const lineAllocMap = new Map<number, import("@/modules/manufacturing-management/invoicing-and-billing/invoicing-old/types").LineAllocationPayload>();
            const rawLineAllocations = (body as { lineAllocations?: import("@/modules/manufacturing-management/invoicing-and-billing/invoicing-old/types").LineAllocationPayload[] })?.lineAllocations;
            if (Array.isArray(rawLineAllocations)) {
                for (const la of rawLineAllocations) {
                    if (la && Number(la.productId)) {
                        lineAllocMap.set(Number(la.productId), la);
                    }
                }
            }

            const discount = Number(order.discount_amount || 0);
            const gross = details.reduce((sum, detail) => {
                const pId = Number(detail.product_id);
                const customAlloc = lineAllocMap.get(pId);
                const qty = customAlloc ? Number(customAlloc.quantity || 0) : Number(detail.ordered_quantity || 0);
                return sum + Number(detail.unit_price) * qty;
            }, 0);

            if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(discount) || discount < 0 || discount > gross) {
                throw new ApiError(409, "Sales order has invalid invoice amounts.");
            }

            // Model B Invariant: Validate requested quantities against live remaining batch pool inside the lock
            if (consolidatorId) {
                const conDetailsRes = await fetch(
                    `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${consolidatorId}&fields=id,product_id,picked_quantity,applied_quantity&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                const conDetailsList: Array<{
                    product_id: number;
                    picked_quantity?: number | null;
                    applied_quantity?: number | null;
                }> = conDetailsRes.ok ? (await conDetailsRes.json()).data || [] : [];

                const totalBatchPickedByProduct = new Map<number, number>();
                for (const cd of conDetailsList) {
                    const pId = Number(cd.product_id);
                    const q = Number(cd.picked_quantity !== undefined && cd.picked_quantity !== null ? cd.picked_quantity : cd.applied_quantity || 0);
                    totalBatchPickedByProduct.set(pId, (totalBatchPickedByProduct.get(pId) || 0) + q);
                }

                const siblingCiRes = await fetch(
                    `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${consolidatorId}&limit=-1&fields=invoice_id`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                const sibJunctions = siblingCiRes.ok ? (await siblingCiRes.json()).data || [] : [];
                const allOrderIds = sibJunctions.map((j: { invoice_id: number }) => Number(j.invoice_id)).filter(Boolean);
                const siblingOrderIds = allOrderIds.filter((id: number) => id !== salesOrderId);

                const siblingInvoicedByProduct = new Map<number, number>();
                if (siblingOrderIds.length > 0) {
                    const sibInvRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_in]=${siblingOrderIds.join(",")}&filter[transaction_status][_neq]=Cancelled&fields=invoice_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    const sibInvoices = sibInvRes.ok ? (await sibInvRes.json()).data || [] : [];
                    const activeSibInvoiceIds = sibInvoices.map((inv: { invoice_id: number }) => Number(inv.invoice_id)).filter(Boolean);

                    if (activeSibInvoiceIds.length > 0) {
                        const sibInvDetailsRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${activeSibInvoiceIds.join(",")}&fields=invoice_no,order_id,product_id,quantity&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (sibInvDetailsRes.ok) {
                            const sibInvDetails = (await sibInvDetailsRes.json()).data || [];
                            for (const d of sibInvDetails) {
                                const prodId = Number(d.product_id);
                                const qty = Number(d.quantity || 0);
                                siblingInvoicedByProduct.set(prodId, (siblingInvoicedByProduct.get(prodId) || 0) + qty);
                            }
                        }
                    }
                }

                for (const detail of details) {
                    const pId = Number(detail.product_id);
                    const customAlloc = lineAllocMap.get(pId);
                    const reqQty = customAlloc ? Number(customAlloc.quantity || 0) : Number(detail.ordered_quantity || 0);
                    if (reqQty <= 0) continue;

                    const totalPicked = totalBatchPickedByProduct.get(pId) || 0;
                    const alreadyInvoiced = siblingInvoicedByProduct.get(pId) || 0;
                    const liveRemainingPool = Math.max(0, totalPicked - alreadyInvoiced);

                    if (reqQty > liveRemainingPool) {
                        const prodName = productMap.get(pId)?.product_name || `Product #${pId}`;
                        throw new ApiError(
                            409,
                            `Requested quantity (${reqQty}) for "${prodName}" exceeds the remaining consolidation batch pool (${liveRemainingPool}). Another sibling invoice has already consumed batch inventory.`
                        );
                    }
                }
            }

            let invoiceId: number | null = null;
            const detailIds: number[] = [];
            try {
                const nowIso = await getISOStringInConfiguredTimezone();
                const invDateIso = invoiceDate ? new Date(invoiceDate).toISOString() : nowIso;
                const dueDateIso = dueDate ? new Date(dueDate).toISOString() : nowIso;

                if (isReInvoice && existingInvoiceId) {
                    // PATCH mode — reuse the existing "Not Delivered" invoice
                    const patchResponse = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${existingInvoiceId}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            invoice_no: invoiceNo,
                            invoice_date: invDateIso,
                            dispatch_date: nowIso,
                            due_date: dueDateIso,
                            invoice_type: invoiceTypeId,
                            transaction_status: "Prepared",
                            payment_status: "Unpaid",
                            total_amount: gross,
                            gross_amount: gross,
                            discount_amount: discount,
                            vat_amount: 0,
                            net_amount: Math.max(0, gross - discount),
                            modified_by: userId,
                            modified_date: nowIso,
                            remarks,
                            isReceipt: invoiceType?.isOfficial ? 1 : 0,
                            isPosted: 0,
                            isDispatched: 1,
                            isRemitted: 0,
                        }),
                    });
                    if (!patchResponse.ok) {
                        const errText = await patchResponse.text().catch(() => "");
                        throw new Error(`Invoice header update failed (HTTP ${patchResponse.status}): ${errText}`);
                    }
                    invoiceId = existingInvoiceId;

                    // Remove old sales_invoice_details (and their batches) so we re-insert fresh ones
                    const oldDetailsRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${invoiceId}&fields=detail_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (oldDetailsRes.ok) {
                        const oldDetails: Array<{ detail_id: number }> = (await oldDetailsRes.json()).data || [];
                        for (const od of oldDetails) {
                            // Delete associated batches first
                            const oldBatchesRes = await fetch(
                                `${DIRECTUS_URL}/items/sales_invoice_batches?filter[invoice_detail_id][_eq]=${od.detail_id}&fields=id&limit=-1`,
                                { headers: directusHeaders, cache: "no-store" }
                            );
                            if (oldBatchesRes.ok) {
                                const oldBatches: Array<{ id: number }> = (await oldBatchesRes.json()).data || [];
                                for (const ob of oldBatches) {
                                    await fetch(`${DIRECTUS_URL}/items/sales_invoice_batches/${ob.id}`, {
                                        method: "DELETE",
                                        headers: directusHeaders,
                                    }).catch(() => undefined);
                                }
                            }
                            await fetch(`${DIRECTUS_URL}/items/sales_invoice_details/${od.detail_id}`, {
                                method: "DELETE",
                                headers: directusHeaders,
                            }).catch(() => undefined);
                        }
                    }
                } else {
                    // POST mode — create a brand new invoice
                    const headerResponse = await fetch(`${DIRECTUS_URL}/items/sales_invoice`, {
                        method: "POST",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            invoice_no: invoiceNo,
                            invoice_date: invDateIso,
                            dispatch_date: nowIso,
                            due_date: dueDateIso,
                            created_date: nowIso,
                            customer_code: order.customer_code,
                            order_id: String(salesOrderId),
                            salesman_id: order.salesman_id || null,
                            branch_id: branchId,
                            payment_terms: order.payment_terms || null,
                            sales_type: order.sales_type || null,
                            invoice_type: invoiceTypeId,
                            transaction_status: "Prepared",
                            payment_status: "Unpaid",
                            total_amount: gross,
                            gross_amount: gross,
                            discount_amount: discount,
                            vat_amount: 0,
                            net_amount: Math.max(0, gross - discount),
                            created_by: userId,
                            modified_by: userId,
                            modified_date: nowIso,
                            remarks,
                            isReceipt: invoiceType?.isOfficial ? 1 : 0,
                            isPosted: 0,
                            isDispatched: 1,
                            isRemitted: 0,
                            isReplaced: 0,
                        }),
                    });
                    if (!headerResponse.ok) {
                        const errText = await headerResponse.text().catch(() => "");
                        throw new Error(`Invoice header insert failed (HTTP ${headerResponse.status}): ${errText}`);
                    }
                    invoiceId = Number((await headerResponse.json()).data?.invoice_id);
                    if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) throw new Error("Invoice header returned no valid ID");
                }

                for (const detail of details) {
                    const pId = Number(detail.product_id);
                    const customAlloc = lineAllocMap.get(pId);
                    const quantity = customAlloc ? Number(customAlloc.quantity || 0) : Number(detail.ordered_quantity);
                    if (quantity <= 0) continue;

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
                    if (!detailResponse.ok) {
                        const errText = await detailResponse.text().catch(() => "");
                        throw new Error(`Invoice detail insert failed (HTTP ${detailResponse.status}): ${errText}`);
                    }
                    const detailId = Number((await detailResponse.json()).data?.detail_id);
                    if (!Number.isSafeInteger(detailId) || detailId < 1) throw new Error("Invoice detail returned no valid ID");
                    detailIds.push(detailId);

                    // Insert sales_invoice_batches for batch lot trace (multiple rows per allocated batch)
                    if (customAlloc?.batchAllocations && customAlloc.batchAllocations.length > 0) {
                        for (const b of customAlloc.batchAllocations) {
                            const bQty = Number(b.quantity || 0);
                            const rawInvId = Number(b.inventoryLotId || 0);
                            if (bQty > 0 && rawInvId > 0) {
                                await fetch(`${DIRECTUS_URL}/items/sales_invoice_batches`, {
                                    method: "POST",
                                    headers: directusHeaders,
                                    body: JSON.stringify({
                                        invoice_id: invoiceId,
                                        invoice_detail_id: detailId,
                                        product_id: pId,
                                        inventory_lot_id: rawInvId,
                                        lot_id: b.lotId || null,
                                        batch_no: b.batchNo || null,
                                        quantity: bQty,
                                        created_at: nowIso,
                                        created_by: userId,
                                    }),
                                }).catch((err) => {
                                    console.warn("[Invoicing] Warning inserting sales_invoice_batches:", err);
                                });

                                // Reconcile sales_order_reservation to Consumed (for standalone orders only)
                                // Under Model B, consolidated batches leave historical physical reservations intact
                                if (!consolidatorId && detail.detail_id) {
                                    const soResRes = await fetch(
                                        `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_eq]=${detail.detail_id}&filter[inventory_lot_id][_eq]=${rawInvId}&limit=1`,
                                        { headers: directusHeaders, cache: "no-store" }
                                    ).catch(() => null);
                                    if (soResRes && soResRes.ok) {
                                        const soResList = (await soResRes.json()).data || [];
                                        if (soResList.length > 0) {
                                            const rId = soResList[0].reservation_id || soResList[0].id;
                                            await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                                method: "PATCH",
                                                headers: directusHeaders,
                                                body: JSON.stringify({
                                                    status: "Consumed",
                                                    modified_date: nowIso,
                                                    modified_by: userId,
                                                }),
                                            }).catch(() => null);
                                        }
                                    }
                                }
                            }
                        }
                    }
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
                const msg = error instanceof Error ? error.message : "Invoice creation failed. Partial records were removed; please retry.";
                throw new ApiError(500, msg);
            }
        });
    } catch (error) {
        if (error instanceof ApiError) return NextResponse.json({ error: error.message, ...error.details }, { status: error.status });
        console.error("Invoicing creation error:", error);
        return NextResponse.json({ error: "Failed to create invoice." }, { status: 500 });
    }
}
