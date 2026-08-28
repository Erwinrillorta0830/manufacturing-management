import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";
import { DisbursementService } from "@/modules/manufacturing-management/financial-management/cash-issuance/services/disbursement.service";
import { DisbursementPayloadSchema } from "@/modules/manufacturing-management/financial-management/cash-issuance/services/disbursement.schema";

export const runtime = "nodejs";

// 🚀 PUT Handler - Directus Native
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    const decoded = decodeJwtPayload(token);
    const encoderEmail = decoded?.email || decoded?.sub || null;

    try {
        const body = await request.json();
        // Since schema might not include `saveScope` but body does, we can use `saveScope` for update scope.
        // We'll pass it into payload.
        const payload = DisbursementPayloadSchema.parse({
            ...body,
            scope: body.saveScope,
        });

        const result = await DisbursementService.updateDisbursement(id, payload, encoderEmail);
        return NextResponse.json(result);
    } catch (err: unknown) {
        const error = err as { status?: number; message?: string; detail?: unknown };
        if (error.status) {
            return NextResponse.json({ message: error.message, detail: error.detail, ...(typeof error.detail === "object" && error.detail ? error.detail : {}) }, { status: error.status });
        }
        const message = err instanceof Error ? err.message : "An unknown error occurred";
        return NextResponse.json({ message: "BFF Error", detail: message }, { status: 502 });
    }
}

// 🚀 DELETE Handler - Directus Native with Immutability Check
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    const decoded = decodeJwtPayload(token);
    const encoderEmail = decoded?.email || decoded?.sub || null;

    try {
        const result = await DisbursementService.deleteDisbursement(id, encoderEmail);
        return NextResponse.json(result);
    } catch (err: unknown) {
        const error = err as { status?: number; message?: string; detail?: unknown };
        if (error.status) {
            return NextResponse.json({ message: error.message, detail: error.detail, ...(typeof error.detail === "object" && error.detail ? error.detail : {}) }, { status: error.status });
        }
        const message = err instanceof Error ? err.message : "An unknown error occurred";
        return NextResponse.json({ message: "BFF Error", detail: message }, { status: 502 });
    }
}
