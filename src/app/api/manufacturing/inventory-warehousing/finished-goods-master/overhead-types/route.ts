import { NextResponse } from "next/server";
import { ExpenseTypeAuthError, requireExpenseTypeAdmin } from "@/app/api/manufacturing/expense-types/_auth";
import { ExpenseTypeDomainError } from "@/app/api/manufacturing/expense-types/_domain";
import { 
    fetchAllOverheadTypes,
    createOverheadType
} from "./overhead-types-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
    if (error instanceof ExpenseTypeAuthError || error instanceof ExpenseTypeDomainError) {
        return NextResponse.json({ error: error.message, code: error instanceof ExpenseTypeDomainError ? error.code : "UNAUTHORIZED" }, { status: error.status });
    }
    console.error("[Overhead Types API] Unexpected error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to process overhead type request" }, { status: 500 });
}

export async function GET() {
    try {
        const types = await fetchAllOverheadTypes();
        return NextResponse.json(types);
    } catch (e) {
        console.error("API Error fetching overhead types:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch overhead types" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const actorId = await requireExpenseTypeAdmin();
        const { name, coa_id, description } = await request.json();

        const numericCoa = coa_id ? Number(coa_id) : null;
        const newType = await createOverheadType({
            name,
            coa_id: numericCoa && numericCoa > 0 ? numericCoa : null,
            description,
            created_by: actorId
        });
        if (!newType) throw new Error("Failed to create overhead type in Directus");
        return NextResponse.json({ success: true, type: newType });
    } catch (e) {
        return errorResponse(e);
    }
}
