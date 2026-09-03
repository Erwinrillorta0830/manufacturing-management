import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../../directus-api";
import { getUserIdFromToken } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConsolidatorRow {
    id: number;
    consolidator_no: string;
    status: string | null;
    created_at: string;
    updated_at: string;
}

interface DetailRow {
    consolidator_id: number;
    product_id: number;
    ordered_quantity: number | string | null;
    picked_quantity: number | string | null;
}

interface InvoiceRow {
    consolidator_id: number;
}

interface ProductRow {
    product_id: number;
    product_name: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
    if (!DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

async function readDirectus<T>(path: string): Promise<T[]> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
        headers: directusHeaders,
        cache: "no-store",
    });
    if (!response.ok) {
        throw new Error(`Directus request failed (HTTP ${response.status})`);
    }
    const payload = await response.json();
    return payload.data || [];
}

export async function GET(request: NextRequest) {
    const userId = await getUserIdFromToken();
    if (!userId || isNaN(userId)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const branchId = Number(searchParams.get("branchId"));
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!Number.isInteger(branchId) || branchId <= 0) {
        return NextResponse.json({ message: "branchId must be a positive integer" }, { status: 400 });
    }
    if (startDate && !isValidDate(startDate)) {
        return NextResponse.json({ message: "startDate must use YYYY-MM-DD format" }, { status: 400 });
    }
    if (endDate && !isValidDate(endDate)) {
        return NextResponse.json({ message: "endDate must use YYYY-MM-DD format" }, { status: 400 });
    }
    if (startDate && endDate && startDate > endDate) {
        return NextResponse.json({ message: "startDate cannot be after endDate" }, { status: 400 });
    }

    try {
        const query = new URLSearchParams();
        query.set("filter[is_delete][_eq]", "0");
        query.set("filter[branch_id][_eq]", String(branchId));
        if (startDate) query.set("filter[created_at][_gte]", `${startDate}T00:00:00.000`);
        if (endDate) query.set("filter[created_at][_lte]", `${endDate}T23:59:59.999`);
        query.set("fields", "id,consolidator_no,status,created_at,updated_at");
        query.set("sort", "-created_at");
        query.set("limit", "-1");

        const consolidators = await readDirectus<ConsolidatorRow>(
            `/items/consolidator?${query.toString()}`,
        );
        const consolidatorIds = consolidators.map((item) => Number(item.id));

        let details: DetailRow[] = [];
        let invoices: InvoiceRow[] = [];
        if (consolidatorIds.length > 0) {
            const idFilter = consolidatorIds.join(",");
            [details, invoices] = await Promise.all([
                readDirectus<DetailRow>(
                    `/items/consolidator_details?filter[consolidator_id][_in]=${idFilter}&fields=consolidator_id,product_id,ordered_quantity,picked_quantity&limit=-1`,
                ),
                readDirectus<InvoiceRow>(
                    `/items/consolidator_invoices?filter[consolidator_id][_in]=${idFilter}&fields=consolidator_id&limit=-1`,
                ),
            ]);
        }

        const productIds = [...new Set(details.map((detail) => Number(detail.product_id)))];
        let products: ProductRow[] = [];
        if (productIds.length > 0) {
            products = await readDirectus<ProductRow>(
                `/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name&limit=-1`,
            );
        }

        const detailsByBatch = new Map<number, DetailRow[]>();
        for (const detail of details) {
            const consolidatorId = Number(detail.consolidator_id);
            const batchDetails = detailsByBatch.get(consolidatorId) || [];
            batchDetails.push(detail);
            detailsByBatch.set(consolidatorId, batchDetails);
        }

        const invoiceCountByBatch = new Map<number, number>();
        for (const invoice of invoices) {
            const consolidatorId = Number(invoice.consolidator_id);
            invoiceCountByBatch.set(consolidatorId, (invoiceCountByBatch.get(consolidatorId) || 0) + 1);
        }

        const status = { All: consolidators.length, Pending: 0, Picking: 0, Picked: 0, Audited: 0 };
        let ordered = 0;
        let picked = 0;
        let remaining = 0;
        let completedShort = 0;
        let discrepancyBatches = 0;
        const productTotals = new Map<number, { ordered: number; picked: number }>();

        for (const consolidator of consolidators) {
            const batchStatus = consolidator.status || "Pending";
            if (batchStatus === "Picking" || batchStatus === "Picked" || batchStatus === "Audited") {
                status[batchStatus] += 1;
            } else {
                status.Pending += 1;
            }

            const batchDetails = detailsByBatch.get(Number(consolidator.id)) || [];
            let hasDiscrepancy = false;
            for (const detail of batchDetails) {
                const detailOrdered = Number(detail.ordered_quantity || 0);
                const detailPicked = Number(detail.picked_quantity || 0);
                const detailRemaining = Math.max(detailOrdered - detailPicked, 0);
                ordered += detailOrdered;
                picked += detailPicked;
                remaining += detailRemaining;

                const productId = Number(detail.product_id);
                const totals = productTotals.get(productId) || { ordered: 0, picked: 0 };
                totals.ordered += detailOrdered;
                totals.picked += detailPicked;
                productTotals.set(productId, totals);

                if ((batchStatus === "Picked" || batchStatus === "Audited") && detailPicked < detailOrdered) {
                    hasDiscrepancy = true;
                    completedShort += detailOrdered - detailPicked;
                }
            }
            if (hasDiscrepancy) discrepancyBatches += 1;
        }

        const productNameById = new Map(
            products.map((product) => [Number(product.product_id), product.product_name || `Product #${product.product_id}`]),
        );
        const topProducts = [...productTotals.entries()]
            .map(([productId, totals]) => ({
                productId,
                productName: productNameById.get(productId) || `Product #${productId}`,
                ordered: totals.ordered,
                picked: totals.picked,
                remaining: Math.max(totals.ordered - totals.picked, 0),
            }))
            .sort((a, b) => b.ordered - a.ordered || a.productName.localeCompare(b.productName))
            .slice(0, 5);

        const batches = consolidators.map((consolidator) => {
            const batchDetails = detailsByBatch.get(Number(consolidator.id)) || [];
            const batchOrdered = batchDetails.reduce(
                (sum, detail) => sum + Number(detail.ordered_quantity || 0),
                0,
            );
            const batchPicked = batchDetails.reduce(
                (sum, detail) => sum + Number(detail.picked_quantity || 0),
                0,
            );
            return {
                id: Number(consolidator.id),
                consolidatorNo: consolidator.consolidator_no,
                status: consolidator.status || "Pending",
                createdAt: consolidator.created_at,
                invoiceCount: invoiceCountByBatch.get(Number(consolidator.id)) || 0,
                productCount: new Set(batchDetails.map((detail) => Number(detail.product_id))).size,
                ordered: batchOrdered,
                picked: batchPicked,
                remaining: Math.max(batchOrdered - batchPicked, 0),
            };
        });

        return NextResponse.json({
            status,
            totalInvoices: invoices.length,
            uniqueProducts: productTotals.size,
            quantities: {
                ordered,
                picked,
                remaining,
                completedShort,
                fulfillmentRate: ordered > 0 ? (picked / ordered) * 100 : 0,
            },
            discrepancyBatches,
            topProducts,
            batches,
        });
    } catch (error) {
        console.error("invoice-consolidation dashboard summary GET error:", error);
        return NextResponse.json({ message: "Failed to load consolidation dashboard data" }, { status: 502 });
    }
}
