import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
import { productUpdateAuditFields } from "@/app/api/manufacturing/product-audit";
import { applyApprovedDraft, rejectDraft } from "../drafts/drafts-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusProductVersion {
    version_id: number;
    product_id: number;
    version_name: string;
    base_quantity: number;
    uom_id?: { unit_shortcut?: string; unit_name?: string } | number | string | null;
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
    remarks?: string | null;
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

interface DirectusDraftItem {
    draft_id: number;
    product_id: number;
    source_version_id?: number | null;
    version_name: string;
    base_quantity?: number;
    expected_yield_percentage?: number;
    status: string;
    created_by?: number | null;
    created_at?: string;
    submitted_at?: string;
    reviewed_by?: number | null;
    reviewed_at?: string;
    remarks?: string | null;
    cancellation_reason?: string | null;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get("status");
        const productIdParam = searchParams.get("productId");
        const searchParam = searchParams.get("search");

        // Fetch versions, pending drafts, products, and users in parallel
        const [verRes, draftRes, prodRes, usersRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=version_id,product_id,version_name,base_quantity,uom_id.unit_shortcut,uom_id.unit_name,expected_yield_percentage,custom_overhead,status,valid_from,valid_to,created_by,created_at,approved_by,approved_at,remarks`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft?filter[status][_in]=Pending Approval,Draft,Applied,Rejected&limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,product_category.category_name`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!verRes.ok) {
            throw new Error(`Directus failed to fetch versions: ${verRes.status}`);
        }

        const verJson = await verRes.json();
        const rawVersions: DirectusProductVersion[] = verJson.data || [];

        const rawDrafts: DirectusDraftItem[] = draftRes && draftRes.ok ? ((await draftRes.json()).data || []) : [];

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

