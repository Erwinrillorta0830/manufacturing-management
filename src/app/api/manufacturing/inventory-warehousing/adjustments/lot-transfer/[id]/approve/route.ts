import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  approveLotTransferServer,
  LotTransferServerError,
} from "@/modules/manufacturing-management/adjustments/lot-transfer/server/lot-transfer.server";

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
  } catch {}
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transferId = Number(id);
    if (!Number.isFinite(transferId) || transferId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid transfer ID" }, { status: 400 });
    }

    let remarks = "";
    try {
      const body = await request.json();
      remarks = body.remarks || "";
    } catch {}

    const userId = await getSessionUserId();
    const result = await approveLotTransferServer(transferId, userId, remarks);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[LotTransfer Approve Error]:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = error instanceof LotTransferServerError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
