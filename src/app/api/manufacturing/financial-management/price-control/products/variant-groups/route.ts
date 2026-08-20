import { NextRequest, NextResponse } from "next/server";

import { buildSupplierProductGroups } from "../../_productGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JwtPayload = {
    sub?: string | number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function decodeUserIdFromJwtCookie(req: NextRequest, cookieName = "vos_access_token") {
    const token = req.cookies.get(cookieName)?.value;
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    try {
        const payloadPart = parts[1];
        const pad = "=".repeat((4 - (payloadPart.length % 4)) % 4);
        const b64 = (payloadPart + pad).replace(/-/g, "+").replace(/_/g, "/");
        const jsonStr = Buffer.from(b64, "base64").toString("utf8");
        const payloadUnknown: unknown = JSON.parse(jsonStr);

        if (!isRecord(payloadUnknown)) return null;

        const payload = payloadUnknown as JwtPayload;
        const userId = Number(payload.sub);
        return Number.isFinite(userId) ? userId : null;
    } catch {
        return null;
    }
}

function norm(v: string | null) {
    const s = (v ?? "").trim();
    if (!s || s === "undefined" || s === "null") return "";
    return s;
}

function splitCsv(v: string): string[] {
    return v
        .split(",")
        .map((x) => x.trim())
        .filter((x) => !!x && x !== "undefined" && x !== "null");
}

export async function GET(req: NextRequest) {
    try {
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);

        const supplierScope = (norm(searchParams.get("supplier_scope")) || "LINKED_ONLY") as "ALL" | "LINKED_ONLY";
        const activeOnly = norm(searchParams.get("active_only") || "1") === "1";

        const supplierIdsRaw = (() => {
            const multi = norm(searchParams.get("supplier_ids"));
            if (multi) return splitCsv(multi);
            const single = norm(searchParams.get("supplier_id"));
            return single ? [single] : [];
        })();

        if (supplierIdsRaw.length === 0) {
            return NextResponse.json(
                { error: "supplier_ids is required" },
                { status: 400 },
            );
        }

        const { groups, totalVariants } = await buildSupplierProductGroups({
            supplierScope,
            supplierIdsRaw,
            filters: {
                activeOnly,
            },
        });

        return NextResponse.json({
            groups: groups.map((group) => ({
                group_id: group.group_id,
                variant_product_ids: group.variant_product_ids,
            })),
            meta: {
                total_groups: groups.length,
                total_variants: totalVariants,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: "Unexpected error", details: message }, { status: 500 });
    }
}
