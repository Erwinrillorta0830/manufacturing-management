// src/app/api/manufacturing/sales-and-fulfillment/fulfilment-and-deliveries/route.ts

import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";
import { getPhTimestamp } from "../../invoice-consolidation/_time-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusInvoice {
    invoice_id: number;
    order_id: string | number;
    customer_code?: string;
    invoice_no?: string;
    invoice_date?: string;
    dispatch_date?: string;
    transaction_status?: string;
    payment_status?: string;
    total_amount?: number;
    net_amount?: number;
    branch_id?: number;
    isDispatched?: number | boolean;
    isDelivered?: number | boolean;
    remarks?: string;
    created_date?: string;
}

interface DirectusSalesOrder {
    order_id: number;
    order_no: string;
    customer_code: string;
    order_status: string;
    branch_id?: number;
    total_amount?: number;
    net_amount?: number;
    order_date?: string;
    created_date?: string;
    isDelivered?: number | boolean;
    delivered_at?: string | null;
    not_fulfilled_at?: string | null;
    remarks?: string;
}

interface DirectusInvoiceDetail {
    detail_id: number;
    order_id?: string | number;
    invoice_no: number;
    product_id: number;
    quantity: number;
    unit_price?: number;
    gross_amount?: number;
    total_amount?: number;
}

interface DirectusSalesOrderDetail {
    detail_id: number;
    order_id: number;
    product_id: number;
    ordered_quantity: number;
    allocated_quantity?: number;
    served_quantity?: number;
    unit_price?: number;
    gross_amount?: number;
    net_amount?: number;
    remarks?: string;
}

interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
}

interface DirectusCustomer {
    id: number;
    customer_name: string;
    customer_code: string;
}

interface DirectusBranch {
    id: number;
    branch_name: string;
    branch_code: string;
    isActive?: number | boolean;
}

