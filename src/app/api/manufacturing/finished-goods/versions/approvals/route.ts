import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusProductVersion {
    version_id: number;
    product_id: number;
    version_name: string;
    base_quantity: number;
    uom_id?: number | null;
    expected_yield_percentage: number;
    custom_overhead?: number | null;
    status: string;
    valid_from?: string | null;
    valid_to?: string | null;
    created_by?: number | null;
    created_at?: string | null;
    approved_by?: number | null;
    approved_at?: string | null;
    approval_remarks?: string | null;
    rejection_reason?: string | null;
}

interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    product_category?: { category_name?: string } | number | string | null;
}

interface DirectusUser {
    user_id: number;
    user_fname?: string | null;
    user_lname?: string | null;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get("status");
        const productIdParam = searchParams.get("productId");
        const searchParam = searchParams.get("search");

        const [verRes, prodRes, usersRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,product_category.category_name`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!verRes.ok) {
            throw new Error(`Directus failed to fetch versions: ${verRes.status}`);
        }

        const verJson = await verRes.json();
        const rawVersions: DirectusProductVersion[] = verJson.data || [];

        const productsMap = new Map<number, { product_name: string; product_code: string; category_name: string }>();
        if (prodRes.ok) {
            const prodJson = await prodRes.json();
            const products: DirectusProduct[] = prodJson.data || [];
            products.forEach(p => {
                let categoryName = "Unassigned";
                if (typeof p.product_category === "object" && p.product_category !== null) {
                    categoryName = p.product_category.category_name || "Unassigned";
                }
                productsMap.set(Number(p.product_id), {
                    product_name: p.product_name || "Unknown Product",
                    product_code: p.product_code || "N/A",
                    category_name: categoryName
                });
            });
        }

        const usersMap = new Map<number, string>();
        if (usersRes && usersRes.ok) {
            const usersJson = await usersRes.json();
            const users: DirectusUser[] = usersJson.data || [];
            users.forEach(u => {
                const fullName = [u.user_fname, u.user_lname].filter(Boolean).join(" ");
                usersMap.set(Number(u.user_id), fullName || `User #${u.user_id}`);
            });
        }

        // KPI Summaries
        let pendingCount = 0;
        let approvedMonthCount = 0;
        let rejectedCount = 0;
        let revisionCount = 0;

        rawVersions.forEach(v => {
            const st = (v.status || "For Approval").toLowerCase();
            if (st === "for approval" || st === "pending approval") {
                pendingCount++;
            } else if (st === "approved" || st === "active") {
                approvedMonthCount++;
            } else if (st === "rejected") {
                rejectedCount++;
            } else if (st === "revision required" || st === "revision") {
                revisionCount++;
            } else {
                pendingCount++;
            }
        });

        let enriched = rawVersions.map(v => {
            const prod = productsMap.get(Number(v.product_id));
            const createdByName = v.created_by ? (usersMap.get(Number(v.created_by)) || `User #${v.created_by}`) : "N/A";
            const approvedByName = v.approved_by ? (usersMap.get(Number(v.approved_by)) || `User #${v.approved_by}`) : null;

            return {
                id: v.version_id,
                version_id: v.version_id,
                product_id: v.product_id,
                product_code: prod?.product_code || "N/A",
                product_name: prod?.product_name || "Unknown Product",
                category: prod?.category_name || "Unassigned",
                version_name: v.version_name || `v${v.version_id}`,
                base_quantity: Number(v.base_quantity || 1),
                expected_yield_percentage: Number(v.expected_yield_percentage || 100),
                created_by: createdByName,
                created_at: v.created_at || new Date().toISOString(),
                status: v.status || "For Approval",
                rejection_reason: v.rejection_reason || null,
                revision_notes: v.approval_remarks || null,
                base_version_id: null,
                approved_by_name: approvedByName
            };
        });

        // 1. Filter by status
        if (statusParam && statusParam.trim()) {
            const statusFilter = statusParam.trim().toLowerCase();
            const allowedStatuses = statusFilter.split(",").map(s => s.trim());
            enriched = enriched.filter(v => v.status && allowedStatuses.includes(v.status.toLowerCase()));
        }

        // 2. Filter by productId
        if (productIdParam && productIdParam.trim()) {
            const pId = Number(productIdParam.trim());
            if (!isNaN(pId)) {
                enriched = enriched.filter(v => Number(v.product_id) === pId);
            }
        }

        // 3. Filter by search term
        if (searchParam && searchParam.trim()) {
            const term = searchParam.trim().toLowerCase();
            enriched = enriched.filter(v =>
                (v.version_name && v.version_name.toLowerCase().includes(term)) ||
                (v.product_name && v.product_name.toLowerCase().includes(term)) ||
                (v.product_code && v.product_code.toLowerCase().includes(term)) ||
                (v.category && v.category.toLowerCase().includes(term)) ||
                (v.created_by && v.created_by.toLowerCase().includes(term))
            );
        }

        return NextResponse.json({
            success: true,
            data: enriched,
            kpi: {
                pendingCount,
                approvedMonthCount,
                rejectedCount,
                revisionCount
            }
        });
    } catch (e) {
        console.error("Error in GET Product Version Approvals:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch version approvals" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { versionId, action, setActive, remarks, rejectionReason } = body;

        if (!versionId) {
            return NextResponse.json({ error: "Missing required field: versionId" }, { status: 400 });
        }
        if (!action || !["approve", "reject", "request_revision"].includes(action)) {
            return NextResponse.json({ error: "Invalid action. Must be 'approve', 'reject', or 'request_revision'." }, { status: 400 });
        }

        const numVersionId = Number(versionId);
        if (isNaN(numVersionId)) {
            return NextResponse.json({ error: "Invalid versionId" }, { status: 400 });
        }

        const userId = await getUserIdFromToken();
        const nowIso = new Date().toISOString();

        // Fetch current version to verify existence and get product_id
        const verRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${numVersionId}`, { headers, cache: "no-store" });
        if (!verRes.ok) {
            return NextResponse.json({ error: `Version with ID ${numVersionId} not found` }, { status: 404 });
        }
        const currentVersion = (await verRes.json()).data;
        const productId = Number(currentVersion.product_id);

        let updatePayload: Record<string, unknown> = {};

        if (action === "approve") {
            const isSetActive = Boolean(setActive);
            const targetStatus = isSetActive ? "Active" : "Approved";

            if (isSetActive && productId) {
                // Set status of all other versions for this product to "Archived"
                const otherVerRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${productId}&limit=-1&fields=version_id`, { headers, cache: "no-store" });
                if (otherVerRes.ok) {
                    const otherVerJson = await otherVerRes.json();
                    const otherVersions = (otherVerJson.data || []).filter((v: { version_id: number }) => Number(v.version_id) !== numVersionId);
                    for (const ov of otherVersions) {
                        await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${ov.version_id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ status: "Archived" })
                        });
                    }
                }
            }

            updatePayload = {
                status: targetStatus,
                approved_by: userId,
                approved_at: nowIso,
                approval_remarks: remarks || null
            };
        } else if (action === "reject") {
            updatePayload = {
                status: "Rejected",
                rejection_reason: rejectionReason || null,
                approved_by: userId,
                approved_at: nowIso
            };
        } else if (action === "request_revision") {
            updatePayload = {
                status: "Revision Required",
                approval_remarks: remarks || null,
                approved_by: userId,
                approved_at: nowIso
            };
        }

        const patchRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${numVersionId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        if (!patchRes.ok) {
            throw new Error(`Failed to update version status: ${patchRes.status}`);
        }

        const patchJson = await patchRes.json();
        return NextResponse.json({
            success: true,
            data: patchJson.data
        });
    } catch (e) {
        console.error("Error in POST Product Version Approvals decision:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to process approval decision" },
            { status: 500 }
        );
    }
}
