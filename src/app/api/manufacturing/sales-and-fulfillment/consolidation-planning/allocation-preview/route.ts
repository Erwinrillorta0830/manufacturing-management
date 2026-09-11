import { NextRequest, NextResponse } from "next/server";
import { previewConsolidationAllocations } from "../../../invoice-consolidation/_reservation-service";
import { getUserIdFromToken } from "../../../invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const branchId = Number(body.branchId);
        const invoiceIds = Array.isArray(body.invoiceIds)
            ? [...new Set<number>(body.invoiceIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))]
            : [];
        if (!branchId || invoiceIds.length === 0) {
            return NextResponse.json({ message: "branchId and invoiceIds are required" }, { status: 400 });
        }
        const preview = await previewConsolidationAllocations(branchId, invoiceIds);
        return NextResponse.json(preview);
    } catch (error) {
        console.error("allocation preview error:", error);
        const message = error instanceof Error ? error.message : "Failed to preview lot allocations";
        return NextResponse.json({ message }, { status: 422 });
    }
}
