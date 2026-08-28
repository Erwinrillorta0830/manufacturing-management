import {
    DirectusList,
    DisbursementRow,
    DisbursementDraftDocRow,
    SupplierRow,
    PayableRow,
    PaymentRow,
    NormalizedDisbursement,
} from "./disbursement.types";
import { normalizeDisbursement, asNumber, asString, relationId } from "./disbursement.helpers";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

export async function directusFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
    if (!DIRECTUS_TOKEN) throw new Error("DIRECTUS_STATIC_TOKEN is not configured");

    const res = await fetch(`${DIRECTUS_URL}${path.startsWith("/") ? "" : "/"}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${DIRECTUS_TOKEN}`,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        cache: "no-store",
    });

    const responseText = await res.text();
    if (!res.ok) throw new Error(responseText);
    if (!responseText.trim()) return undefined as T;

    try {
        return JSON.parse(responseText) as T;
    } catch {
        throw new Error("Directus returned an invalid JSON response.");
    }
}

export async function getCoaMap() {
    const map = new Map<number, string>();
    try {
        const coaRes = await directusFetch<DirectusList<{ coa_id?: number; account_title?: string }>>("/items/chart_of_accounts?limit=-1&fields=coa_id,account_title");
        if (coaRes.data && Array.isArray(coaRes.data)) {
            coaRes.data.forEach((c) => {
                const id = Number(c.coa_id);
                const title = String(c.account_title);
                if (id && title) {
                    map.set(id, title);
                }
            });
        }
    } catch (e) {
        console.warn("Failed to fetch COAs map:", e);
    }
    return map;
}

export async function getDivisionMap() {
    const map = new Map<number, string>();
    try {
        const divRes = await directusFetch<DirectusList<{ division_id?: number; division_name?: string }>>("/items/division?limit=-1&fields=division_id,division_name");
        if (divRes.data && Array.isArray(divRes.data)) {
            divRes.data.forEach((d) => {
                const id = Number(d.division_id);
                const name = String(d.division_name);
                if (id && name) {
                    map.set(id, name);
                }
            });
        }
    } catch (e) {
        console.warn("Failed to fetch divisions map:", e);
    }
    return map;
}

export async function getBankMap() {
    const map = new Map<number, { bankName: string; accountNumber: string }>();
    try {
        const bankRes = await directusFetch<DirectusList<{ bank_id?: number; bank_name?: string; account_number?: string }>>("/items/bank_accounts?limit=-1&fields=bank_id,bank_name,account_number");
        if (bankRes.data && Array.isArray(bankRes.data)) {
            bankRes.data.forEach((b) => {
                const id = Number(b.bank_id);
                const bankName = String(b.bank_name || "");
                const accountNumber = String(b.account_number || "");
                if (id) {
                    map.set(id, { bankName, accountNumber });
                }
            });
        }
    } catch (e) {
        console.warn("Failed to fetch bank accounts map:", e);
    }
    return map;
}

export async function getUserMap(userIds?: number[]) {
    const map = new Map<string, string>();
    try {
        let path = "/items/user?limit=-1&fields=user_id,user_fname,user_lname";
        if (userIds && userIds.length > 0) {
            const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
            if (uniqueIds.length > 0) {
                path = `/items/user?limit=-1&fields=user_id,user_fname,user_lname&filter[user_id][_in]=${uniqueIds.join(",")}`;
            }
        }
        const res = await directusFetch<DirectusList<{ user_id?: number; user_fname?: string; user_lname?: string }>>(path);
        if (res.data && Array.isArray(res.data)) {
            res.data.forEach((u) => {
                const id = String(u.user_id);
                const name = `${u.user_fname || ""} ${u.user_lname || ""}`.trim();
                if (id && name) {
                    map.set(id, name);
                }
            });
        }
    } catch (e) {
        console.warn("Failed to fetch users map from Directus:", e);
    }
    return map;
}

export async function resolveEncoderId(emailOrSub: string | null): Promise<number | null> {
    if (!emailOrSub) return null;
    const parsedId = Number(emailOrSub);
    if (Number.isInteger(parsedId) && parsedId > 0) {
        return parsedId;
    }
    try {
        const params = new URLSearchParams();
        params.set("filter[user_email][_eq]", emailOrSub);
        params.set("fields", "user_id");
        params.set("limit", "1");
        const res = await directusFetch<DirectusList<{ user_id?: number }>>(`/items/user?${params.toString()}`);
        const userId = res.data?.[0]?.user_id;
        if (userId) return Number(userId);

        const clean = emailOrSub.toLowerCase();
        const parts = clean.split(/[._-]/);
        if (parts.length >= 2) {
            const fname = parts[0];
            const lname = parts[1];
            const fallbackParams = new URLSearchParams();
            fallbackParams.set("filter[user_fname][_icontains]", fname);
            fallbackParams.set("filter[user_lname][_icontains]", lname);
            fallbackParams.set("fields", "user_id");
            fallbackParams.set("limit", "1");
            const fallbackRes = await directusFetch<DirectusList<{ user_id?: number }>>(`/items/user?${fallbackParams.toString()}`);
            const fbUserId = fallbackRes.data?.[0]?.user_id;
            if (fbUserId) return Number(fbUserId);
        }
        return null;
    } catch {
        return null;
    }
}

