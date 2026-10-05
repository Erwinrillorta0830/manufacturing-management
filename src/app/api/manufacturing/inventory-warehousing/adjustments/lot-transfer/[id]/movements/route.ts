import { NextResponse } from "next/server";
import {
  getLotTransferMovementsServer,
  LotTransferServerError,
} from "@/modules/manufacturing-management/adjustments/lot-transfer/server/lot-transfer.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transferId = Number(id);
    if (!Number.isFinite(transferId) || transferId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid transfer ID" }, { status: 400 });
    }

    const data = await getLotTransferMovementsServer(transferId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[LotTransfer Movements Error]:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = error instanceof LotTransferServerError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
