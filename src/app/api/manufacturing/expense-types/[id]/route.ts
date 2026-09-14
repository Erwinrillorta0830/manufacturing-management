import { NextResponse } from "next/server";
import { ExpenseTypeDomainError, updateExpenseType } from "../_domain";
import { ExpenseTypeAuthError, requireExpenseTypeAdmin } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
    if (error instanceof ExpenseTypeAuthError || error instanceof ExpenseTypeDomainError) {
        return NextResponse.json({ error: error.message, code: error instanceof ExpenseTypeDomainError ? error.code : "UNAUTHORIZED" }, { status: error.status });
    }
    console.error("[Expense Types API] Unexpected item error:", error);
    return NextResponse.json({ error: "Failed to update Expense Type." }, { status: 500 });
}

function parseId(value: string): number | null {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const actorId = await requireExpenseTypeAdmin();
        const { id: rawId } = await params;
        const id = parseId(rawId);
        if (!id) return NextResponse.json({ error: "A valid Expense Type ID is required." }, { status: 400 });

        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        const type = await updateExpenseType(id, {
            name: body?.name,
            coaId: body?.coaId ?? body?.coa_id,
            description: body?.description,
            isActive: body?.isActive ?? body?.is_active,
        }, actorId);
        return NextResponse.json({ data: type });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function DELETE() {
    return NextResponse.json({ error: "Expense Types cannot be deleted. Deactivate the record instead." }, { status: 405 });
}
