type DirectusList<T> = { data?: T[] };

type DirectusMemo = {
    id: number;
    memo_number: string;
    supplier_id?: number | { id?: number } | null;
    type: number;
    amount: number | string | null;
    status?: string | null;
};

type DirectusPayable = {
    reference_no?: string | null;
    amount?: number | string | null;
    disbursement_id?: number | { id?: number } | null;
};

type DirectusDisbursement = {
    id: number;
    doc_no?: string | null;
    status?: string | null;
    payee?: number | { id?: number } | null;
};

type MemoBlockingDisbursement = {
    id: number;
    docNo: string;
    status: string;
};

type MemoUsage = {
    appliedAmount: number;
    blockingDisbursements: MemoBlockingDisbursement[];
};

export type MemoCapInput = {
    referenceNo?: unknown;
    amount?: unknown;
};

export type SupplierMemoBalance = {
    id: number;
    memoNumber: string;
    supplierId: number;
    type: number;
    amount: number;
    appliedAmount: number;
    remainingAmount: number;
    status: string;
    isLocked: boolean;
    lockingTrDocNo: string | null;
    lockingTrStatus: string | null;
    lockingTrCount: number;
};

export type MemoCapError = {
    memoNumber: string;
    authorizedAmount: number;
    appliedAmount: number;
    requestedAmount: number;
    remainingAmount: number;
    isLocked?: boolean;
    lockingTrDocNo?: string | null;
    lockingTrStatus?: string | null;
    lockingTrCount?: number;
    message: string;
};

let memoCapLockTail = Promise.resolve();

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";
const ACTIVE_DISBURSEMENT_STATUSES = new Set([
    "Draft",
    "Submitted",
    "Returned for Revision",
    "Approved",
    "Released",
    "Partially Released",
    "Posted",
]);
const LOCKING_DISBURSEMENT_STATUSES = new Set([
    "Draft",
    "Submitted",
    "Returned for Revision",
    "Approved",
    "Released",
    "Partially Released",
]);

export function isMemoLockingDisbursementStatus(status: unknown): boolean {
    return LOCKING_DISBURSEMENT_STATUSES.has(String(status || "").trim());
}

export function shouldExposeSupplierMemo(balance: Pick<SupplierMemoBalance, "remainingAmount" | "isLocked">): boolean {
    return balance.remainingAmount > 0.01 || balance.isLocked;
}

