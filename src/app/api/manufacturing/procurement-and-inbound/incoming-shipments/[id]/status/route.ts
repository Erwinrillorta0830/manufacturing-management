import { NextResponse } from "next/server";
import { PATCH as legacyUpdate } from "@/app/api/manufacturing/procurement/shipments/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
    const body = await request.json().catch(() => null);
    return legacyUpdate(new Request(request.url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
        body: JSON.stringify({ ...body, shipmentId: id })
    }));
}
