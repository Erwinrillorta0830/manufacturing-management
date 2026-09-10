import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    cancelJobOrderAndReturnMaterials,
    previewJobOrderCancellation,
    returnCancelledJobOrderMaterials,
    JobOrderCancellationError
} from "./_cancellation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveActorUserId(bodyActorId: unknown): Promise<number | null> {
    const bodyId = Number(bodyActorId);
    if (Number.isSafeInteger(bodyId) && bodyId > 0) return bodyId;
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
                const id = Number(payload?.id || payload?.user_id || payload?.sub);
                if (Number.isSafeInteger(id) && id > 0) return id;
            }
        }
    } catch (error) {
        console.warn("Unable to resolve the cancellation actor from the session:", error);
    }
    return null;
}

function errorResponse(error: unknown) {
    if (error instanceof JobOrderCancellationError) {
        return NextResponse.json(
            {
                error: error.message,
                code: error.code,
                ...(error.details ? { details: error.details } : {})
            },
            { status: error.status }
        );
    }
    return NextResponse.json(
        { error: error instanceof Error ? error.message : "Job Order cancellation failed." },
        { status: 500 }
    );
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");
        if (!joId) {
            return NextResponse.json({ error: "joId is required." }, { status: 400 });
        }
        const preview = await previewJobOrderCancellation(joId);
        return NextResponse.json({ success: true, data: preview });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
        }
        const { action, joId, reason, actorUserId } = body as Record<string, unknown>;
        if (!joId) {
            return NextResponse.json({ error: "joId is required." }, { status: 400 });
        }
        const actor = await resolveActorUserId(actorUserId);

        if (action === "cancel-and-return") {
            const trimmedReason = typeof reason === "string" ? reason.trim() : "";
            if (!trimmedReason) {
                return NextResponse.json({ error: "A cancellation reason is required." }, { status: 400 });
            }
            const execution = await cancelJobOrderAndReturnMaterials({
                joId: String(joId),
                reason: trimmedReason,
                actorUserId: actor
            });
            return NextResponse.json({ success: true, data: execution.response });
        }

        if (action === "return-materials") {
            const execution = await returnCancelledJobOrderMaterials({
                joId: String(joId),
                reason: typeof reason === "string" ? reason : undefined,
                actorUserId: actor
            });
            return NextResponse.json({ success: true, data: execution.response });
        }

        return NextResponse.json({ error: "Invalid action parameter." }, { status: 400 });
    } catch (error) {
        return errorResponse(error);
    }
}
