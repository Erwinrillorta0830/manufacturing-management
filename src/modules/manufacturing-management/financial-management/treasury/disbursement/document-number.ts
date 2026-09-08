import { DirectusList } from "@/modules/manufacturing-management/financial-management/cash-issuance/services/disbursement.types";

const locks = new Map<string | number, Promise<void>>();

export const acquireDocumentNumberLock = async (transactionTypeId: number | string) => {
    const key = String(transactionTypeId);
    while (locks.has(key)) {
        await locks.get(key);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
        resolveLock = resolve;
    });
    locks.set(key, lockPromise);

    return () => {
        locks.delete(key);
        resolveLock();
    };
};

export const releaseDocumentNumberLock = async (lock?: unknown) => {
    if (typeof lock === "function") {
        lock();
    }
};

type FetcherFunc = <T>(path: string, options?: RequestInit) => Promise<T>;

export const findNextAvailableDocumentNumber = async (
    transactionTypeId: number | string,
    fetcher?: unknown
): Promise<string> => {
    let docNumbers: string[] = [];

    if (typeof fetcher === "function") {
        try {
            const res = await (fetcher as FetcherFunc)<DirectusList<{ doc_no?: string }>>(
                "/items/disbursement?fields=doc_no&limit=-1"
            );
            if (res?.data && Array.isArray(res.data)) {
                docNumbers = res.data.map((row) => String(row.doc_no || "").trim());
            }
        } catch (e) {
            console.warn("Failed to fetch existing document numbers:", e);
        }
    }

    let maxSeq = 0;
    const regex = /^DOC-(\d+)$/i;

    for (const docNo of docNumbers) {
        const match = regex.exec(docNo);
        if (match) {
            const seq = parseInt(match[1], 10);
            if (!isNaN(seq) && seq > maxSeq) {
                maxSeq = seq;
            }
        }
    }

    const nextSeq = maxSeq + 1;
    return `DOC-${String(nextSeq).padStart(4, "0")}`;
};

export const isDocumentNumberConflictError = (error: unknown): boolean => {
    if (!error) return false;
    const msg = String(typeof error === "object" && error !== null && "message" in error ? (error as { message?: string }).message : error).toLowerCase();
    return msg.includes("unique constraint") || msg.includes("duplicate") || msg.includes("doc_no") || msg.includes("record already exists");
};