        // KPI Summaries — count versions and pending drafts in the approval lifecycle
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
        });

        // Add drafts to KPI counts
        rawDrafts.forEach(d => {
            const st = (d.status || "").toLowerCase();
            if (st === "pending approval") {
                pendingCount++;
            } else if (st === "applied") {
                // Draft was applied to an approved version
            } else if (st === "rejected") {
                rejectedCount++;
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
                uom: (typeof v.uom_id === "object" && v.uom_id) ? (v.uom_id.unit_shortcut || v.uom_id.unit_name || "Unknown") : "pcs",
                expected_yield_percentage: Number(v.expected_yield_percentage || 100),
                created_by: createdByName,
                created_at: v.created_at || new Date().toISOString(),
                status: v.status || "Draft",
                rejection_reason: v.remarks || v.rejection_reason || null,
                revision_notes: v.remarks || v.approval_remarks || null,
                remarks: v.remarks || null,
                base_version_id: null as number | null,
                approved_by_name: approvedByName,
                is_draft: false,
                draft_id: null as number | null
            };
        });

        // Enrich and include drafts in the queue
        const enrichedDrafts = rawDrafts.map(d => {
            const prod = productsMap.get(Number(d.product_id));
            const createdByName = d.created_by ? (usersMap.get(Number(d.created_by)) || `User #${d.created_by}`) : "N/A";
            const reviewedByName = d.reviewed_by ? (usersMap.get(Number(d.reviewed_by)) || `User #${d.reviewed_by}`) : null;

            return {
                id: d.draft_id,
                version_id: d.draft_id, // for component compatibility
                draft_id: d.draft_id,
                product_id: d.product_id,
                product_code: prod?.product_code || "N/A",
                product_name: prod?.product_name || "Unknown Product",
                category: prod?.category_name || "Unassigned",
                version_name: `${d.version_name} (Draft)`,
                base_quantity: Number(d.base_quantity || 1),
                uom: "pcs",
                expected_yield_percentage: Number(d.expected_yield_percentage || 100),
                created_by: createdByName,
                created_at: d.submitted_at || d.created_at || new Date().toISOString(),
                status: d.status,
                rejection_reason: d.remarks || null,
                revision_notes: d.cancellation_reason || null,
                remarks: d.remarks || null,
                base_version_id: d.source_version_id || null,
                approved_by_name: reviewedByName,
                is_draft: true
            };
        });

        enriched = [...enriched, ...enrichedDrafts];

        // 1. Filter by status
        // When no explicit status filter is provided, default to showing only approval-lifecycle statuses
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
        const { versionId, draftId, isDraft, action, setActive, remarks, rejectionReason, reason, feedback } = body;

        const targetId = Number(draftId || versionId);
        if (!targetId || isNaN(targetId)) {
            return NextResponse.json({ error: "Missing required field: versionId or draftId" }, { status: 400 });
        }

        // Normalize action key
        const normalizedAction = action === "revision" ? "request_revision" : action;

        if (!normalizedAction || !["approve", "reject", "request_revision"].includes(normalizedAction)) {
            return NextResponse.json({ error: "Invalid action. Must be 'approve', 'reject', or 'request_revision'." }, { status: 400 });
        }

        if (normalizedAction === "request_revision" && (!remarks || !remarks.trim())) {
            return NextResponse.json({ error: "Remarks are required to request a revision." }, { status: 400 });
        }

        const userId = await getUserIdFromToken();
        
        const phDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const pad = (n: number) => n.toString().padStart(2, '0');
        const phTimeIso = `${phDate.getFullYear()}-${pad(phDate.getMonth() + 1)}-${pad(phDate.getDate())} ${pad(phDate.getHours())}:${pad(phDate.getMinutes())}:${pad(phDate.getSeconds())}`;

        // Check if this is a draft in product_manufacturing_version_draft
        let isDraftTarget = Boolean(isDraft || draftId);
        let draftRecord: Record<string, unknown> | null = null;

        if (!isDraftTarget) {
            const checkDraftRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${targetId}`, { headers, cache: "no-store" });
            if (checkDraftRes.ok) {
                draftRecord = (await checkDraftRes.json()).data;
                if (draftRecord && (draftRecord as { status?: string }).status === "Pending Approval") {
                    isDraftTarget = true;
                }
            }
        } else {
            const checkDraftRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${targetId}`, { headers, cache: "no-store" });
            if (checkDraftRes.ok) {
                draftRecord = (await checkDraftRes.json()).data;
            }
        }

        // --- PATH A: DRAFT PROMOTION / REJECTION ---
        if (isDraftTarget && draftRecord) {
            if (normalizedAction === "approve") {
                const applyRes = await applyApprovedDraft(targetId, userId, phTimeIso);
                if (!applyRes.success) {
                    return NextResponse.json({ error: applyRes.error || "Failed to promote approved draft revision to production." }, { status: 422 });
                }

                // Ensure parent product is active
                if (draftRecord.product_id) {
                    await fetch(`${DIRECTUS_URL}/items/products/${draftRecord.product_id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({
                            status: "Active",
                            isActive: true,
                            ...productUpdateAuditFields(userId)
                        })
                    }).catch(() => {});
                }

                return NextResponse.json({
                    success: true,
                    newVersionId: applyRes.newVersionId,
                    data: {
                        version_id: applyRes.newVersionId,
                        product_id: draftRecord.product_id,
                        status: "Active",
                        is_primary: true
                    }
                });
            } else if (normalizedAction === "reject") {
                const finalReason = rejectionReason || reason || remarks;
                if (!finalReason || !finalReason.trim()) {
                    return NextResponse.json({ error: "Rejection reason is required." }, { status: 400 });
                }
                const rejRes = await rejectDraft(targetId, userId, finalReason.trim(), phTimeIso);
                if (!rejRes.success) {
                    return NextResponse.json({ error: rejRes.error || "Failed to reject draft" }, { status: 422 });
                }
                return NextResponse.json({ success: true, message: "Draft rejected successfully" });
            } else if (normalizedAction === "request_revision") {
                // Return draft to 'Draft' status so the engineer can edit and fix
                await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version_draft/${targetId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        status: "Draft",
                        remarks: remarks.trim(),
                        reviewed_by: userId || null,
                        reviewed_at: phTimeIso
                    })
                });
                return NextResponse.json({ success: true, message: "Draft returned to revision status" });
            }
        }

        // --- PATH B: LEGACY PRODUCTION VERSION (BACKWARD COMPATIBILITY ONLY) ---
        const verRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${targetId}`, { headers, cache: "no-store" });
        if (!verRes.ok) {
            return NextResponse.json({ error: `Version with ID ${targetId} not found` }, { status: 404 });
        }
        const currentVersion = (await verRes.json()).data;
        const productId = Number(currentVersion.product_id);

        let updatePayload: Record<string, unknown> = {};

        if (normalizedAction === "approve") {
            const isSetPrimary = setActive !== undefined ? Boolean(setActive) : true;

            if (productId && isSetPrimary) {
                const getVersionsUrl = `${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_eq]=${productId}&limit=-1&fields=version_id,is_primary`;
                const versionsRes = await fetch(getVersionsUrl, { headers, cache: "no-store" });
                if (versionsRes.ok) {
                    const versionsData = (await versionsRes.json()).data || [];
                    for (const v of versionsData) {
                        if (v.version_id !== targetId && (v.is_primary === true || v.is_primary === 1)) {
                            await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${v.version_id}`, {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify({ is_primary: false })
                            }).catch(() => {});
                        }
                    }
                }
            }

            updatePayload = {
                status: "Active",
                is_primary: isSetPrimary,
                approved_by: userId,
                approved_at: phTimeIso,
                updated_by: userId,
                updated_at: phTimeIso,
                remarks: remarks || feedback || null
            };
        } else if (normalizedAction === "reject") {
            const finalReason = rejectionReason || reason || remarks;
            if (!finalReason || !finalReason.trim()) {
                return NextResponse.json({ error: "Rejection reason is required." }, { status: 400 });
            }
            updatePayload = {
                status: "Rejected",
                is_primary: false,
                remarks: finalReason.trim(),
                updated_by: userId,
                updated_at: phTimeIso
            };
        } else if (normalizedAction === "request_revision") {
            updatePayload = {
                status: "Revision",
                is_primary: false,
                remarks: remarks.trim(),
                updated_by: userId,
                updated_at: phTimeIso
            };
        }

        const patchRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${targetId}`, {
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