// ─── GET: Fetch Clearance Delivery Manifests ──────────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
        const size = Math.max(1, Math.min(100, parseInt(searchParams.get("size") || "50", 10)));
        const search = (searchParams.get("search") || "").trim().toLowerCase();
        const statusFilter = searchParams.get("status") || "All";
        const branchIdParam = searchParams.get("branchId");

        // 1. Fetch active branches for lookup (only isActive = 1)
        const branchRes = await fetch(
            `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code,isActive`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const branches: DirectusBranch[] = branchRes.ok ? (await branchRes.json()).data || [] : [];
        const branchMap = new Map<number, DirectusBranch>(branches.map((b) => [Number(b.id), b]));

        // 2. Fetch sales invoices eligible for clearance
        const invoiceQs = new URLSearchParams();
        invoiceQs.set("limit", "-1");
        invoiceQs.set("sort", "-invoice_date,-created_date,-invoice_id");

        if (branchIdParam && branchIdParam !== "All") {
            invoiceQs.set("filter[branch_id][_eq]", branchIdParam);
        }

        const invRes = await fetch(
            `${DIRECTUS_URL}/items/sales_invoice?${invoiceQs.toString()}`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!invRes.ok) {
            throw new Error(`Failed to fetch sales invoices (HTTP ${invRes.status})`);
        }
        const allInvoices: DirectusInvoice[] = (await invRes.json()).data || [];

        // 3. Fetch sales orders to match order numbers & statuses
        const soOrderIds = [
            ...new Set(
                allInvoices
                    .map((inv) => Number(inv.order_id))
                    .filter((id) => !isNaN(id) && id > 0)
            ),
        ];

        const salesOrders: DirectusSalesOrder[] = [];
        if (soOrderIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < soOrderIds.length; i += chunkSize) {
                const chunk = soOrderIds.slice(i, i + chunkSize);
                const soRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${chunk.join(",")}&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (soRes.ok) {
                    const chunkData = (await soRes.json()).data || [];
                    salesOrders.push(...chunkData);
                }
            }
        }
        const salesOrderMap = new Map<number, DirectusSalesOrder>(
            salesOrders.map((so) => [Number(so.order_id), so])
        );

        // 4. Fetch customers for name lookup
        const custRes = await fetch(
            `${DIRECTUS_URL}/items/customer?limit=-1&fields=id,customer_name,customer_code`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const customers: DirectusCustomer[] = custRes.ok ? (await custRes.json()).data || [] : [];
        const customerCodeMap = new Map<string, string>(
            customers.map((c) => [c.customer_code, c.customer_name])
        );

        // 5. Fetch invoice details (line items)
        const invoiceIds = allInvoices.map((i) => Number(i.invoice_id)).filter(Boolean);
        let invoiceDetails: DirectusInvoiceDetail[] = [];
        if (invoiceIds.length > 0) {
            const detRes = await fetch(
                `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.slice(0, 300).join(",")}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (detRes.ok) {
                invoiceDetails = (await detRes.json()).data || [];
            }
        }

        // Also fetch sales_order_details as fallback for lines if invoice details are empty
        const soDetailMap = new Map<number, DirectusSalesOrderDetail[]>();
        if (soOrderIds.length > 0) {
            const sodRes = await fetch(
                `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${soOrderIds.slice(0, 300).join(",")}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (sodRes.ok) {
                const sodData: DirectusSalesOrderDetail[] = (await sodRes.json()).data || [];
                for (const sod of sodData) {
                    const list = soDetailMap.get(Number(sod.order_id)) || [];
                    list.push(sod);
                    soDetailMap.set(Number(sod.order_id), list);
                }
            }
        }

        const invDetailsMap = new Map<number, DirectusInvoiceDetail[]>();
        for (const det of invoiceDetails) {
            const list = invDetailsMap.get(Number(det.invoice_no)) || [];
            list.push(det);
            invDetailsMap.set(Number(det.invoice_no), list);
        }

        // 6. Fetch product metadata
        const allProductIds = [
            ...new Set([
                ...invoiceDetails.map((d) => Number(d.product_id)),
                ...Array.from(soDetailMap.values()).flatMap((list) => list.map((d) => Number(d.product_id))),
            ]),
        ].filter(Boolean);

        let products: DirectusProduct[] = [];
        if (allProductIds.length > 0) {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${allProductIds.slice(0, 300).join(",")}&fields=product_id,product_name,product_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (prodRes.ok) {
                products = (await prodRes.json()).data || [];
            }
        }
        const productMap = new Map<number, DirectusProduct>(
            products.map((p) => [Number(p.product_id), p])
        );

        // 7. Transform and determine clearance state for each invoice
        // Filter strictly to Dispatched / Delivery runs only (no 'For Invoicing', 'For Picking', etc.)
        const records = allInvoices
            .map((inv) => {
                const invId = Number(inv.invoice_id);
                const soId = Number(inv.order_id);
                const matchingSo = salesOrderMap.get(soId);

                const isCleared =
                    matchingSo?.order_status === "Delivered" ||
                    matchingSo?.order_status === "Partially Delivered" ||
                    matchingSo?.order_status === "Not Fulfilled" ||
                    matchingSo?.isDelivered === 1 ||
                    inv.isDelivered === 1 ||
                    inv.isDelivered === true;

                // Eligibility check: Only show orders with Dispatched status or delivered/cleared runs
                const isDispatched =
                    matchingSo?.order_status === "Dispatched" ||
                    matchingSo?.order_status === "En Route" ||
                    matchingSo?.order_status === "Delivered" ||
                    matchingSo?.order_status === "Partially Delivered" ||
                    matchingSo?.order_status === "Not Fulfilled" ||
                    inv.isDispatched === 1 ||
                    inv.isDispatched === true ||
                    isCleared;

                if (!isDispatched) {
                    return null;
                }

                // Determine line items
                const lines = invDetailsMap.get(invId) || [];
                let items: Array<{
                    detail_id: number;
                    product_id: number;
                    product_code: string;
                    product_name: string;
                    ordered_quantity: number;
                    received_quantity: number;
                    returned_quantity: number;
                    unit_price: number;
                    has_concern: boolean;
                    concern_notes: string;
                    line_status: "Fulfilled" | "Returned" | "Concern" | "Unfulfilled";
                }> = [];

                if (lines.length > 0) {
                    items = lines.map((line) => {
                        const prod = productMap.get(Number(line.product_id));
                        const ordered = Number(line.quantity || 0);

                        // If not cleared yet, received & returned are 0 (awaiting clearance)
                        const received = isCleared
                            ? matchingSo?.order_status === "Not Fulfilled"
                                ? 0
                                : ordered
                            : 0;
                        const returned = isCleared
                            ? matchingSo?.order_status === "Not Fulfilled"
                                ? ordered
                                : 0
                            : 0;

                        let lineStatus: "Fulfilled" | "Returned" | "Concern" | "Unfulfilled" = "Fulfilled";
                        if (!isCleared) {
                            lineStatus = "Unfulfilled";
                        } else if (received === 0 && returned === ordered) {
                            lineStatus = "Unfulfilled";
                        } else if (returned > 0) {
                            lineStatus = "Returned";
                        }

                        return {
                            detail_id: Number(line.detail_id),
                            product_id: Number(line.product_id),
                            product_code: prod?.product_code || `SKU-${line.product_id}`,
                            product_name: prod?.product_name || `Product #${line.product_id}`,
                            ordered_quantity: ordered,
                            received_quantity: received,
                            returned_quantity: returned,
                            unit_price: Number(line.unit_price || 0),
                            has_concern: false,
                            concern_notes: "",
                            line_status: lineStatus,
                        };
                    });
                } else {
                    // Fallback to sales_order_details if invoice lines were not populated
                    const soLines = soDetailMap.get(soId) || [];
                    items = soLines.map((sod) => {
                        const prod = productMap.get(Number(sod.product_id));
                        const ordered = Number(sod.ordered_quantity || 0);
                        const received = isCleared
                            ? matchingSo?.order_status === "Not Fulfilled"
                                ? 0
                                : ordered
                            : 0;
                        const returned = isCleared
                            ? matchingSo?.order_status === "Not Fulfilled"
                                ? ordered
                                : 0
                            : 0;

                        let lineStatus: "Fulfilled" | "Returned" | "Concern" | "Unfulfilled" = "Fulfilled";
                        if (!isCleared) {
                            lineStatus = "Unfulfilled";
                        } else if (received === 0 && returned === ordered) {
                            lineStatus = "Unfulfilled";
                        } else if (returned > 0) {
                            lineStatus = "Returned";
                        }

                        return {
                            detail_id: Number(sod.detail_id),
                            product_id: Number(sod.product_id),
                            product_code: prod?.product_code || `SKU-${sod.product_id}`,
                            product_name: prod?.product_name || `Product #${sod.product_id}`,
                            ordered_quantity: ordered,
                            received_quantity: received,
                            returned_quantity: returned,
                            unit_price: Number(sod.unit_price || 0),
                            has_concern: false,
                            concern_notes: "",
                            line_status: lineStatus,
                        };
                    });
                }

                // Derive authoritative header status
                let fulfillmentStatus:
                    | "Pending"
                    | "Fulfilled"
                    | "Fulfilled with Returns"
                    | "Fulfilled with Concern"
                    | "Unfulfilled" = "Pending";

                if (matchingSo?.order_status === "Delivered") {
                    fulfillmentStatus = "Fulfilled";
                } else if (matchingSo?.order_status === "Partially Delivered") {
                    fulfillmentStatus = "Fulfilled with Returns";
                } else if (matchingSo?.order_status === "Not Fulfilled") {
                    fulfillmentStatus = "Unfulfilled";
                } else if (isCleared) {
                    fulfillmentStatus = "Fulfilled";
                } else {
                    fulfillmentStatus = "Pending";
                }

                const custCode = inv.customer_code || matchingSo?.customer_code || "";
                const custName = customerCodeMap.get(custCode) || custCode || "Direct Customer";
                const branchId = Number(inv.branch_id || matchingSo?.branch_id || 1);
                const branchName = branchMap.get(branchId)?.branch_name || `Branch #${branchId}`;

                return {
                    order_id: soId || invId,
                    order_no: matchingSo?.order_no || `SO-${soId || invId}`,
                    order_status: matchingSo?.order_status || "Dispatched",
                    invoice_id: invId,
                    invoice_no: inv.invoice_no || `INV-${invId}`,
                    invoice_date: inv.invoice_date || inv.dispatch_date || inv.created_date || new Date().toISOString(),
                    customer_code: custCode,
                    customer_name: custName,
                    branch_id: branchId,
                    branch_name: branchName,
                    amount: Number(inv.net_amount || inv.total_amount || matchingSo?.net_amount || matchingSo?.total_amount || 0),
                    remarks: inv.remarks || matchingSo?.remarks || "",
                    fulfillment_status: fulfillmentStatus as "Pending" | "Fulfilled" | "Fulfilled with Returns" | "Fulfilled with Concern" | "Unfulfilled",
                    is_cleared: isCleared,
                    items,
                };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

        // 8. Compute Overall Metrics across entire dataset
        const totalDispatched = records.length;
        const pendingClearance = records.filter((r) => r.fulfillment_status === "Pending").length;
        const fulfilledCount = records.filter((r) => r.fulfillment_status === "Fulfilled").length;
        const concernsAndReturnsCount = records.filter(
            (r) =>
                r.fulfillment_status === "Fulfilled with Returns" ||
                r.fulfillment_status === "Fulfilled with Concern" ||
                r.fulfillment_status === "Unfulfilled"
        ).length;

        // 9. Filter records by search and status
        const filtered = records.filter((r) => {
            const matchesSearch =
                !search ||
                r.order_no.toLowerCase().includes(search) ||
                r.invoice_no.toLowerCase().includes(search) ||
                r.customer_name.toLowerCase().includes(search) ||
                r.customer_code.toLowerCase().includes(search);

            const matchesStatus =
                statusFilter === "All" ||
                (statusFilter === "Pending" && r.fulfillment_status === "Pending") ||
                (statusFilter === "Fulfilled" && r.fulfillment_status === "Fulfilled") ||
                (statusFilter === "Fulfilled with Returns" && r.fulfillment_status === "Fulfilled with Returns") ||
                (statusFilter === "Fulfilled with Concern" && r.fulfillment_status === "Fulfilled with Concern") ||
                (statusFilter === "Unfulfilled" && r.fulfillment_status === "Unfulfilled");

            return matchesSearch && matchesStatus;
        });

        // 10. Paginate
        const paginatedRecords = filtered.slice(page * size, (page + 1) * size);
        const totalPages = Math.ceil(filtered.length / size) || 1;

        return NextResponse.json({
            content: paginatedRecords,
            totalPages,
            totalElements: filtered.length,
            page,
            size,
            metrics: {
                total_dispatched: totalDispatched,
                pending_clearance: pendingClearance,
                fulfilled_count: fulfilledCount,
                concerns_and_returns_count: concernsAndReturnsCount,
            },
            branches,
        });
    } catch (error) {
        console.error("[fulfilment-and-deliveries GET] Error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Failed to load delivery clearance data." },
            { status: 500 }
        );
    }
}

// ─── POST: Post Delivery Clearance Reconciliation ────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId) {
            return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
        }

        const body = await req.json();
        const { invoice_id, order_id, clearance_remarks, items } = body;

        if (!invoice_id || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { message: "Invalid payload. invoice_id and items array are required." },
                { status: 400 }
            );
        }

        // 1. Fetch sales invoice record
        const invRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoice_id}`, {
            headers: directusHeaders,
            cache: "no-store",
        });
        if (!invRes.ok) {
            return NextResponse.json({ message: `Sales invoice #${invoice_id} not found.` }, { status: 404 });
        }
        const invoiceData: DirectusInvoice = (await invRes.json()).data;

        // Idempotency Guard: Prevent double-clearing if already delivered
        if (invoiceData.isDelivered === 1 || invoiceData.isDelivered === true) {
            return NextResponse.json(
                { message: `Delivery invoice ${invoiceData.invoice_no || invoice_id} has already been cleared and delivered.` },
                { status: 409 }
            );
        }

        // 2. Load DB-authoritative line items
        const detRes = await fetch(
            `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${invoice_id}&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        let dbDetails: DirectusInvoiceDetail[] = detRes.ok ? (await detRes.json()).data || [] : [];

        // If invoice details are empty, fetch sales_order_details as authoritative source
        const resolvedOrderId = Number(order_id || invoiceData.order_id);
        if (dbDetails.length === 0 && resolvedOrderId) {
            const sodRes = await fetch(
                `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${resolvedOrderId}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (sodRes.ok) {
                const sodData: DirectusSalesOrderDetail[] = (await sodRes.json()).data || [];
                dbDetails = sodData.map((s) => ({
                    detail_id: s.detail_id,
                    invoice_no: Number(invoice_id),
                    product_id: s.product_id,
                    quantity: s.ordered_quantity,
                    unit_price: s.unit_price,
                    gross_amount: s.gross_amount,
                    total_amount: s.net_amount,
                }));
            }
        }

        const dbDetailMap = new Map<number, DirectusInvoiceDetail>(
            dbDetails.map((d) => [Number(d.detail_id), d])
        );

        // 3. Strict Quantity Invariant Validation & Non-negative checks
        let totalReceived = 0;
        let totalReturned = 0;
        let totalOrdered = 0;
        let hasAnyConcern = false;

        for (const item of items) {
            const detailId = Number(item.detail_id);
            const dbItem = dbDetailMap.get(detailId);

            if (!dbItem) {
                return NextResponse.json(
                    { message: `Line item #${detailId} not found in database records.` },
                    { status: 422 }
                );
            }

            const rec = Number(item.received_quantity);
            const ret = Number(item.returned_quantity);

            if (isNaN(rec) || isNaN(ret) || rec < 0 || ret < 0) {
                return NextResponse.json(
                    { message: `Quantities for line #${detailId} must be non-negative numbers.` },
                    { status: 422 }
                );
            }

            const dbOrdered = Number(dbItem.quantity || 0);

            // Invariant: received + returned === dbOrdered
            if (rec + ret !== dbOrdered) {
                return NextResponse.json(
                    {
                        message: `Quantity invariant violation on line #${detailId}: Received (${rec}) + Returned (${ret}) must equal DB ordered quantity (${dbOrdered}).`,
                    },
                    { status: 422 }
                );
            }

            totalReceived += rec;
            totalReturned += ret;
            totalOrdered += dbOrdered;

            if (item.has_concern || (typeof item.concern_notes === "string" && item.concern_notes.trim().length > 0)) {
                hasAnyConcern = true;
            }
        }

        // 4. Deterministic Fulfillment Status Derivation
        let derivedStatus:
            | "Unfulfilled"
            | "Fulfilled with Returns"
            | "Fulfilled with Concern"
            | "Fulfilled";
        let targetSoStatus: "Delivered" | "Partially Delivered" | "Not Fulfilled";

        if (totalReceived === 0 && totalReturned === totalOrdered) {
            derivedStatus = "Unfulfilled";
            targetSoStatus = "Not Fulfilled";
        } else if (totalReceived > 0 && totalReturned > 0) {
            derivedStatus = "Fulfilled with Returns";
            targetSoStatus = "Partially Delivered";
        } else if (totalReturned === 0 && totalReceived === totalOrdered && hasAnyConcern) {
            derivedStatus = "Fulfilled with Concern";
            targetSoStatus = "Delivered";
        } else if (totalReceived === totalOrdered && totalReturned === 0 && !hasAnyConcern) {
            derivedStatus = "Fulfilled";
            targetSoStatus = "Delivered";
        } else {
            return NextResponse.json(
                { message: "Could not derive deterministic fulfillment status from provided reconciliation quantities." },
                { status: 422 }
            );
        }

        const phNow = getPhTimestamp();
        const isOrderDelivered = targetSoStatus === "Delivered" || targetSoStatus === "Partially Delivered";
        const isOrderUnfulfilled = targetSoStatus === "Not Fulfilled";

        // 5. Update Sales Order status, isDelivered, modified audit & delivery timestamps
        let targetSoPk = resolvedOrderId;
        if (targetSoPk) {
            try {
                const checkSoRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order?filter[_or][0][order_id][_eq]=${targetSoPk}&filter[_or][1][order_no][_eq]=${targetSoPk}&limit=1&fields=order_id`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (checkSoRes.ok) {
                    const soData = (await checkSoRes.json()).data;
                    if (soData && soData.length > 0) {
                        targetSoPk = Number(soData[0].order_id);
                    }
                }
            } catch {
                // Keep targetSoPk as is
            }

            const soPayload: Record<string, unknown> = {
                order_status: targetSoStatus,
                isDelivered: isOrderDelivered ? 1 : 0,
                modified_by: userId,
                modified_date: phNow,
                posted_by: userId,
                posted_date: phNow,
            };

            if (isOrderDelivered) {
                soPayload.delivered_at = phNow;
            } else if (isOrderUnfulfilled) {
                soPayload.not_fulfilled_at = phNow;
            }

            if (clearance_remarks && clearance_remarks.trim().length > 0) {
                soPayload.remarks = clearance_remarks.trim();
            }

            await fetch(`${DIRECTUS_URL}/items/sales_order/${targetSoPk}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify(soPayload),
            }).catch((err) => {
                console.warn(`[fulfilment-and-deliveries POST] Failed to update sales_order #${targetSoPk}:`, err);
            });
        }

        // 6. Update Sales Invoice: Mark isDelivered, and audit metadata
        const combinedRemarks = clearance_remarks ? clearance_remarks.trim() : (invoiceData.remarks || "");

        const patchInvRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoice_id}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({
                isDelivered: isOrderDelivered ? 1 : 0,
                posted_by: userId,
                posted_date: phNow,
                modified_by: userId,
                modified_date: phNow,
                delivered_at: isOrderDelivered ? phNow : null,
                remarks: combinedRemarks,
            }),
        });
        if (!patchInvRes.ok) {
            throw new Error(`Failed to mark sales invoice as delivered (HTTP ${patchInvRes.status})`);
        }

        // 7. If variance / unfulfilled / returns exist, log in unfulfilled_sales_transaction for warehouse audit
        if (totalReturned > 0 || derivedStatus === "Unfulfilled" || hasAnyConcern) {
            try {
                const unfulfilledRes = await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction`, {
                    method: "POST",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        sales_invoice_id: Number(invoice_id),
                        nte: clearance_remarks || `Delivery clearance resolved as: ${derivedStatus}`,
                        isCleared: 1,
                        checked_by: userId,
                        date_acknowledged: phNow,
                        date_created: phNow,
                        variance_amount: totalReturned,
                    }),
                });

                if (unfulfilledRes.ok) {
                    const unfulfilledHeader = (await unfulfilledRes.json()).data;
                    const unfulfilledId = unfulfilledHeader?.id;

                    if (unfulfilledId) {
                        for (const item of items) {
                            if (item.returned_quantity > 0 || item.has_concern) {
                                await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details`, {
                                    method: "POST",
                                    headers: directusHeaders,
                                    body: JSON.stringify({
                                        unfulfilled_sales_transaction_id: unfulfilledId,
                                        sales_invoice_detail_id: item.detail_id,
                                        missing_quantity: item.returned_quantity,
                                        invoice_quantity: item.received_quantity + item.returned_quantity,
                                        total_amount: 0,
                                    }),
                                }).catch(() => null);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("[fulfilment-and-deliveries POST] Error recording unfulfilled_sales_transaction:", e);
            }
        }

        return NextResponse.json({
            success: true,
            status: derivedStatus,
            message: `Delivery clearance committed successfully. Order status updated to "${targetSoStatus}".`,
            totals: {
                ordered: totalOrdered,
                received: totalReceived,
                returned: totalReturned,
                has_concern: hasAnyConcern,
            },
        });
    } catch (error) {
        console.error("[fulfilment-and-deliveries POST] Error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Failed to commit delivery clearance." },
            { status: 500 }
        );
    }
}