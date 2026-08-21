import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupplierMemoBalances, shouldExposeSupplierMemo } from "../../_memo-cap-integrity";

export const runtime = "nodejs";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

interface DirectusCOA {
    coa_id: number;
    account_title: string;
}

interface DirectusMemo {
    id: number;
    memo_number: string;
    supplier_id?: number | { id?: number } | null;
    type: number;
    date: string;
    amount: number;
    reason?: string | null;
    status?: string | null;
    chart_of_account?: DirectusCOA | number | null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ supplierId: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const supplierId = Number(resolvedParams.supplierId);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
        return NextResponse.json({ message: "A valid supplier ID is required." }, { status: 400 });
    }

    try {
        const queryParams = new URLSearchParams({
            filter: JSON.stringify({
                _and: [
                    { supplier_id: { _eq: supplierId } },
                    { status: { _neq: "CANCELLED" } }
                ]
            }),
            fields: "id,memo_number,supplier_id,type,date,amount,reason,status,chart_of_account",
            sort: "-date",
            limit: "-1"
        });

        const directusRes = await fetch(`${DIRECTUS_URL}/items/suppliers_memo?${queryParams.toString()}`, {
            headers: {
                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
            },
            cache: "no-store",
        });

        if (!directusRes.ok) throw new Error(await directusRes.text());
        const rawData = ((await directusRes.json()).data || []) as DirectusMemo[];
        const balances = await getSupplierMemoBalances(supplierId);
        const balanceMap = new Map(balances.map((balance) => [balance.id, balance]));

        // Extract COA IDs
        const coaIds = Array.from(new Set(
            rawData
                .map(row => {
                    const coa = row.chart_of_account;
                    if (coa && typeof coa === "object") {
                        return Number(coa.coa_id);
                    }
                    return coa ? Number(coa) : null;
                })
                .filter((id): id is number => id !== null && !isNaN(id))
        ));

        const coaMap = new Map<number, { coa_id: number; account_title: string }>();

        if (coaIds.length > 0) {
            const coaRes = await fetch(`${DIRECTUS_URL}/items/chart_of_accounts?filter[coa_id][_in]=${coaIds.join(",")}&fields=coa_id,account_title`, {
                headers: {
                    Authorization: `Bearer ${DIRECTUS_TOKEN}`,
                },
                cache: "no-store",
            });
            if (coaRes.ok) {
                const coaData = ((await coaRes.json()).data || []) as { coa_id: number; account_title: string }[];
                for (const coa of coaData) {
                    coaMap.set(Number(coa.coa_id), coa);
                }
            }
        }

        const mapped = rawData.map((row: DirectusMemo) => {
            const balance = balanceMap.get(Number(row.id));
            let coaId: number | null = null;
            let accountTitle = "";

            const coa = row.chart_of_account;

            if (coa) {
                if (typeof coa === "object") {
                    coaId = Number(coa.coa_id) || null;
                    accountTitle = coa.account_title || "";
                } else {
                    coaId = Number(coa) || null;
                    const foundCoa = coaId ? coaMap.get(coaId) : null;
                    if (foundCoa) {
                        accountTitle = foundCoa.account_title || "";
                    }
                }
            }

            return {
                id: row.id,
                memo_number: row.memo_number,
                supplier_id: row.supplier_id && typeof row.supplier_id === "object"
                    ? Number(row.supplier_id.id) || supplierId
                    : Number(row.supplier_id) || supplierId,
                type: row.type,
                memo_type_name: Number(row.type) === 1 ? "CREDIT MEMO" : Number(row.type) === 2 ? "DEBIT MEMO" : "UNKNOWN",
                date: row.date,
                amount: Number(row.amount) || 0,
                applied_amount: balance?.appliedAmount || 0,
                remaining_amount: balance?.remainingAmount || 0,
                is_locked: balance?.isLocked || false,
                locking_tr_doc_no: balance?.lockingTrDocNo || null,
                locking_tr_status: balance?.lockingTrStatus || null,
                locking_tr_count: balance?.lockingTrCount || 0,
                reason: row.reason || "",
                coa_id: coaId,
                account_title: accountTitle
            };
        }).filter((memo) => shouldExposeSupplierMemo({
            remainingAmount: memo.remaining_amount,
            isLocked: memo.is_locked,
        }));

        return NextResponse.json(mapped);
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        return NextResponse.json({ message: "BFF Error", detail: errorMessage }, { status: 502 });
    }
}
