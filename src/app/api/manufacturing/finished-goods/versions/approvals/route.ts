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

        // KPI Summaries — only count versions in the approval lifecycle
        let pendingCount = 0;
        let approvedMonthCount = 0;
        let rejectedCount = 0;
        let revisionCount = 0;

        rawVersions.forEach(v => {
            const st = (v.status || "").toLowerCase();
            if (st === "for approval" || st === "pending approval") {
                pendingCount++;
            } else if (st === "approved" || st === "active") {
                approvedMonthCount++;
            } else if (st === "rejected") {
                rejectedCount++;
            } else if (st === "revision required" || st === "revision") {
                revisionCount++;
            }
            // Draft, Archived, Inactive — not counted in any KPI bucket
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
                status: v.status || "Draft",
                rejection_reason: v.rejection_reason || null,
                revision_notes: v.approval_remarks || null,
                base_version_id: null,
                approved_by_name: approvedByName
            };
        });

        // 1. Filter by status
        // When no explicit status filter is provided, default to showing only approval-lifecycle statuses
        // (Draft, Archived, Inactive are excluded from the approvals queue by default)
        const APPROVAL_LIFECYCLE_STATUSES = ["for approval", "pending approval", "approved", "active", "rejected", "revision required", "revision"];
        if (statusParam && statusParam.trim()) {
            const statusFilter = statusParam.trim().toLowerCase();
            const allowedStatuses = statusFilter.split(",").map(s => s.trim());
            enriched = enriched.filter(v => v.status && allowedStatuses.includes(v.status.toLowerCase()));
        } else {
            enriched = enriched.filter(v => v.status && APPROVAL_LIFECYCLE_STATUSES.includes(v.status.toLowerCase()));
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

        // Sort by newest first (DESC)
        enriched.sort((a, b) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (timeB !== timeA) return timeB - timeA;
            return b.version_id - a.version_id;
        });

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
        const { versionId, action, setActive, remarks, rejectionReason, reason, feedback } = body;

        if (!versionId) {
            return NextResponse.json({ error: "Missing required field: versionId" }, { status: 400 });
        }

        // Normalize action key
        const normalizedAction = action === "revision" ? "request_revision" : action;

        if (!normalizedAction || !["approve", "reject", "request_revision"].includes(normalizedAction)) {
            return NextResponse.json({ error: "Invalid action. Must be 'approve', 'reject', or 'request_revision'." }, { status: 400 });
        }

        const numVersionId = Number(versionId);
        if (isNaN(numVersionId)) {
            return NextResponse.json({ error: "Invalid versionId" }, { status: 400 });
        }

        const userId = await getUserIdFromToken();
        
        const phDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const pad = (n: number) => n.toString().padStart(2, '0');
        const phTimeIso = `${phDate.getFullYear()}-${pad(phDate.getMonth() + 1)}-${pad(phDate.getDate())} ${pad(phDate.getHours())}:${pad(phDate.getMinutes())}:${pad(phDate.getSeconds())}`;

        // Fetch current version to verify existence and get product_id
        const verRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${numVersionId}`, { headers, cache: "no-store" });
        if (!verRes.ok) {
            return NextResponse.json({ error: `Version with ID ${numVersionId} not found` }, { status: 404 });
        }
        const currentVersion = (await verRes.json()).data;
        const productId = Number(currentVersion.product_id);

        let updatePayload: Record<string, unknown> = {};

        if (normalizedAction === "approve") {
            const isSetPrimary = setActive !== undefined ? Boolean(setActive) : true;

            if (productId) {
                if (isSetPrimary) {
                    // 1. Clear is_primary on all other versions for this product (guarantees exactly one primary)
                    const getVersionsUrl = `${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${productId}&limit=-1&fields=version_id,is_primary`;
                    const versionsRes = await fetch(getVersionsUrl, { headers, cache: "no-store" });
                    if (versionsRes.ok) {
                        const versionsData = (await versionsRes.json()).data || [];
                        for (const v of versionsData) {
                            if (v.version_id !== numVersionId && (v.is_primary === true || v.is_primary === 1)) {
                                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${v.version_id}`, {
                                    method: "PATCH",
                                    headers,
                                    body: JSON.stringify({ is_primary: false })
                                }).catch(() => {});
                            }
                        }
                    }
                }

                // 2. Automatically ensure product master record is set to Active
                await fetch(`${DIRECTUS_URL}/items/products/${productId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: "Active", isActive: true })
                }).catch(() => {});
            }

            updatePayload = {
                status: "Active",
                is_primary: isSetPrimary,
                approved_by: userId,
                approved_at: phTimeIso,
                updated_by: userId,
                updated_at: phTimeIso,
                approval_remarks: remarks || feedback || null
            };
        } else if (normalizedAction === "reject") {
            const finalReason = rejectionReason || reason || remarks;
            if (!finalReason || !finalReason.trim()) {
                return NextResponse.json({ error: "Rejection reason is required." }, { status: 400 });
            }
            updatePayload = {
                status: "Rejected",
                is_primary: false,
                rejection_reason: finalReason.trim(),
                approved_by: userId,
                approved_at: phTimeIso,
                updated_by: userId,
                updated_at: phTimeIso
            };
        } else if (normalizedAction === "request_revision") {
            updatePayload = {
                status: "Revision",
                is_primary: false,
                approved_by: userId,
                approved_at: phTimeIso,
                updated_by: userId,
                updated_at: phTimeIso
            };
        }

        const patchRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${numVersionId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        if (!patchRes.ok) {
            const errText = await patchRes.text().catch(() => "");
            throw new Error(`Failed to update version status: ${patchRes.status} ${errText}`);
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
