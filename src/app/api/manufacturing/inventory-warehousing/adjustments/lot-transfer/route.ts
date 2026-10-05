import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  listLotTransfersServer,
  createLotTransferServer,
  LotTransferServerError,
} from "@/modules/manufacturing-management/adjustments/lot-transfer/server/lot-transfer.server";
import type { LotTransferStatus } from "@/modules/manufacturing-management/adjustments/lot-transfer/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSessionUserId(): Promise<number | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value || cookieStore.get("springboot_token")?.value;
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (encoded.length % 4) encoded += "=";
    const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    for (const key of ["id", "user_id", "userId", "sub"]) {
      const val = Number(payload[key]);
      if (Number.isFinite(val) && val > 0) return val;
    }
  } catch {
    // Return null if parse fails
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawStatuses = searchParams.get("status")?.split(",").map((s) => s.trim()).filter(Boolean) as LotTransferStatus[] | undefined;
    const branchId = searchParams.get("branchId") ? Number(searchParams.get("branchId")) : undefined;
    const search = searchParams.get("search") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const sourceLotId = searchParams.get("sourceLotId") ? Number(searchParams.get("sourceLotId")) : undefined;
    const targetLotId = searchParams.get("targetLotId") ? Number(searchParams.get("targetLotId")) : undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;
    const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : 0;

    const result = await listLotTransfersServer({
      status: rawStatuses,
      branchId,
      search,
      dateFrom,
      dateTo,
      sourceLotId,
      targetLotId,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      totalCount: result.totalCount,
    });
  } catch (error) {
    console.error("[LotTransfer GET API Error]:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = error instanceof LotTransferServerError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = await getSessionUserId();
    const result = await createLotTransferServer(body, userId);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[LotTransfer POST API Error]:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = error instanceof LotTransferServerError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
