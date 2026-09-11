import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        
        const page = parseInt(searchParams.get("page") || "1");
        const size = parseInt(searchParams.get("size") || "25");
        const sortField = searchParams.get("sortField") || "encodedDate";
        const sortDir = searchParams.get("sortDir") || "desc";
        const search = searchParams.get("search") || "";
        const statusFilter = searchParams.get("status") || "all";
        const collectorFilter = searchParams.get("collector") || "all";

        const directusParams = new URLSearchParams();
        directusParams.append("page", String(page));
        directusParams.append("limit", String(size));
        directusParams.append("meta", "filter_count");

        // Map frontend sort fields to Directus schema
        const fieldMap: Record<string, string> = {
            encodedDate: "date_encoded",
            docNo: "docNo",
            collectionDate: "collection_date",
            pouchAmount: "totalAmount",
            salesmanName: "salesman_id.salesman_name",
            discrepancy: "totalAmount"
        };
        const mappedSortField = fieldMap[sortField] || sortField;
        directusParams.append("sort", `${sortDir === "desc" ? "-" : ""}${mappedSortField}`);
        
        // Build Directus filter query
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const directusFilters: any = {};
        if (search) {
            directusFilters._or = [
                { docNo: { _icontains: search } },
                { collection_receipt_no: { _icontains: search } }
            ];
        }

        if (collectorFilter && collectorFilter !== "all") {
            const parts = collectorFilter.split(" ");
            const firstPart = parts[0];
            try {
                const userUrl = `${DIRECTUS_URL}/items/user?filter[_or][0][user_fname][_icontains]=${encodeURIComponent(firstPart)}&filter[_or][1][first_name][_icontains]=${encodeURIComponent(firstPart)}`;
                const userRes = await fetch(userUrl, { headers, cache: "no-store" });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    const matchingUserIds = (userData.data || []).map((u: Record<string, unknown>) => u.user_id || u.id);
                    if (matchingUserIds.length > 0) {
                        directusFilters.collected_by = { _in: matchingUserIds };
                    } else {
                        directusFilters.collected_by = { _in: [-1] };
                    }
                }
            } catch (err) {
                console.warn("Failed to resolve collector filter user IDs:", err);
            }
        }

        if (statusFilter && statusFilter !== "all") {
            if (statusFilter.toUpperCase() === "POSTED") {
                directusFilters.isPosted = { _eq: 1 };
            } else if (statusFilter.toUpperCase() === "CANCELLED") {
                directusFilters.isCancelled = { _eq: 1 };
            } else {
                // For "Pending", "In Progress", "Balanced", pouch must not be posted or cancelled
                directusFilters._and = directusFilters._and || [];
                directusFilters._and.push({ isPosted: { _neq: 1 } });
                directusFilters._and.push({ isCancelled: { _neq: 1 } });
            }
        }

        if (Object.keys(directusFilters).length > 0) {
            directusParams.append("filter", JSON.stringify(directusFilters));
        }
        
        directusParams.append("fields", "*.*");
        const url = `${DIRECTUS_URL}/items/collection?${directusParams.toString()}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const items = data.data || [];

        // Fetch collection_invoices and linked sales_invoices to compute allocated amounts, total invoice amount, and variance
        const collectionIds = items.map((item: { id?: number }) => item.id).filter(Boolean);
        const allocatedInvoicesMap = new Map<number, number>();
        const invoiceAmountMap = new Map<number, number>();

        if (collectionIds.length > 0) {
            try {
                const invRes = await fetch(`${DIRECTUS_URL}/items/collection_invoices?filter[collection_id][_in]=${collectionIds.join(",")}&limit=-1&fields=collection_id,invoice_id,amount`, { headers, cache: "no-store" });
                if (invRes.ok) {
                    const invData = (await invRes.json()).data || [];
                    const invoiceIds = [...new Set(invData.map((inv: { invoice_id?: number }) => inv.invoice_id).filter(Boolean))];

                    const salesInvoiceMap = new Map<number, number>();
                    if (invoiceIds.length > 0) {
                        const siRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${invoiceIds.join(",")}&limit=-1&fields=invoice_id,net_amount,total_amount,gross_amount,remaining_balance`, { headers, cache: "no-store" });
                        if (siRes.ok) {
                            const siData = (await siRes.json()).data || [];
                            siData.forEach((si: { invoice_id: number; net_amount?: number; total_amount?: number; gross_amount?: number; remaining_balance?: number }) => {
                                const val = Number(si.net_amount ?? si.total_amount ?? si.gross_amount ?? 0) || 0;
                                salesInvoiceMap.set(si.invoice_id, val);
                            });
                        }
                    }

                    invData.forEach((inv: { collection_id: number; invoice_id?: number; amount?: number }) => {
                        const amt = Math.abs(Number(inv.amount) || 0);
                        allocatedInvoicesMap.set(inv.collection_id, (allocatedInvoicesMap.get(inv.collection_id) || 0) + amt);

                        if (inv.invoice_id && salesInvoiceMap.has(inv.invoice_id)) {
                            const invVal = salesInvoiceMap.get(inv.invoice_id) || 0;
                            // Add unique invoice value to pouch total invoice amount
                            invoiceAmountMap.set(inv.collection_id, (invoiceAmountMap.get(inv.collection_id) || 0) + invVal);
                        }
                    });
                }
            } catch (err) {
                console.warn("Failed to fetch collection_invoices for queue:", err);
            }
        }
        
        // Fetch collection_details (cash pool, checks, adjustments, shortage credits) to compute total liquid pool and unallocated pouch pool
        const pouchDetailsMap = new Map<number, number>();
        if (collectionIds.length > 0) {
            try {
                const detRes = await fetch(`${DIRECTUS_URL}/items/collection_details?filter[collection_id][_in]=${collectionIds.join(",")}&limit=-1&fields=collection_id,amount`, { headers, cache: "no-store" });
                if (detRes.ok) {
                    const detData = (await detRes.json()).data || [];
                    detData.forEach((det: { collection_id: number; amount?: number }) => {
                        const amt = Math.abs(Number(det.amount) || 0);
                        pouchDetailsMap.set(det.collection_id, (pouchDetailsMap.get(det.collection_id) || 0) + amt);
                    });
                }
            } catch (err) {
                console.warn("Failed to fetch collection_details for queue:", err);
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedItems = items.map((item: any) => {
            const rawPouchAmount = Number(item.totalAmount) || 0;
            // Total liquid pool is either sum of collection_details (cash + checks + adjustments) or totalAmount header
            const detailsTotal = pouchDetailsMap.get(item.id) || 0;
            const totalLiquidPool = Math.max(rawPouchAmount, detailsTotal);

            const appliedAmount = allocatedInvoicesMap.get(item.id) || 0;
            const invoiceAmount = invoiceAmountMap.get(item.id) || appliedAmount;
            
            // Unallocated funds remaining in the liquid pouch pool
            const unallocatedPouch = Math.round((totalLiquidPool - appliedAmount) * 100) / 100;
            // Variance = Invoice Amount - Applied Amount
            const variance = Math.round((invoiceAmount - appliedAmount) * 100) / 100;

            const isPosted = item.isPosted === true || item.isPosted === 1 || item.isPosted === "1";
            const isCancelled = item.isCancelled === true || item.isCancelled === 1 || item.isCancelled === "1";

            let status = "In Progress";
            if (isPosted) {
                status = "POSTED";
            } else if (isCancelled) {
                status = "CANCELLED";
            } else if (Math.abs(unallocatedPouch) <= 0.01 && Math.abs(variance) <= 0.01 && (appliedAmount > 0 || totalLiquidPool === 0)) {
                status = "Balanced";
            } else if (appliedAmount === 0 && totalLiquidPool === 0) {
                status = "Pending";
            }

            return {
                ...item,
                id: item.id,
                docNo: item.docNo || item.doc_no,
                collectionDate: item.collection_date,
                encodedDate: item.date_encoded,
                pouchAmount: totalLiquidPool,
                invoiceAmount: invoiceAmount,
                appliedAmount: appliedAmount,
                variance: variance,
                discrepancy: Math.max(0, unallocatedPouch),
                status: status,
                salesmanName: item.salesman_id?.salesman_name || "UNASSIGNED",
                collectedByName: item.collected_by ? `${item.collected_by.user_fname || item.collected_by.first_name || ""} ${item.collected_by.user_lname || item.collected_by.last_name || ""}`.trim() : "ENCODER FALLBACK",
                encoderName: item.encoder_id ? `${item.encoder_id.user_fname || item.encoder_id.first_name || ""} ${item.encoder_id.user_lname || item.encoder_id.last_name || ""}`.trim() : "ENCODER FALLBACK"
            };
        });
        
        const totalElements = data.meta?.filter_count || mappedItems.length;
        const totalPages = Math.ceil(totalElements / size);

        return NextResponse.json({
            content: mappedItems,
            totalElements,
            totalPages,
            currentPage: page,
            size
        });
    } catch (e) {
        console.error("API Error fetching settlement queue:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
