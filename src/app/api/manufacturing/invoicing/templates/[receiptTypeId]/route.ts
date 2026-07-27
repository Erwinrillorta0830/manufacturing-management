import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../../../directus-api";
import { getUserIdFromToken } from "../../../invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validTemplate(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object") return false;
    const template = value as Record<string, unknown>;
    const width = Number(template.width);
    const height = Number(template.height);
    const table = template.tableSettings as Record<string, unknown> | undefined;
    const fields = template.fields && typeof template.fields === "object" ? Object.values(template.fields) : [];
    const columns = table?.columns && typeof table.columns === "object" ? Object.values(table.columns) : [];
    return width >= 50 && width <= 500
        && height >= 50 && height <= 1000
        && fields.length > 0 && fields.length <= 100
        && fields.every(field => {
            if (!field || typeof field !== "object") return false;
            const config = field as Record<string, unknown>;
            const x = Number(config.x);
            const y = Number(config.y);
            const fontSize = config.fontSize === undefined ? 10 : Number(config.fontSize);
            return x >= 0 && x <= width && y >= 0 && y <= height && fontSize >= 4 && fontSize <= 72;
        })
        && !!table && typeof table === "object"
        && Number(table.startY) >= 0
        && Number(table.startY) <= height
        && Number(table.rowHeight) > 0
        && Number(table.rowHeight) <= height
        && Number(table.fontSize) >= 4
        && Number(table.fontSize) <= 72
        && columns.length <= 20
        && columns.every(column => !!column && typeof column === "object" && Number((column as Record<string, unknown>).x) >= 0 && Number((column as Record<string, unknown>).x) <= width)
        && (template.backgroundImage === undefined || typeof template.backgroundImage === "string");
}

async function receiptTypeId(params: Promise<{ receiptTypeId: string }>) {
    const id = Number((await params).receiptTypeId);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export async function GET(_request: Request, { params }: { params: Promise<{ receiptTypeId: string }> }) {
    if (!(await getUserIdFromToken())) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const id = await receiptTypeId(params);
    if (!id) return NextResponse.json({ error: "Invalid receipt type ID." }, { status: 400 });

    const response = await fetch(`${DIRECTUS_URL}/items/sales_invoice_template?filter[sales_invoice_type_id][_eq]=${id}&fields=id,template_config&limit=1`, { headers, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "Unable to load receipt template." }, { status: 503 });
    const row = (await response.json()).data?.[0];
    return NextResponse.json({ id: row?.id ?? null, templateConfig: row?.template_config ?? null });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ receiptTypeId: string }> }) {
    if (!(await getUserIdFromToken())) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const id = await receiptTypeId(params);
    if (!id) return NextResponse.json({ error: "Invalid receipt type ID." }, { status: 400 });
    const body = await request.json().catch(() => null) as { templateConfig?: unknown } | null;
    if (!validTemplate(body?.templateConfig)) return NextResponse.json({ error: "Invalid receipt template." }, { status: 400 });

    const existingResponse = await fetch(`${DIRECTUS_URL}/items/sales_invoice_template?filter[sales_invoice_type_id][_eq]=${id}&fields=id&limit=1`, { headers, cache: "no-store" });
    if (!existingResponse.ok) return NextResponse.json({ error: "Unable to check receipt template." }, { status: 503 });
    const existingId = (await existingResponse.json()).data?.[0]?.id;
    const response = await fetch(existingId
        ? `${DIRECTUS_URL}/items/sales_invoice_template/${existingId}`
        : `${DIRECTUS_URL}/items/sales_invoice_template`, {
        method: existingId ? "PATCH" : "POST",
        headers,
        body: JSON.stringify(existingId
            ? { template_config: body.templateConfig }
            : { sales_invoice_type_id: id, template_config: body.templateConfig }),
    });
    if (!response.ok) return NextResponse.json({ error: "Unable to save receipt template." }, { status: 503 });
    const saved = (await response.json()).data;
    return NextResponse.json({ id: saved?.id ?? existingId, templateConfig: saved?.template_config ?? body.templateConfig });
}