export async function getSupplierIds(search: string) {
    if (!search) return [];
    const params = new URLSearchParams();
    params.set("limit", "-1");
    params.set("fields", "id");
    params.set("filter[supplier_name][_contains]", search);
    const res = await directusFetch<DirectusList<SupplierRow>>(`/items/suppliers?${params.toString()}`);
    return (res.data ?? [])
        .map((supplier) => asNumber(supplier.id))
        .filter((id): id is number => Boolean(id));
}

export async function getWerDocumentNumbers() {
    const res = await directusFetch<DirectusList<DisbursementDraftDocRow>>("/items/disbursement_draft?fields=doc_no&limit=-1");
    return Array.from(new Set(
        (res.data ?? [])
            .map((row) => asString(row.doc_no).trim().toUpperCase())
            .filter(Boolean),
    ));
}

function groupByDisbursementId<T extends { disbursement_id?: unknown }>(rows: T[]) {
    const map = new Map<number, T[]>();
    rows.forEach((row) => {
        const id = asNumber(row.disbursement_id);
        if (!id) return;
        map.set(id, [...(map.get(id) ?? []), row]);
    });
    return map;
}

export async function getLineItems(disbursementIds: number[]) {
    const ids = disbursementIds.filter(Boolean);
    if (ids.length === 0) {
        return {
            payables: new Map<number, PayableRow[]>(),
            payments: new Map<number, PaymentRow[]>(),
        };
    }
    const payableParams = new URLSearchParams();
    payableParams.set("limit", "-1");
    payableParams.set(
        "fields",
        "id,disbursement_id,division_id,division_id.division_id,division_id.division_name,reference_no,date,coa_id,coa_id.coa_id,coa_id.account_title,amount,remarks",
    );
    payableParams.set("filter[disbursement_id][_in]", ids.join(","));

    const paymentParams = new URLSearchParams();
    paymentParams.set("limit", "-1");
    paymentParams.set(
        "fields",
        "id,disbursement_id,coa_id,coa_id.coa_id,coa_id.account_title,bank_id,check_no,date,amount,remarks,released_date",
    );
    paymentParams.set("filter[disbursement_id][_in]", ids.join(","));

    const [payablesRes, paymentsRes] = await Promise.all([
        directusFetch<DirectusList<PayableRow>>(`/items/disbursement_payables?${payableParams.toString()}`),
        directusFetch<DirectusList<PaymentRow>>(`/items/disbursement_payments?${paymentParams.toString()}`),
    ]);

    return {
        payables: groupByDisbursementId(payablesRes.data ?? []),
        payments: groupByDisbursementId(paymentsRes.data ?? []),
    };
}

export async function loadNormalizedDisbursement(row: DisbursementRow): Promise<NormalizedDisbursement> {
    const id = asNumber(row.id) || 0;
    const lineItems = await getLineItems([id]);
    const userIdsToFetch: number[] = [];
    const addId = (value: number | undefined) => {
        if (typeof value === "number" && Number.isFinite(value)) userIdsToFetch.push(value);
    };

    addId(relationId(row.encoder_id, "user_id"));
    addId(relationId(row.approver_id, "user_id"));
    addId(relationId(row.posted_by, "user_id"));

    const [userMap, coaMap, divisionMap, bankMap] = await Promise.all([
        getUserMap(userIdsToFetch),
        getCoaMap(),
        getDivisionMap(),
        getBankMap(),
    ]);

    return normalizeDisbursement(row, lineItems.payables.get(id) || [], lineItems.payments.get(id) || [], userMap, coaMap, divisionMap, bankMap);
}

export async function compensateCreatedDisbursement(id: number) {
    const lineItems = await getLineItems([id]);
    const payableIds = (lineItems.payables.get(id) || [])
        .map((line) => asNumber(line.id))
        .filter((value): value is number => Boolean(value));
    const paymentIds = (lineItems.payments.get(id) || [])
        .map((line) => asNumber(line.id))
        .filter((value): value is number => Boolean(value));

    if (payableIds.length > 0) {
        await directusFetch(`/items/disbursement_payables`, {
            method: "DELETE",
            body: JSON.stringify(payableIds),
        });
    }
    if (paymentIds.length > 0) {
        await directusFetch(`/items/disbursement_payments`, {
            method: "DELETE",
            body: JSON.stringify(paymentIds),
        });
    }
    await directusFetch(`/items/disbursement/${id}`, { method: "DELETE" });
}
