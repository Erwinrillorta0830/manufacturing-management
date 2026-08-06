import { NextRequest, NextResponse } from "next/server";
import { fetchImportPOs, createImportPO } from "./import-po-helper";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const supplierIdStr = searchParams.get("supplierId");
        const supplierId = supplierIdStr ? parseInt(supplierIdStr, 10) : undefined;

        const pos = await fetchImportPOs(supplierId);
        return NextResponse.json(pos);
    } catch (error) {
        console.error("GET /api/manufacturing/procurement/import-po Error:", error);
        return NextResponse.json({ error: "Failed to fetch import purchase orders" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const created = await createImportPO(body);
        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        console.error("POST /api/manufacturing/procurement/import-po Error:", error);
        return NextResponse.json({ error: "Failed to create import purchase order" }, { status: 500 });
    }
}
