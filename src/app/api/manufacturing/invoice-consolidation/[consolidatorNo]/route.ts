import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { resolveVersions } from "../version-resolver";
import { getUserIdFromToken } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let branchesCache: Map<number, { branchName: string; branchCode: string }> | null = null;

async function getBranchesMap(): Promise<Map<number, { branchName: string; branchCode: string }>> {
    if (branchesCache) return branchesCache;
    const res = await fetch(
        `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (res.ok) {
        const data = (await res.json()).data || [];
        branchesCache = new Map(data.map((b: { id: number; branch_name: string; branch_code: string }) => [b.id, { branchName: b.branch_name, branchCode: b.branch_code }]));
    } else {
        branchesCache = new Map();
    }
    return branchesCache;
}

interface InvoiceProduct {
    productId: number;
    productName: string;
    productCode: string;
    quantity: number;
    versionId: number | null;
    versionName: string | null;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ consolidatorNo: string }> }
) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { consolidatorNo } = await params;
        const escNo = encodeURIComponent(consolidatorNo);

        const res = await fetch(
            `${DIRECTUS_URL}/items/consolidator?filter[consolidator_no][_eq]=${escNo}&filter[is_delete][_eq]=0&limit=1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!res.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${res.status})` }, { status: res.status });
        }

        const json = await res.json();
        const items = json.data || [];
        if (items.length === 0) {
            return NextResponse.json({ message: "Consolidation not found" }, { status: 404 });
        }

        const c = items[0];

        const [invRes, detRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${c.id}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${c.id}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ),
        ]);

        if (!invRes.ok || !detRes.ok) {
            return NextResponse.json({ message: "Failed to load batch details" }, { status: 502 });
        }

        const invJunctions: Array<{ id: number; consolidator_id: number; invoice_id: number; created_at: string }> = (await invRes.json()).data || [];
        const detJunctions: Array<{ id: number; consolidator_id: number; product_id: number; ordered_quantity: number; picked_quantity: number; applied_quantity: number; picked_by: number | null; picked_at: string | null }> = (await detRes.json()).data || [];

        const invoiceIds = invJunctions.map((j) => Number(j.invoice_id)).filter(Boolean);
        let salesOrderMap = new Map<number, { order_id: number; order_no: string; branch_id: number; total_amount: number; net_amount: number; customer_code: string; created_date: string }>();
        let soDetailsRaw: Array<{ detail_id: number; order_id: number; product_id: number; bom_version_id?: number | null; ordered_quantity: number }> = [];

        if (invoiceIds.length > 0) {
            const [soRes, sodRes] = await Promise.all([
                fetch(
                    `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${invoiceIds.join(",")}&fields=order_id,order_no,branch_id,total_amount,net_amount,customer_code,created_date&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
                fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id,order_id,product_id,bom_version_id,ordered_quantity&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ),
            ]);

            if (soRes.ok) {
                const soData = (await soRes.json()).data || [];
                salesOrderMap = new Map(soData.map((s: { order_id: number; order_no: string; branch_id: number; total_amount: number; net_amount: number; customer_code: string; created_date: string }) => [s.order_id, s]));
            }
            if (sodRes.ok) {
                soDetailsRaw = (await sodRes.json()).data || [];
            }
        }

        // Load customer names
        const customerCodes = [...new Set(Array.from(salesOrderMap.values()).map((s) => s.customer_code).filter(Boolean))];
        let customerMap = new Map<string, { id: number; customer_name: string }>();
        if (customerCodes.length > 0) {
            const custRes = await fetch(
                `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${customerCodes.map((c) => encodeURIComponent(c)).join(",")}&limit=-1&fields=id,customer_code,customer_name`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (custRes.ok) {
                const custData = (await custRes.json()).data || [];
                customerMap = new Map(custData.map((c: { id: number; customer_code: string; customer_name: string }) => [c.customer_code, { id: c.id, customer_name: c.customer_name }]));
            }
        }

        const productIds = [
            ...new Set([
                ...detJunctions.map((d) => d.product_id),
                ...soDetailsRaw.map((d) => d.product_id),
            ].filter(Boolean)),
        ];

        interface ProductPrintDetails {
            product_name: string;
            product_code: string;
            product_brand?: { brand_name?: string } | null;
            product_category?: { category_name?: string } | null;
            unit_of_measurement?: { unit_shortcut?: string; unit_name?: string } | null;
        }
        let productMap = new Map<number, ProductPrintDetails>();
        if (productIds.length > 0) {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code,product_brand.brand_name,product_category.category_name,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (prodRes.ok) {
                const prodData = (await prodRes.json()).data || [];
                productMap = new Map(prodData.map((p: ProductPrintDetails & { product_id: number }) => [p.product_id, p]));
            }
        }

        // BOM Version lookup
        const allVersionIds = [...new Set(soDetailsRaw.map((d) => Number(d.bom_version_id)).filter(Boolean))];
        const versionTitleMap = new Map<number, string>();
        if (allVersionIds.length > 0) {
            const verRes = await fetch(
                `${DIRECTUS_URL}/items/product_manufacturing_version?filter[version_id][_in]=${allVersionIds.join(",")}&fields=version_id,version_name,version_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null);
            if (verRes && verRes.ok) {
                const verData = (await verRes.json()).data || [];
                for (const v of verData) {
                    versionTitleMap.set(Number(v.version_id), v.version_name || v.version_code || `v${v.version_id}`);
                }
            }
        }

        // Build unique customer-product pairs for automatic BOM version resolution
        const versionPairs: { customerId: number; productId: number }[] = [];
        for (const so of Array.from(salesOrderMap.values())) {
            const cust = customerMap.get(so.customer_code);
            if (!cust) continue;
            const soDetails = soDetailsRaw.filter((d) => d.order_id === so.order_id);
            for (const d of soDetails) {
                versionPairs.push({ customerId: cust.id, productId: d.product_id });
            }
        }
        const resolvedVersionMap = await resolveVersions(versionPairs);

        // Aggregate Sales Order products by order_id
        const soProductsMap = new Map<number, InvoiceProduct[]>();
        for (const d of soDetailsRaw) {
            const oId = d.order_id;
            if (!soProductsMap.has(oId)) soProductsMap.set(oId, []);
            const list = soProductsMap.get(oId)!;
            const existing = list.find((p) => p.productId === d.product_id);
            const qty = Number(d.ordered_quantity || 0);
            if (existing) {
                existing.quantity += qty;
            } else {
                const so = salesOrderMap.get(oId);
                const cust = so ? customerMap.get(so.customer_code) : undefined;
                const versionKey = cust ? `${cust.id}:${d.product_id}` : "";
                const autoVersion = resolvedVersionMap.get(versionKey);
                const explicitVersionId = Number(d.bom_version_id || 0);
                const finalVersionId = explicitVersionId || autoVersion?.versionId || null;
                const finalVersionName = explicitVersionId
                    ? (versionTitleMap.get(explicitVersionId) || `v${explicitVersionId}`)
                    : (autoVersion?.versionName || null);

                const prod = productMap.get(d.product_id);
                list.push({
                    productId: d.product_id,
                    productName: prod?.product_name || `Product #${d.product_id}`,
                    productCode: prod?.product_code || "",
                    quantity: qty,
                    versionId: finalVersionId,
                    versionName: finalVersionName,
                });
            }
        }

        const invoices = invJunctions
            .filter((j) => j.invoice_id !== null)
            .map((j) => {
                const so = salesOrderMap.get(j.invoice_id);
                const cust = so ? customerMap.get(so.customer_code) : undefined;
                return {
                    id: j.id,
                    consolidatorId: j.consolidator_id,
                    invoiceId: j.invoice_id,
                    invoiceNo: so?.order_no || `#${j.invoice_id}`,
                    branchId: so?.branch_id ?? c.branch_id,
                    customerName: cust?.customer_name || so?.customer_code || "Standard Fulfillment",
                    createdAt: so?.created_date || j.created_at,
                    products: soProductsMap.get(j.invoice_id) || [],
                };
            });

        const details = detJunctions.map((d) => {
            const prod = productMap.get(d.product_id);
            return {
                id: d.id,
                consolidatorId: d.consolidator_id,
                productId: d.product_id,
                productName: prod?.product_name || `Product #${d.product_id}`,
                productCode: prod?.product_code || "",
                brand: prod?.product_brand?.brand_name || "Unbranded",
                category: prod?.product_category?.category_name || "Uncategorized",
                unit: prod?.unit_of_measurement?.unit_shortcut || prod?.unit_of_measurement?.unit_name || "-",
                orderedQuantity: Number(d.ordered_quantity || 0),
                pickedQuantity: Number(d.picked_quantity || 0),
                appliedQuantity: Number(d.applied_quantity || 0),
                pickedById: d.picked_by,
                pickedAt: d.picked_at,
            };
        });

        const totalAmount = invoices.reduce((sum: number, inv) => {
            const so = salesOrderMap.get(inv.invoiceId);
            return sum + (so ? Number(so.net_amount || so.total_amount || 0) : 0);
        }, 0);

        const branchMap = await getBranchesMap();
        return NextResponse.json({
            id: c.id,
            consolidatorNo: c.consolidator_no,
            status: c.status || "Pending",
            createdBy: c.created_by,
            checkedBy: c.checked_by,
            branchId: c.branch_id,
            branchName: branchMap.get(c.branch_id)?.branchName || `Branch #${c.branch_id}`,
            totalSalesOrderAmount: totalAmount,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
            details,
            dispatches: [],
            invoices,
        });
    } catch (e) {
        console.error("invoice-consolidation byNo GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