function asNumber(value: unknown): number | undefined {
    if (value == null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function relationId(value: unknown): number | undefined {
    if (value && typeof value === "object") {
        return asNumber((value as { id?: unknown }).id);
    }
    return asNumber(value);
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizedReference(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function looksLikeMemoReference(reference: string): boolean {
    return /^(SCM|SDM)-/i.test(reference);
}

/**
 * Serializes memo-bearing mutations handled by this Next.js process. A
 * transaction-capable Directus operation is still required when the BFF is
 * deployed across multiple processes or instances.
 */
export async function acquireMemoCapLock(lines: MemoCapInput[]): Promise<() => void> {
    const references = Array.from(new Set(
        lines.map((line) => normalizedReference(line.referenceNo)).filter(Boolean),
    ));
    let hasMemoReference = references.some(looksLikeMemoReference);
    if (!hasMemoReference && references.length > 0) {
        try {
            hasMemoReference = (await fetchMemosByReferences(references)).length > 0;
        } catch {
            // Validation below remains authoritative; a lookup failure must not mutate data.
            return () => undefined;
        }
    }
    if (!hasMemoReference) return () => undefined;

    const previous = memoCapLockTail;
    let releaseQueuedRequest!: () => void;
    const queuedRequest = new Promise<void>((resolve) => {
        releaseQueuedRequest = resolve;
    });
    memoCapLockTail = previous.then(() => queuedRequest);
    await previous;

    let released = false;
    return () => {
        if (released) return;
        released = true;
        releaseQueuedRequest();
    };
}

async function directusFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
        throw new Error("Directus memo validation is not configured");
    }

    const response = await fetch(`${DIRECTUS_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${DIRECTUS_TOKEN}`,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        cache: "no-store",
    });

    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
}

function memoBalance(
    memo: DirectusMemo,
    usage: MemoUsage,
): SupplierMemoBalance {
    const amount = roundMoney(Math.max(0, asNumber(memo.amount) || 0));
    const normalizedApplied = roundMoney(Math.max(0, usage.appliedAmount));
    const memoStatus = memo.status?.toUpperCase();
    const remainingAmount = memoStatus === "CANCELLED"
        ? 0
        : roundMoney(Math.max(0, amount - normalizedApplied));
    const firstBlocker = usage.blockingDisbursements[0];

    return {
        id: Number(memo.id),
        memoNumber: memo.memo_number,
        supplierId: relationId(memo.supplier_id) || 0,
        type: Number(memo.type),
        amount,
        appliedAmount: normalizedApplied,
        remainingAmount,
        status: String(memo.status || "Available"),
        isLocked: usage.blockingDisbursements.length > 0,
        lockingTrDocNo: firstBlocker?.docNo || null,
        lockingTrStatus: firstBlocker?.status || null,
        lockingTrCount: usage.blockingDisbursements.length,
    };
}

async function fetchMemosByReferences(references: string[]): Promise<DirectusMemo[]> {
    if (references.length === 0) return [];
    const params = new URLSearchParams();
    params.set("filter[memo_number][_in]", references.join(","));
    params.set("fields", "id,memo_number,supplier_id,type,amount,status");
    params.set("limit", "-1");
    const response = await directusFetch<DirectusList<DirectusMemo>>(`/items/suppliers_memo?${params.toString()}`);
    return response.data || [];
}

async function fetchMemosForSupplier(supplierId: number): Promise<DirectusMemo[]> {
    const params = new URLSearchParams();
    params.set("filter[supplier_id][_eq]", String(supplierId));
    params.set("filter[status][_neq]", "CANCELLED");
    params.set("fields", "id,memo_number,supplier_id,type,amount,status");
    params.set("sort", "-date");
    params.set("limit", "-1");
    const response = await directusFetch<DirectusList<DirectusMemo>>(`/items/suppliers_memo?${params.toString()}`);
    return response.data || [];
}

async function fetchMemoUsage(
    references: string[],
    excludeDisbursementId?: number,
): Promise<Map<string, MemoUsage>> {
    const usageByReference = new Map<string, MemoUsage>();
    if (references.length === 0) return usageByReference;

    const payableParams = new URLSearchParams();
    payableParams.set("filter[reference_no][_in]", references.join(","));
    payableParams.set("fields", "reference_no,amount,disbursement_id");
    payableParams.set("limit", "-1");
    const payableResponse = await directusFetch<DirectusList<DirectusPayable>>(
        `/items/disbursement_payables?${payableParams.toString()}`,
    );
    const payableRows = payableResponse.data || [];

    const disbursementIds = Array.from(new Set(
        payableRows
            .map((row) => relationId(row.disbursement_id))
            .filter((id): id is number => Boolean(id) && id !== excludeDisbursementId),
    ));

    const disbursements = disbursementIds.length > 0
        ? (await directusFetch<DirectusList<DirectusDisbursement>>(
            `/items/disbursement?filter[id][_in]=${disbursementIds.join(",")}&fields=id,doc_no,status,payee&limit=-1`,
        )).data || []
        : [];
    const disbursementMap = new Map(disbursements.map((row) => [Number(row.id), row]));
    const activeIds = new Set(
        disbursements
            .filter((row) => ACTIVE_DISBURSEMENT_STATUSES.has(String(row.status || "").trim()))
            .map((row) => Number(row.id)),
    );

    for (const row of payableRows) {
        const reference = normalizedReference(row.reference_no);
        const disbursementId = relationId(row.disbursement_id);
        if (!reference || !disbursementId || disbursementId === excludeDisbursementId || !activeIds.has(disbursementId)) {
            continue;
        }
        const disbursement = disbursementMap.get(disbursementId);
        if (!disbursement) continue;

        const usage = usageByReference.get(reference) || {
            appliedAmount: 0,
            blockingDisbursements: [],
        };
        const amount = Math.abs(asNumber(row.amount) || 0);
        usage.appliedAmount = roundMoney(usage.appliedAmount + amount);

        const status = String(disbursement.status || "").trim();
        if (amount > 0.01 && isMemoLockingDisbursementStatus(status)
            && !usage.blockingDisbursements.some((blocker) => blocker.id === disbursementId)) {
            usage.blockingDisbursements.push({
                id: disbursementId,
                docNo: String(disbursement.doc_no || `TR-${disbursementId}`),
                status,
            });
        }
        usageByReference.set(reference, usage);
    }

    for (const usage of usageByReference.values()) {
        usage.blockingDisbursements.sort((left, right) => left.id - right.id);
    }

    return usageByReference;
}

export async function getSupplierMemoBalances(supplierId: number): Promise<SupplierMemoBalance[]> {
    const memos = await fetchMemosForSupplier(supplierId);
    const references = memos.map((memo) => memo.memo_number).filter(Boolean);
    const usageByReference = await fetchMemoUsage(references);
    return memos.map((memo) => memoBalance(memo, usageByReference.get(memo.memo_number) || {
        appliedAmount: 0,
        blockingDisbursements: [],
    }));
}

export async function validateSupplierMemoCaps(
    supplierId: number,
    lines: MemoCapInput[],
    excludeDisbursementId?: number,
): Promise<MemoCapError | null> {
    const requested = new Map<string, number>();
    for (const line of lines) {
        const reference = normalizedReference(line.referenceNo);
        if (!reference) continue;
        const amount = asNumber(line.amount);
        if (amount === undefined || amount === 0) continue;
        requested.set(reference, roundMoney((requested.get(reference) || 0) + Math.abs(amount)));
    }

    const references = Array.from(requested.keys());
    if (references.length === 0) return null;

    // Query every submitted reference. Memo numbers are not required to have a
    // prefix, so prefix-only detection would allow numeric memo references to
    // bypass supplier, sign, and cap validation.
    const memos = await fetchMemosByReferences(references);
    const memoMap = new Map(memos.map((memo) => [normalizedReference(memo.memo_number), memo]));
    const memoReferences = references.filter((reference) => memoMap.has(reference) || looksLikeMemoReference(reference));
    if (memoReferences.length === 0) return null;

    const missing = memoReferences.find((reference) => !memoMap.has(reference));
    if (missing) {
        return {
            memoNumber: missing,
            authorizedAmount: 0,
            appliedAmount: 0,
            requestedAmount: requested.get(missing) || 0,
            remainingAmount: 0,
            message: `Supplier memo ${missing} was not found or is not available.`,
        };
    }

    const usageByReference = await fetchMemoUsage(memoReferences, excludeDisbursementId);
    for (const reference of memoReferences) {
        const memo = memoMap.get(reference);
        if (!memo) continue;
        const memoSupplierId = relationId(memo.supplier_id);
        const requestedAmount = requested.get(reference) || 0;
        const usage = usageByReference.get(reference) || {
            appliedAmount: 0,
            blockingDisbursements: [],
        };
        const appliedAmount = usage.appliedAmount;
        const balance = memoBalance(memo, usage);

        if (memoSupplierId !== supplierId) {
            return {
                memoNumber: reference,
                authorizedAmount: balance.amount,
                appliedAmount,
                requestedAmount,
                remainingAmount: balance.remainingAmount,
                isLocked: balance.isLocked,
                lockingTrDocNo: balance.lockingTrDocNo,
                lockingTrStatus: balance.lockingTrStatus,
                lockingTrCount: balance.lockingTrCount,
                message: `Supplier memo ${reference} does not belong to this supplier.`,
            };
        }

        if (balance.isLocked) {
            const blockerLabel = balance.lockingTrDocNo
                ? `${balance.lockingTrDocNo} (${balance.lockingTrStatus})`
                : "another unposted TR";
            const additionalBlockers = balance.lockingTrCount > 1
                ? ` ${balance.lockingTrCount - 1} additional TR(s) also use this memo.`
                : "";
            return {
                memoNumber: reference,
                authorizedAmount: balance.amount,
                appliedAmount,
                requestedAmount,
                remainingAmount: balance.remainingAmount,
                isLocked: true,
                lockingTrDocNo: balance.lockingTrDocNo,
                lockingTrStatus: balance.lockingTrStatus,
                lockingTrCount: balance.lockingTrCount,
                message: `Supplier memo ${reference} is locked by ${blockerLabel} and cannot be used until that TR is Posted.${additionalBlockers}`,
            };
        }

        const matchingLines = lines.filter((line) => normalizedReference(line.referenceNo) === reference);
        const expectedSign = Number(memo.type) === 1 ? -1 : 1;
        const hasWrongDirection = matchingLines.some((line) => {
            const amount = asNumber(line.amount);
            return amount !== undefined && amount !== 0 && Math.sign(amount) !== expectedSign;
        });
        if (hasWrongDirection) {
            return {
                memoNumber: reference,
                authorizedAmount: balance.amount,
                appliedAmount,
                requestedAmount,
                remainingAmount: balance.remainingAmount,
                isLocked: balance.isLocked,
                lockingTrDocNo: balance.lockingTrDocNo,
                lockingTrStatus: balance.lockingTrStatus,
                lockingTrCount: balance.lockingTrCount,
                message: `${reference} must be applied as a ${expectedSign < 0 ? "credit" : "debit"} amount.`,
            };
        }

        if (requestedAmount > balance.remainingAmount + 0.01) {
            return {
                memoNumber: reference,
                authorizedAmount: balance.amount,
                appliedAmount,
                requestedAmount,
                remainingAmount: balance.remainingAmount,
                isLocked: balance.isLocked,
                lockingTrDocNo: balance.lockingTrDocNo,
                lockingTrStatus: balance.lockingTrStatus,
                lockingTrCount: balance.lockingTrCount,
                message: `${reference} exceeds its remaining authorized amount. Requested ${requestedAmount.toFixed(2)}, remaining ${balance.remainingAmount.toFixed(2)}.`,
            };
        }
    }

    return null;
}

export async function refreshSupplierMemoStatuses(
    supplierId: number,
    references: string[],
): Promise<void> {
    const uniqueReferences = Array.from(new Set(references.map(normalizedReference).filter(Boolean)));
    if (uniqueReferences.length === 0) return;

    const [memos, usageByReference] = await Promise.all([
        fetchMemosByReferences(uniqueReferences),
        fetchMemoUsage(uniqueReferences),
    ]);

    await Promise.all(memos
        .filter((memo) => relationId(memo.supplier_id) === supplierId && String(memo.status || "").toUpperCase() !== "CANCELLED")
        .map(async (memo) => {
            const usage = usageByReference.get(memo.memo_number) || {
                appliedAmount: 0,
                blockingDisbursements: [],
            };
            const balance = memoBalance(memo, usage);
            const nextStatus = !balance.isLocked && balance.remainingAmount <= 0.01 ? "USED" : "Available";
            if (String(memo.status || "") === nextStatus) return;
            await directusFetch(`/items/suppliers_memo/${memo.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: nextStatus }),
            });
        }));
}
