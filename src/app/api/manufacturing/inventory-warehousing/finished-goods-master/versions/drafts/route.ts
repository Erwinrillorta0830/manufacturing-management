import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
import {
    getDraftById,
    getActiveDraftsForProduct,
    getActiveDraftForVersion,
    createDraft,
    saveDraftDetails,
    cancelDraft,
    submitDraftForApproval,
    reopenDraftForEditing
} from "./drafts-helper";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const draftIdStr = searchParams.get("draftId");
        const productIdStr = searchParams.get("productId");
        const versionIdStr = searchParams.get("versionId");
        const isDiffView = searchParams.get("diff") === "true";

        if (draftIdStr) {
            const draftId = parseInt(draftIdStr, 10);
            if (isNaN(draftId) || draftId <= 0) {
                return NextResponse.json({ error: "Invalid draftId" }, { status: 400 });
            }
            const draft = await getDraftById(draftId, { includeDeleted: isDiffView });
            return NextResponse.json({ draft });
        }

        if (productIdStr) {
            const productId = parseInt(productIdStr, 10);
            if (isNaN(productId) || productId <= 0) {
                return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
            }
            const drafts = await getActiveDraftsForProduct(productId, { includeDeleted: isDiffView });
            return NextResponse.json({ drafts });
        }

        if (versionIdStr) {
            const versionId = parseInt(versionIdStr, 10);
            if (isNaN(versionId) || versionId <= 0) {
                return NextResponse.json({ error: "Invalid versionId" }, { status: 400 });
            }
            const draft = await getActiveDraftForVersion(versionId, { includeDeleted: isDiffView });
            return NextResponse.json({ draft });
        }
        return NextResponse.json({ error: "Missing required query parameter: draftId, productId, or versionId" }, { status: 400 });
    } catch (err: unknown) {
        console.error("API Error in GET /versions/drafts:", err);
        const errMsg = err instanceof Error ? err.message : "Failed to fetch version draft";
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            productId,
            sourceVersionId,
            versionName,
            baseQuantity,
            uomId,
            expectedYieldPercentage,
            customOverhead
        } = body;

        if (!productId) {
            return NextResponse.json({ error: "Missing required field: productId" }, { status: 400 });
        }

        const numProductId = Number(productId);
        const numSourceVerId = sourceVersionId ? Number(sourceVersionId) : null;
        const userId = await getUserIdFromToken();

        const draft = await createDraft({
            productId: numProductId,
            sourceVersionId: numSourceVerId,
            versionName: versionName && typeof versionName === "string" ? versionName.trim() : undefined,
            baseQuantity: baseQuantity !== undefined ? Number(baseQuantity) : undefined,
            uomId: uomId !== undefined ? Number(uomId) : undefined,
            expectedYieldPercentage: expectedYieldPercentage !== undefined ? Number(expectedYieldPercentage) : undefined,
            customOverhead: customOverhead !== undefined ? Number(customOverhead) : undefined,
            userId
        });

        return NextResponse.json({
            success: true,
            draftId: draft.draft_id,
            versionName: draft.version_name,
            status: draft.status,
            draft
        });
    } catch (err: unknown) {
        console.error("API Error in POST /versions/drafts:", err);
        const errMsg = err instanceof Error ? err.message : "Failed to initiate version draft";
        return NextResponse.json({ error: errMsg }, { status: 400 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { draftId, action, reason, details, routes, laborPositions, overheads } = body;

        if (!draftId) {
            return NextResponse.json({ error: "Missing required field: draftId" }, { status: 400 });
        }

        const numDraftId = Number(draftId);
        if (isNaN(numDraftId) || numDraftId <= 0) {
            return NextResponse.json({ error: "Invalid draftId" }, { status: 400 });
        }

        const userId = await getUserIdFromToken();

        if (action === "cancel") {
            const res = await cancelDraft(numDraftId, userId, reason);
            if (!res.success) {
                return NextResponse.json({ error: res.error || "Failed to cancel draft" }, { status: 400 });
            }
            return NextResponse.json({ success: true, draftId: numDraftId, status: "Cancelled" });
        }

        if (action === "submit") {
            const res = await submitDraftForApproval(numDraftId, userId);
            if (!res.success) {
                return NextResponse.json({ error: res.error || "Failed to submit draft for approval" }, { status: 400 });
            }
            return NextResponse.json({ success: true, draftId: numDraftId, status: "Pending Approval" });
        }

        if (action === "save") {
            const res = await saveDraftDetails(numDraftId, {
                details,
                routes,
                labor_positions: laborPositions,
                overheads
            }, userId);

            if (!res.success) {
                return NextResponse.json({ error: res.error || "Failed to save draft details" }, { status: 400 });
            }
            return NextResponse.json({ success: true, draftId: numDraftId, draft: res.draft });
        }

        if (action === "reopen" || action === "withdraw") {
            const res = await reopenDraftForEditing(numDraftId, userId);
            if (!res.success) {
                return NextResponse.json({ error: res.error || "Failed to reopen draft for editing" }, { status: 400 });
            }
            return NextResponse.json({ success: true, draftId: numDraftId, status: "Draft", draft: res.draft });
        }

        return NextResponse.json({ error: "Invalid action. Supported actions: 'save', 'cancel', 'submit', 'reopen'." }, { status: 400 });
    } catch (err: unknown) {
        console.error("API Error in PATCH /versions/drafts:", err);
        const errMsg = err instanceof Error ? err.message : "Failed to process draft update";
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
