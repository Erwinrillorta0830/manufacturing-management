export type ApprovalSearchParse = {
    raw: string;
    numericId: number | null;
    batchHeaderId: number | null;
    costRequestId: number | null;
    priceRequestId: number | null;
    textContains: string | null;
};

const PREFIX_RE = /^(PCB|CCR|PCR)-(\d+)$/i;

function toPositiveInt(value: string): number | null {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.trunc(n);
}

export function parseApprovalSearchQuery(q: string): ApprovalSearchParse {
    const raw = String(q ?? "").trim();
    const empty: ApprovalSearchParse = {
        raw,
        numericId: null,
        batchHeaderId: null,
        costRequestId: null,
        priceRequestId: null,
        textContains: null,
    };

    if (!raw) return empty;

    const prefixMatch = raw.match(PREFIX_RE);
    if (prefixMatch) {
        const id = toPositiveInt(prefixMatch[2]);
        const prefix = prefixMatch[1].toUpperCase();

        return {
            raw,
            numericId: null,
            batchHeaderId: prefix === "PCB" ? id : null,
            costRequestId: prefix === "CCR" ? id : null,
            priceRequestId: prefix === "PCR" ? id : null,
            textContains: null,
        };
    }

    const numericId = toPositiveInt(raw);

    return {
        raw,
        numericId,
        batchHeaderId: numericId,
        costRequestId: numericId,
        priceRequestId: numericId,
        textContains: raw,
    };
}

function isPrefixedSingleStreamSearch(parsed: ApprovalSearchParse): "price" | "cost" | null {
    if (parsed.numericId != null || parsed.textContains != null) return null;

    const hasPrice = parsed.priceRequestId != null;
    const hasCost = parsed.costRequestId != null;
    const hasBatch = parsed.batchHeaderId != null;

    if (hasPrice && !hasCost && !hasBatch) return "price";
    if (hasCost && !hasPrice && !hasBatch) return "cost";
    return null;
}

/** Unified All tab: skip price stream when search is CCR-{id} only. */
export function shouldFetchPriceStreamInUnifiedSearch(parsed: ApprovalSearchParse): boolean {
    return isPrefixedSingleStreamSearch(parsed) !== "cost";
}

/** Unified All tab: skip cost stream when search is PCR-{id} only. */
export function shouldFetchCostStreamInUnifiedSearch(parsed: ApprovalSearchParse): boolean {
    return isPrefixedSingleStreamSearch(parsed) !== "price";
}
