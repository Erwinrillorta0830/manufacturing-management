// src/app/api/manufacturing/sales-and-fulfillment/fulfilment-and-deliveries/route.ts

import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";
import { getPhTimestamp } from "../../invoice-consolidation/_time-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusConsolidator {
    id: number;
    consolidator_no: string;
    status: string;
    branch_id: number;
    created_at: string;
    updated_at: string;
    created_by?: number;
    checked_by?: number | null;
}

interface DirectusConsolidatorInvoice {
    id: number;
    consolidator_id: number;
    invoice_id: number;
}

interface DirectusConsolidatorDetail {
    id: number;
    consolidator_id: number;
    sales_order_detail_id?: number | null;
    product_id: number;
    ordered_quantity: number;
    picked_quantity: number;
    applied_quantity: number;
}

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
    description?: string;
    short_description?: string;
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

// ─── GET: Fetch Consolidated Delivery Manifests ───────────────────────────────
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

        // 2. Fetch consolidator trips eligible for clearance
        const consolidatorQs = new URLSearchParams();
        consolidatorQs.set("limit", "-1");
        consolidatorQs.set("sort", "-created_at,-id");
        consolidatorQs.set("filter[is_delete][_eq]", "0");

        if (branchIdParam && branchIdParam !== "All") {
            consolidatorQs.set("filter[branch_id][_eq]", branchIdParam);
        }

        const conRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator?${consolidatorQs.toString()}`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!conRes.ok) {
            throw new Error(`Failed to fetch consolidations (HTTP ${conRes.status})`);
        }
        const allConsolidators: DirectusConsolidator[] = (await conRes.json()).data || [];
        const consolidatorIds = allConsolidators.map((c) => Number(c.id)).filter(Boolean);

        // 3. Fetch BOTH consolidator_details AND consolidator_invoices
        const consolidatorDetails: DirectusConsolidatorDetail[] = [];
        const consolidatorInvoices: DirectusConsolidatorInvoice[] = [];

        if (consolidatorIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < consolidatorIds.length; i += chunkSize) {
                const chunk = consolidatorIds.slice(i, i + chunkSize);
                const [conDetRes, conInvRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_in]=${chunk.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_in]=${chunk.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);

                if (conDetRes.ok) {
                    const dData = (await conDetRes.json()).data || [];
                    consolidatorDetails.push(...dData);
                }
                if (conInvRes.ok) {
                    const iData = (await conInvRes.json()).data || [];
                    consolidatorInvoices.push(...iData);
                }
            }
        }

        // 4. Map consolidator -> sales_order_detail_ids and invoice_ids
        const conSodMap = new Map<number, number[]>();
        for (const cd of consolidatorDetails) {
            const conId = Number(cd.consolidator_id);
            const sodId = Number(cd.sales_order_detail_id);
            if (sodId) {
                const list = conSodMap.get(conId) || [];
                list.push(sodId);
                conSodMap.set(conId, list);
            }
        }

        const conInvMap = new Map<number, number[]>();
        for (const ci of consolidatorInvoices) {
            const conId = Number(ci.consolidator_id);
            const invId = Number(ci.invoice_id);
            if (invId) {
                const list = conInvMap.get(conId) || [];
                list.push(invId);
                conInvMap.set(conId, list);
            }
        }

        const allSodIds = [
            ...new Set(consolidatorDetails.map((cd) => Number(cd.sales_order_detail_id)).filter(Boolean)),
        ];

        // 5. Fetch sales_order_details matching allSodIds
        const salesOrderDetails: DirectusSalesOrderDetail[] = [];
        if (allSodIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < allSodIds.length; i += chunkSize) {
                const chunk = allSodIds.slice(i, i + chunkSize);
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[detail_id][_in]=${chunk.join(",")}&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (sodRes.ok) {
                    const chunkData = (await sodRes.json()).data || [];
                    salesOrderDetails.push(...chunkData);
                }
            }
        }
        const sodDetailMap = new Map<number, DirectusSalesOrderDetail>(
            salesOrderDetails.map((s) => [Number(s.detail_id), s])
        );

        // Collect all distinct order_ids & invoice_ids
        const sodOrderIds = salesOrderDetails.map((s) => Number(s.order_id)).filter(Boolean);
        const rawInvIds = consolidatorInvoices.map((ci) => Number(ci.invoice_id)).filter(Boolean);

        const candidateOrderIds = [...new Set([...sodOrderIds, ...rawInvIds])];

        // 6. Fetch sales_order for all candidate order IDs
        const salesOrders: DirectusSalesOrder[] = [];
        if (candidateOrderIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < candidateOrderIds.length; i += chunkSize) {
                const chunk = candidateOrderIds.slice(i, i + chunkSize);
                const [soRes, sodByOrderRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${chunk.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${chunk.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);
                if (soRes.ok) {
                    const chunkData = (await soRes.json()).data || [];
                    salesOrders.push(...chunkData);
                }
                if (sodByOrderRes.ok) {
                    const chunkData = (await sodByOrderRes.json()).data || [];
                    for (const item of chunkData) {
                        const dId = Number(item.detail_id);
                        if (dId && !sodDetailMap.has(dId)) {
                            salesOrderDetails.push(item);
                            sodDetailMap.set(dId, item);
                        }
                    }
                }
            }
        }
        const salesOrderMap = new Map<number, DirectusSalesOrder>(
            salesOrders.map((so) => [Number(so.order_id), so])
        );

        // 7. Fetch sales_invoice matching either invoice_id or order_id
        const allInvoices: DirectusInvoice[] = [];
        if (candidateOrderIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < candidateOrderIds.length; i += chunkSize) {
                const chunk = candidateOrderIds.slice(i, i + chunkSize);
                const [invByIdRes, invByOrderRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${chunk.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_in]=${chunk.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);

                if (invByIdRes.ok) {
                    const d = (await invByIdRes.json()).data || [];
                    allInvoices.push(...d);
                }
                if (invByOrderRes.ok) {
                    const d = (await invByOrderRes.json()).data || [];
                    allInvoices.push(...d);
                }
            }
        }

        // Deduplicate invoices
        const invoiceMapById = new Map<number, DirectusInvoice>();
        const invoiceMapByOrderId = new Map<number, DirectusInvoice>();
        for (const inv of allInvoices) {
            const invId = Number(inv.invoice_id);
            const ordId = Number(inv.order_id);
            if (invId) invoiceMapById.set(invId, inv);
            if (ordId) invoiceMapByOrderId.set(ordId, inv);
        }

        // 8. Fetch customer names
        const customerCodes = [
            ...new Set([
                ...allInvoices.map((i) => i.customer_code).filter(Boolean),
                ...salesOrders.map((s) => s.customer_code).filter(Boolean),
            ]),
        ];
        const customerCodeMap = new Map<string, string>();
        if (customerCodes.length > 0) {
            const custRes = await fetch(
                `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${customerCodes.slice(0, 300).join(",")}&fields=id,customer_name,customer_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (custRes.ok) {
                const custList: DirectusCustomer[] = (await custRes.json()).data || [];
                for (const c of custList) {
                    if (c.customer_code) customerCodeMap.set(c.customer_code, c.customer_name);
                }
            }
        }

        // 9. Fetch product metadata
        const allProductIds = [
            ...new Set([
                ...consolidatorDetails.map((d) => Number(d.product_id)),
                ...salesOrderDetails.map((d) => Number(d.product_id)),
            ]),
        ].filter(Boolean);

        const products: DirectusProduct[] = [];
        if (allProductIds.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < allProductIds.length; i += chunkSize) {
                const chunk = allProductIds.slice(i, i + chunkSize);
                const prodRes = await fetch(
                    `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${chunk.join(",")}&fields=product_id,product_name,product_code,description,short_description&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (prodRes.ok) {
                    const chunkData = (await prodRes.json()).data || [];
                    products.push(...chunkData);
                }
            }
        }
        const productMap = new Map<number, DirectusProduct>();
        for (const p of products) {
            const pid = Number(p.product_id || (p as { id?: number }).id);
            if (pid) productMap.set(pid, p);
        }

        // 10. Fetch linked sales returns and return line items
        const allInvoiceNos = Array.from(invoiceMapById.values())
            .map((inv) => (inv.invoice_no ? inv.invoice_no.toString().trim() : ""))
            .filter(Boolean);
        const allOrderNos = Array.from(salesOrderMap.values())
            .map((so) => (so.order_no ? so.order_no.toString().trim() : ""))
            .filter(Boolean);
        const allCandidateNos = [...new Set([...allInvoiceNos, ...allOrderNos])];

        const salesReturnMap = new Map<
            string,
            {
                return_id: number;
                return_number: string;
                invoice_no?: string;
                invoice_id?: number;
                order_id?: number;
                status: string;
                return_date?: string | null;
                total_amount?: number | null;
            }
        >();
        const returnItemQtyMap = new Map<string, number>();

        try {
            const [srByNoRes, srByOrderIdRes, srRecentRes] = await Promise.all([
                allCandidateNos.length > 0
                    ? fetch(
                          `${DIRECTUS_URL}/items/sales_return?filter[invoice_no][_in]=${allCandidateNos
                              .slice(0, 300)
                              .map((no) => encodeURIComponent(no))
                              .join(",")}&fields=return_id,return_number,invoice_no,order_id,status,return_date,total_amount&limit=-1`,
                          { headers: directusHeaders, cache: "no-store" }
                      )
                    : Promise.resolve(null),
                candidateOrderIds.length > 0
                    ? fetch(
                          `${DIRECTUS_URL}/items/sales_return?filter[order_id][_in]=${candidateOrderIds
                              .slice(0, 300)
                              .join(",")}&fields=return_id,return_number,invoice_no,order_id,status,return_date,total_amount&limit=-1`,
                          { headers: directusHeaders, cache: "no-store" }
                      )
                    : Promise.resolve(null),
                fetch(
                    `${DIRECTUS_URL}/items/sales_return?limit=150&sort=-return_id&fields=return_id,return_number,invoice_no,order_id,status,return_date,total_amount`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
            ]);

            const rawSrList: Array<{
                return_id: number;
                return_number: string;
                invoice_no?: string;
                order_id?: string | number;
                status: string;
                return_date?: string | null;
                total_amount?: number | null;
            }> = [];

            if (srByNoRes && srByNoRes.ok) {
                const d = (await srByNoRes.json()).data || [];
                rawSrList.push(...d);
            }
            if (srByOrderIdRes && srByOrderIdRes.ok) {
                const d = (await srByOrderIdRes.json()).data || [];
                rawSrList.push(...d);
            }
            if (srRecentRes && srRecentRes.ok) {
                const d = (await srRecentRes.json()).data || [];
                rawSrList.push(...d);
            }

            // Deduplicate by return_id
            const uniqueSrMap = new Map<number, (typeof rawSrList)[0]>();
            for (const sr of rawSrList) {
                if (sr.return_id) uniqueSrMap.set(Number(sr.return_id), sr);
            }
            const allSrData = Array.from(uniqueSrMap.values());

            for (const sr of allSrData) {
                const returnInfo = {
                    return_id: Number(sr.return_id),
                    return_number: sr.return_number || `SR-${sr.return_id}`,
                    invoice_no: sr.invoice_no ? sr.invoice_no.toString().trim() : undefined,
                    order_id: sr.order_id ? Number(sr.order_id) : undefined,
                    status: sr.status || "Pending",
                    return_date: sr.return_date || null,
                    total_amount: sr.total_amount ? Number(sr.total_amount) : null,
                };
                if (sr.invoice_no) {
                    salesReturnMap.set(sr.invoice_no.toString().trim().toLowerCase(), returnInfo);
                }
                if (sr.order_id) {
                    salesReturnMap.set(sr.order_id.toString().trim().toLowerCase(), returnInfo);
                }
                if (sr.return_number) {
                    salesReturnMap.set(sr.return_number.toString().trim().toLowerCase(), returnInfo);
                }
            }

            // Fetch details for all found sales returns
            const distinctReturnNos = [
                ...new Set([
                    ...allSrData.map((s) => s.return_number).filter(Boolean),
                    ...allSrData.map((s) => String(s.return_id)).filter(Boolean),
                ]),
            ];

            if (distinctReturnNos.length > 0) {
                const srDetRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_return_details?filter[return_no][_in]=${distinctReturnNos
                        .slice(0, 300)
                        .map((r) => encodeURIComponent(r))
                        .join(",")}&limit=-1&fields=detail_id,return_no,product_id,quantity`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (srDetRes.ok) {
                    const srDetails: Array<{ detail_id: number; return_no: string; product_id: number | { product_id?: number; id?: number }; quantity: number }> =
                        (await srDetRes.json()).data || [];

                    // Map return_no to associated return info
                    const returnHeaderByNo = new Map<string, (typeof allSrData)[0]>();
                    for (const sr of allSrData) {
                        if (sr.return_number) {
                            returnHeaderByNo.set(sr.return_number.toString().trim(), sr);
                        }
                        if (sr.return_id) {
                            returnHeaderByNo.set(String(sr.return_id), sr);
                        }
                    }

                    for (const srd of srDetails) {
                        const rawPid = srd.product_id;
                        const pId = typeof rawPid === "object" && rawPid !== null
                            ? Number((rawPid as { product_id?: number; id?: number }).product_id || (rawPid as { product_id?: number; id?: number }).id)
                            : Number(rawPid);

                        const qty = Number(srd.quantity || 0);
                        const retNo = srd.return_no ? srd.return_no.toString().trim() : "";

                        if (pId && retNo) {
                            returnItemQtyMap.set(`${retNo}:${pId}`, qty);
                            returnItemQtyMap.set(`${retNo.toLowerCase()}:${pId}`, qty);

                            const header = returnHeaderByNo.get(retNo);
                            if (header) {
                                if (header.return_number) {
                                    returnItemQtyMap.set(`${header.return_number.toString().trim().toLowerCase()}:${pId}`, qty);
                                }
                                if (header.invoice_no) {
                                    returnItemQtyMap.set(`${header.invoice_no.toString().trim().toLowerCase()}:${pId}`, qty);
                                }
                                if (header.order_id) {
                                    returnItemQtyMap.set(`${header.order_id.toString().trim().toLowerCase()}:${pId}`, qty);
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.warn("[fulfilment-and-deliveries GET] Error fetching sales_return links:", err);
        }

        // 11. Transform each Consolidator into a ConsolidatedDeliveryRecord
        const records = allConsolidators
            .map((con) => {
                const conId = Number(con.id);
                const branchId = Number(con.branch_id || 1);
                const branchName = branchMap.get(branchId)?.branch_name || `Branch #${branchId}`;

                // Gather all order IDs associated with this consolidator:
                // From consolidator_details (via sales_order_details)
                const conSodList = conSodMap.get(conId) || [];
                const conOrderIdsFromDetails = conSodList
                    .map((sodId) => sodDetailMap.get(sodId)?.order_id)
                    .filter((id): id is number => id !== undefined && id > 0);

                // From consolidator_invoices
                const conInvList = conInvMap.get(conId) || [];
                const conOrderIdsFromInvoices = conInvList.map((invId) => {
                    const inv = invoiceMapById.get(invId);
                    return inv ? Number(inv.order_id) : invId;
                });

                const distinctOrderIds = [...new Set([...conOrderIdsFromDetails, ...conOrderIdsFromInvoices])];

                const childOrders = distinctOrderIds
                    .map((orderId) => {
                        const so = salesOrderMap.get(orderId);
                        const inv = invoiceMapByOrderId.get(orderId) || invoiceMapById.get(orderId);

                        if (!so && !inv) return null;

                        const invoiceNo = inv?.invoice_no || so?.order_no || `SO-${orderId}`;
                        const invoiceId = inv?.invoice_id || orderId;

                        const linkedSr =
                            salesReturnMap.get(invoiceNo.toLowerCase()) ||
                            (so?.order_no ? salesReturnMap.get(so.order_no.toLowerCase()) : null) ||
                            salesReturnMap.get(String(orderId)) ||
                            (inv?.invoice_id ? salesReturnMap.get(String(inv.invoice_id)) : null) ||
                            null;

                        const isCleared =
                            so?.order_status === "Delivered" ||
                            so?.order_status === "Partially Delivered" ||
                            so?.order_status === "Not Fulfilled" ||
                            so?.isDelivered === 1 ||
                            inv?.isDelivered === 1 ||
                            inv?.isDelivered === true;

                        // Build line items for this order in this consolidator
                        const relevantSodDetails = salesOrderDetails.filter(
                            (sod) => Number(sod.order_id) === orderId
                        );

                        const items = relevantSodDetails.map((sod) => {
                            const prod = productMap.get(Number(sod.product_id));
                            const prodName = prod?.description || prod?.product_name || `Product #${sod.product_id}`;
                            const prodCode = prod?.product_code || `SKU-${sod.product_id}`;
                            const prodDesc = prod?.short_description || (prod?.description && prod?.description !== prod?.product_name ? prod?.description : "") || "";
                            const uom = "";

                            const ordered = Number(sod.ordered_quantity || 0);

                            // Check if quantity returned from linked Sales Return
                            const srReturned = linkedSr
                                ? returnItemQtyMap.get(`${linkedSr.return_number.toLowerCase()}:${sod.product_id}`) ||
                                  returnItemQtyMap.get(`${linkedSr.return_number}:${sod.product_id}`) ||
                                  returnItemQtyMap.get(`${String(linkedSr.return_id)}:${sod.product_id}`) ||
                                  returnItemQtyMap.get(`${invoiceNo.toLowerCase()}:${sod.product_id}`) ||
                                  returnItemQtyMap.get(`${String(orderId)}:${sod.product_id}`) ||
                                  0
                                : returnItemQtyMap.get(`${invoiceNo.toLowerCase()}:${sod.product_id}`) ||
                                  returnItemQtyMap.get(`${String(orderId)}:${sod.product_id}`) ||
                                  0;

                            let received = ordered;
                            let returned = 0;

                            if (srReturned > 0) {
                                returned = Math.min(ordered, srReturned);
                                received = Math.max(0, ordered - returned);
                            } else if (isCleared) {
                                received = so?.order_status === "Not Fulfilled" ? 0 : ordered;
                                returned = so?.order_status === "Not Fulfilled" ? ordered : 0;
                            } else {
                                received = ordered;
                                returned = 0;
                            }

                            let lineStatus: "Fulfilled" | "Fulfilled with Returns" | "Unfulfilled / Returns" = "Fulfilled";
                            if (received === 0 && returned === ordered) {
                                lineStatus = "Unfulfilled / Returns";
                            } else if (returned > 0) {
                                lineStatus = "Fulfilled with Returns";
                            } else {
                                lineStatus = "Fulfilled";
                            }

                            return {
                                detail_id: Number(sod.detail_id),
                                product_id: Number(sod.product_id),
                                product_code: prodCode,
                                product_name: prodName,
                                product_description: prodDesc,
                                uom: uom,
                                ordered_quantity: ordered,
                                received_quantity: received,
                                returned_quantity: returned,
                                unit_price: Number(sod.unit_price || 0),
                                has_concern: false,
                                concern_notes: "",
                                line_status: lineStatus,
                            };
                        });

                        const hasAnyReturns = items.some((it) => it.returned_quantity > 0);
                        const isAllUnfulfilled = items.length > 0 && items.every((it) => it.received_quantity === 0 && it.returned_quantity === it.ordered_quantity);

                        let orderFulfillmentStatus:
                            | "Pending"
                            | "Fulfilled"
                            | "Fulfilled with Returns"
                            | "Unfulfilled / Returns" = "Pending";

                        if (so?.order_status === "Delivered") {
                            orderFulfillmentStatus = hasAnyReturns ? "Fulfilled with Returns" : "Fulfilled";
                        } else if (so?.order_status === "Partially Delivered") {
                            orderFulfillmentStatus = "Fulfilled with Returns";
                        } else if (so?.order_status === "Not Fulfilled") {
                            orderFulfillmentStatus = "Unfulfilled / Returns";
                        } else if (linkedSr || hasAnyReturns) {
                            if (isAllUnfulfilled) {
                                orderFulfillmentStatus = "Unfulfilled / Returns";
                            } else if (hasAnyReturns) {
                                orderFulfillmentStatus = "Fulfilled with Returns";
                            } else {
                                orderFulfillmentStatus = "Fulfilled";
                            }
                        } else if (isCleared) {
                            orderFulfillmentStatus = "Fulfilled";
                        } else {
                            orderFulfillmentStatus = "Pending";
                        }

                        const custCode = so?.customer_code || inv?.customer_code || "";
                        const custName = customerCodeMap.get(custCode) || custCode || "Direct Customer";

                        return {
                            order_id: orderId,
                            order_no: so?.order_no || `SO-${orderId}`,
                            order_status: so?.order_status || con.status || "Dispatched",
                            invoice_id: invoiceId,
                            invoice_no: invoiceNo,
                            invoice_date: inv?.invoice_date || so?.order_date || so?.created_date || con.created_at,
                            customer_code: custCode,
                            customer_name: custName,
                            amount: Number(so?.net_amount || so?.total_amount || inv?.net_amount || inv?.total_amount || 0),
                            remarks: so?.remarks || inv?.remarks || "",
                            fulfillment_status: orderFulfillmentStatus,
                            is_cleared: isCleared,
                            linked_sales_return: linkedSr,
                            items,
                        };
                    })
                    .filter((o): o is NonNullable<typeof o> => o !== null);

                // Calculate consolidator level aggregations
                const totalOrdersCount = childOrders.length;
                const totalItemsCount = childOrders.reduce((sum, o) => sum + o.items.length, 0);
                const totalAmount = childOrders.reduce((sum, o) => sum + o.amount, 0);

                const isAllDelivered = childOrders.length > 0 && childOrders.every((o) => o.is_cleared);
                const hasAnyReturns = childOrders.some((o) => o.fulfillment_status === "Fulfilled with Returns");
                const isAllUnfulfilled = childOrders.length > 0 && childOrders.every((o) => o.fulfillment_status === "Unfulfilled / Returns");

                let conFulfillmentStatus: "Pending" | "Fulfilled" | "Fulfilled with Returns" | "Unfulfilled / Returns" = "Pending";
                if (con.status === "Delivered" || isAllDelivered) {
                    if (isAllUnfulfilled) {
                        conFulfillmentStatus = "Unfulfilled / Returns";
                    } else if (hasAnyReturns) {
                        conFulfillmentStatus = "Fulfilled with Returns";
                    } else {
                        conFulfillmentStatus = "Fulfilled";
                    }
                } else {
                    conFulfillmentStatus = "Pending";
                }

                return {
                    consolidator_id: conId,
                    consolidator_no: con.consolidator_no || `CON-${conId}`,
                    status: con.status || "Dispatched",
                    branch_id: branchId,
                    branch_name: branchName,
                    dispatch_date: con.created_at || new Date().toISOString(),
                    total_orders: totalOrdersCount,
                    total_items: totalItemsCount,
                    total_amount: totalAmount,
                    fulfillment_status: conFulfillmentStatus,
                    is_cleared: con.status === "Delivered" || isAllDelivered,
                    orders: childOrders,
                };
            })
            .filter((r) => r.total_orders > 0 || r.status === "Dispatched" || r.status === "Delivered" || r.status === "Audited");

        // 12. Compute Overall Metrics across entire consolidations dataset
        const totalDispatched = records.length;
        const pendingClearance = records.filter((r) => r.fulfillment_status === "Pending").length;
        const fulfilledCount = records.filter((r) => r.fulfillment_status === "Fulfilled").length;
        const concernsAndReturnsCount = records.filter(
            (r) =>
                r.fulfillment_status === "Fulfilled with Returns" ||
                r.fulfillment_status === "Unfulfilled / Returns"
        ).length;

        // 13. Filter records by search and status
        const filtered = records.filter((r) => {
            const matchesSearch =
                !search ||
                r.consolidator_no.toLowerCase().includes(search) ||
                r.branch_name.toLowerCase().includes(search) ||
                r.orders.some(
                    (o) =>
                        o.order_no.toLowerCase().includes(search) ||
                        o.invoice_no.toLowerCase().includes(search) ||
                        o.customer_name.toLowerCase().includes(search)
                );

            const matchesStatus =
                statusFilter === "All" ||
                (statusFilter === "Pending" && r.fulfillment_status === "Pending") ||
                (statusFilter === "Fulfilled" && r.fulfillment_status === "Fulfilled") ||
                (statusFilter === "Fulfilled with Returns" && r.fulfillment_status === "Fulfilled with Returns") ||
                (statusFilter === "Unfulfilled / Returns" && r.fulfillment_status === "Unfulfilled / Returns") ||
                (statusFilter === "Unfulfilled" && r.fulfillment_status === "Unfulfilled / Returns");

            return matchesSearch && matchesStatus;
        });

        // 14. Paginate
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

// ─── POST: Confirm & Post Delivery Clearance for Consolidation ─────────────────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { consolidator_id, clearance_remarks, orders } = body;

        if (!consolidator_id || !Array.isArray(orders) || orders.length === 0) {
            return NextResponse.json(
                { message: "Invalid payload: consolidator_id and orders array are required." },
                { status: 400 }
            );
        }

        const userId = await getUserIdFromToken();
        const phNow = getPhTimestamp();

        // Process each order in the consolidation
        for (const orderData of orders) {
            const { order_id, invoice_id, items, clearance_remarks: orderRemarks } = orderData;
            if (!items || !Array.isArray(items)) continue;

            const targetOrderId = Number(order_id || invoice_id);

            // Fetch DB details from sales_order_details
            let dbDetails: DirectusSalesOrderDetail[] = [];
            if (targetOrderId) {
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${targetOrderId}&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (sodRes.ok) {
                    dbDetails = (await sodRes.json()).data || [];
                }
            }

            const dbDetailMap = new Map<number, DirectusSalesOrderDetail>(
                dbDetails.map((d) => [Number(d.detail_id), d])
            );

            let totalReceived = 0;
            let totalReturned = 0;
            let totalOrdered = 0;

            for (const item of items) {
                const detailId = Number(item.detail_id);
                const dbItem = dbDetailMap.get(detailId);
                const rec = Number(item.received_quantity);
                const ret = Number(item.returned_quantity);
                const dbOrdered = dbItem ? Number(dbItem.ordered_quantity || 0) : rec + ret;

                if (isNaN(rec) || isNaN(ret) || rec < 0 || ret < 0) {
                    return NextResponse.json(
                        { message: `Quantities for line #${detailId} must be non-negative numbers.` },
                        { status: 422 }
                    );
                }

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
            }

            // Derive order status
            let derivedStatus: "Unfulfilled / Returns" | "Fulfilled with Returns" | "Fulfilled";
            let targetSoStatus: "Delivered" | "Partially Delivered" | "Not Fulfilled";

            if (totalReceived === 0 && totalReturned === totalOrdered) {
                derivedStatus = "Unfulfilled / Returns";
                targetSoStatus = "Not Fulfilled";
            } else if (totalReceived > 0 && totalReturned > 0) {
                derivedStatus = "Fulfilled with Returns";
                targetSoStatus = "Partially Delivered";
            } else if (totalReceived === totalOrdered && totalReturned === 0) {
                derivedStatus = "Fulfilled";
                targetSoStatus = "Delivered";
            } else {
                derivedStatus = "Fulfilled";
                targetSoStatus = "Delivered";
            }

            // Verification Guard: Check for linked Sales Return if status is 'Fulfilled with Returns' or 'Unfulfilled / Returns'
            if (derivedStatus === "Fulfilled with Returns" || derivedStatus === "Unfulfilled / Returns") {
                let invoiceNo = "";
                if (invoice_id) {
                    const invRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice/${invoice_id}?fields=invoice_no`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (invRes.ok) {
                        const invData = (await invRes.json()).data;
                        invoiceNo = invData?.invoice_no ? String(invData.invoice_no).trim() : "";
                    }
                }

                let hasLinkedReturn = false;

                if (invoiceNo) {
                    try {
                        const checkReturnRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_return?filter[invoice_no][_eq]=${encodeURIComponent(invoiceNo)}&limit=1&fields=return_id,return_number,status`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkReturnRes.ok) {
                            const returnData = (await checkReturnRes.json()).data;
                            if (returnData && returnData.length > 0) {
                                hasLinkedReturn = true;
                            }
                        }
                    } catch (e) {
                        console.warn("[fulfilment-and-deliveries POST] Error checking sales_return:", e);
                    }
                }

                if (!hasLinkedReturn && invoice_id) {
                    try {
                        const checkJunctionRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[invoice_no][_eq]=${invoice_id}&limit=1&fields=id`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkJunctionRes.ok) {
                            const junctionData = (await checkJunctionRes.json()).data;
                            if (junctionData && junctionData.length > 0) {
                                hasLinkedReturn = true;
                            }
                        }
                    } catch (e) {
                        console.warn("[fulfilment-and-deliveries POST] Error checking junction:", e);
                    }
                }

                if (!hasLinkedReturn) {
                    return NextResponse.json(
                        {
                            message: `Delivery clearance for "${derivedStatus}" requires a registered Sales Return for invoice/order "${invoiceNo || targetOrderId}". Please create the Sales Return before confirming clearance.`,
                            requiresSalesReturn: true,
                            invoice_no: invoiceNo,
                        },
                        { status: 422 }
                    );
                }
            }

            const isOrderDelivered = targetSoStatus === "Delivered" || targetSoStatus === "Partially Delivered";
            const isOrderUnfulfilled = targetSoStatus === "Not Fulfilled";

            // Update sales order
            if (targetOrderId) {
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
                if (orderRemarks || clearance_remarks) {
                    soPayload.remarks = (orderRemarks || clearance_remarks).trim();
                }

                await fetch(`${DIRECTUS_URL}/items/sales_order/${targetOrderId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify(soPayload),
                }).catch((err) => console.warn(`[POST] Failed to update sales_order #${targetOrderId}:`, err));
            }

            // Update sales invoice if present
            if (invoice_id) {
                const combinedRemarks = orderRemarks || clearance_remarks || "";
                await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoice_id}`, {
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
                }).catch((err) => console.warn(`[POST] Failed to update sales_invoice #${invoice_id}:`, err));
            }

            // Log discrepancy in unfulfilled_sales_transaction if returns exist
            if (totalReturned > 0 || derivedStatus === "Unfulfilled / Returns") {
                try {
                    const unfulfilledRes = await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction`, {
                        method: "POST",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            sales_invoice_id: Number(invoice_id || targetOrderId),
                            nte: orderRemarks || clearance_remarks || `Delivery clearance resolved as: ${derivedStatus}`,
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
                    console.warn("[POST] Error logging unfulfilled transaction:", e);
                }
            }
        }

        // Update consolidator status to Delivered
        await fetch(`${DIRECTUS_URL}/items/consolidator/${consolidator_id}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({
                status: "Delivered",
                updated_at: phNow,
            }),
        }).catch((err) => console.warn(`[POST] Failed to update consolidator #${consolidator_id}:`, err));

        return NextResponse.json({
            success: true,
            message: "Consolidated delivery clearance committed successfully.",
        });
    } catch (error) {
        console.error("[fulfilment-and-deliveries POST] Error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Failed to commit delivery clearance." },
            { status: 500 }
        );
    }
}