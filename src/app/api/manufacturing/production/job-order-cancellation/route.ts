import { NextResponse } from "next/server";
import { AuthenticatedActorError, requireManufacturingActorId } from "../_authenticated-actor";
import {
    cancelJobOrderAndReturnMaterials,
    previewJobOrderCancellation,
    returnJobOrderMaterialLeftovers,
    JobOrderCancellationError
} from "./_cancellation-service";
import {
    deleteJobOrderCancellationImage,
    JobOrderCancellationImageError,
    uploadJobOrderCancellationImage,
    validateJobOrderCancellationImage
} from "./_image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
    if (error instanceof AuthenticatedActorError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof JobOrderCancellationImageError) {
        return NextResponse.json(
            { error: error.message, code: error.code },
            { status: error.status }
        );
    }
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
    let uploadedImageId: string | null = null;
    try {
        const contentType = request.headers.get("content-type")?.toLowerCase() || "";
        let body: Record<string, unknown> | null = null;
        let cancellationImage: File | null = null;

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const payloadValue = formData.get("payload");
            if (typeof payloadValue !== "string") {
                return NextResponse.json(
                    { error: "The Job Order cancellation payload is required.", code: "CANCELLATION_PAYLOAD_REQUIRED" },
                    { status: 400 }
                );
            }

            let parsedPayload: unknown;
            try {
                parsedPayload = JSON.parse(payloadValue);
            } catch {
                return NextResponse.json(
                    { error: "The Job Order cancellation payload is not valid JSON.", code: "CANCELLATION_PAYLOAD_INVALID" },
                    { status: 400 }
                );
            }
            if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
                return NextResponse.json(
                    { error: "The Job Order cancellation payload must be an object.", code: "CANCELLATION_PAYLOAD_INVALID" },
                    { status: 400 }
                );
            }
            body = parsedPayload as Record<string, unknown>;

            const imageValue = formData.get("image");
            if (imageValue !== null && (typeof File === "undefined" || !(imageValue instanceof File))) {
                return NextResponse.json(
                    { error: "The cancellation evidence image is invalid.", code: "CANCELLATION_IMAGE_INVALID" },
                    { status: 422 }
                );
            }
            cancellationImage = typeof File !== "undefined" && imageValue instanceof File ? imageValue : null;
        } else {
            const parsedBody = await request.json().catch(() => null);
            if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
                return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
            }
            body = parsedBody as Record<string, unknown>;
        }

        const { action, joId, reason } = body as Record<string, unknown>;
        if (!joId) {
            return NextResponse.json({ error: "joId is required." }, { status: 400 });
        }

        if (action === "cancel-and-return") {
            const trimmedReason = typeof reason === "string" ? reason.trim() : "";
            if (!trimmedReason) {
                return NextResponse.json({ error: "A cancellation reason is required." }, { status: 400 });
            }
            if (!cancellationImage) {
                return NextResponse.json(
                    { error: "A cancellation evidence image is required.", code: "CANCELLATION_IMAGE_REQUIRED" },
                    { status: 422 }
                );
            }
            const imageError = validateJobOrderCancellationImage(cancellationImage);
            if (imageError) {
                return NextResponse.json(
                    { error: imageError, code: "CANCELLATION_IMAGE_INVALID" },
                    { status: 422 }
                );
            }
            const actor = await requireManufacturingActorId();
            uploadedImageId = await uploadJobOrderCancellationImage(cancellationImage, String(joId));
            const execution = await cancelJobOrderAndReturnMaterials({
                joId: String(joId),
                reason: trimmedReason,
                actorUserId: actor,
                cancellationImageId: uploadedImageId
            });
            return NextResponse.json({ success: true, data: execution.response });
        }

        if (action === "return-materials") {
            const actor = await requireManufacturingActorId();
            const execution = await returnJobOrderMaterialLeftovers({
                joId: String(joId),
                reason: typeof reason === "string" ? reason : undefined,
                actorUserId: actor,
                destinations: Array.isArray(body.destinations) ? body.destinations : undefined
            });
            return NextResponse.json({ success: true, data: execution.response });
        }

        return NextResponse.json({ error: "Invalid action parameter." }, { status: 400 });
    } catch (error) {
        if (uploadedImageId) {
            await deleteJobOrderCancellationImage(uploadedImageId);
        }
        return errorResponse(error);
    }
}
