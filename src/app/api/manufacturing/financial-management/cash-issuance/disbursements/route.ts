import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";
import { DisbursementService } from "@/modules/manufacturing-management/financial-management/cash-issuance/services/disbursement.service";
import { DisbursementPayloadSchema } from "@/modules/manufacturing-management/financial-management/cash-issuance/services/disbursement.schema";
import { acquireDocumentNumberLock, findNextAvailableDocumentNumber } from "@/modules/manufacturing-management/financial-management/treasury/disbursement/document-number";
import { directusFetch } from "@/modules/manufacturing-management/financial-management/cash-issuance/services/disbursement.repo";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);

    if (searchParams.get("nextDocNo") === "true") {
        const supplierType = searchParams.get("supplierType") || "Trade";
        const transactionTypeId = supplierType.toLowerCase().startsWith("non") ? 2 : 1;
        const releaseDocumentNumberLock = await acquireDocumentNumberLock(transactionTypeId);
        try {
            const nextNo = await findNextAvailableDocumentNumber(transactionTypeId, directusFetch);
            return NextResponse.json({ nextDocNo: nextNo });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "An unknown error occurred";
            return NextResponse.json({ message }, { status: 500 });
        } finally {
            releaseDocumentNumberLock();
        }
    }

    try {
        const result = await DisbursementService.listDisbursements(searchParams);
        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "An unknown error occurred";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const decoded = decodeJwtPayload(token);
    const encoderEmail = decoded?.email || decoded?.sub || null;

    try {
        const body = await request.json();
        const payload = DisbursementPayloadSchema.parse(body);
        const result = await DisbursementService.createDisbursement(payload, encoderEmail);
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
