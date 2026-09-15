import { NextRequest, NextResponse } from "next/server";
import {
    ExpenseTypeDomainError,
    createExpenseType,
    getActiveExpenseTypeOptions,
    getEligibleExpenseAccounts,
    listExpenseTypes,
} from "./_domain";
import { ExpenseTypeAuthError, requireExpenseTypeAdmin, requireExpenseTypeUser } from "./_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
    if (error instanceof ExpenseTypeAuthError || error instanceof ExpenseTypeDomainError) {
        return NextResponse.json({ error: error.message, code: error instanceof ExpenseTypeDomainError ? error.code : "UNAUTHORIZED" }, { status: error.status });
    }
    console.error("[Expense Types API] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to process Expense Type request." }, { status: 500 });
}

function stringValue(value: string | null): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
}

export async function GET(request: NextRequest) {
    try {
        const view = request.nextUrl.searchParams.get("view")?.trim().toLowerCase();
        if (view === "options") {
            await requireExpenseTypeUser();
            return NextResponse.json({ data: await getActiveExpenseTypeOptions() });
        }
        if (view === "gl-accounts") {
            await requireExpenseTypeAdmin();
            return NextResponse.json({ data: await getEligibleExpenseAccounts() });
        }

        await requireExpenseTypeAdmin();
        const statusParam = request.nextUrl.searchParams.get("status")?.trim().toLowerCase() || "all";
        if (statusParam !== "all" && statusParam !== "active" && statusParam !== "inactive") {
            return NextResponse.json({ error: "status must be all, active, or inactive" }, { status: 400 });
        }

        const data = await listExpenseTypes({
            includeInactive: true,
            query: stringValue(request.nextUrl.searchParams.get("q")),
            status: statusParam,
        });
        return NextResponse.json({ data });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        const actorId = await requireExpenseTypeAdmin();
        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        const type = await createExpenseType({
            name: body?.name,
            coaId: body?.coaId ?? body?.coa_id,
            description: body?.description,
        }, actorId);
        return NextResponse.json({ data: type }, { status: 201 });
    } catch (error) {
        return errorResponse(error);
    }
}
