import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../directus-api";
import { getSessionUserId, requireSessionUserId } from "../lot-transfers/_session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const res = await fetch(
            `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&sort=branch_name&fields=id,branch_name,branch_code,isActive,isBadStock,bad_stock_branch_id`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!res.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${res.status})` }, { status: res.status });
        }
        const json = await res.json();
        const data = (json.data || []).map((b: { id: number; branch_name: string; branch_code: string; isActive?: number | boolean | string | null; isBadStock?: number | boolean | string | null; bad_stock_branch_id?: number | null }) => ({
            id: b.id,
            branchName: b.branch_name,
            branchCode: b.branch_code,
            isActive: Number(b.isActive) === 1 || b.isActive === true || b.isActive === "1",
            isBadStock: Number(b.isBadStock) === 1 || b.isBadStock === true || b.isBadStock === "1",
            badStockBranchId: b.bad_stock_branch_id || null,
        }));
        return NextResponse.json(data);
    } catch (e) {
        console.error("branches GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

export async function POST(request: Request) {
    try {
        requireSessionUserId(await getSessionUserId(), "create a branch");

        const body = await request.json().catch(() => null) as {
            branchName?: unknown;
            branchCode?: unknown;
            branch_name?: unknown;
            branch_code?: unknown;
        } | null;
        const branchName = String(body?.branchName ?? body?.branch_name ?? "").trim();
        const branchCode = String(body?.branchCode ?? body?.branch_code ?? "").trim();

        if (!branchName || !branchCode) {
            return NextResponse.json({ error: "Branch name and branch code are required." }, { status: 400 });
        }

        const existingResponse = await fetch(
            `${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code,isActive`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!existingResponse.ok) {
            return NextResponse.json({ error: `Unable to verify existing branches (HTTP ${existingResponse.status}).` }, { status: 502 });
        }

        const existingRows = ((await existingResponse.json()).data || []) as Array<{
            branch_name?: string | null;
            branch_code?: string | null;
        }>;
        const normalizedName = branchName.toLocaleLowerCase();
        const normalizedCode = branchCode.toLocaleLowerCase();
        const duplicateName = existingRows.some((row) => String(row.branch_name || "").trim().toLocaleLowerCase() === normalizedName);
        const duplicateCode = existingRows.some((row) => String(row.branch_code || "").trim().toLocaleLowerCase() === normalizedCode);

        if (duplicateName || duplicateCode) {
            return NextResponse.json({
                error: duplicateName && duplicateCode
                    ? "A branch with the same name and code already exists."
                    : duplicateName
                        ? "A branch with the same name already exists."
                        : "A branch with the same code already exists."
            }, { status: 409 });
        }

        const createResponse = await fetch(`${DIRECTUS_URL}/items/branches`, {
            method: "POST",
            headers: directusHeaders,
            body: JSON.stringify({
                branch_name: branchName,
                branch_code: branchCode,
                date_added: new Date().toISOString().slice(0, 10),
                isMoving: 0,
                isReturn: 0,
                isBadStock: 0,
                isActive: 1
            })
        });
        const createdPayload = await createResponse.json().catch(() => null) as { data?: { id?: number; branch_name?: string; branch_code?: string } } | null;
        if (!createResponse.ok || !createdPayload?.data?.id) {
            return NextResponse.json({
                error: `Unable to create branch (HTTP ${createResponse.status}).`,
                details: createdPayload
            }, { status: createResponse.status >= 400 && createResponse.status < 500 ? createResponse.status : 502 });
        }

        return NextResponse.json({
            success: true,
            data: {
                id: Number(createdPayload.data.id),
                branchName: createdPayload.data.branch_name || branchName,
                branchCode: createdPayload.data.branch_code || branchCode,
                isActive: true
            }
        }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create branch.";
        const status = message.startsWith("An authenticated user") ? 401 : 500;
        console.error("branches POST error:", error);
        return NextResponse.json({ error: message }, { status });
    }
}
