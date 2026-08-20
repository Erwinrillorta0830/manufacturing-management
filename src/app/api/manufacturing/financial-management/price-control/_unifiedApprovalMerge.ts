export const UNIFIED_FETCH_CHUNK_SIZE = 100;

export type UnifiedApprovalRowLike = {
    row_key: string;
    kind: "price_batch" | "cost_batch" | "mixed_batch" | "price_type" | "list_price";
    request_id?: number;
    batch_id?: number;
    requested_at: string | null;
};

function parseRequestedAt(value: string | null | undefined): number {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

export function compareUnifiedRows<T extends UnifiedApprovalRowLike>(a: T, b: T): number {
    const timeDiff = parseRequestedAt(b.requested_at) - parseRequestedAt(a.requested_at);
    if (timeDiff !== 0) return timeDiff;

    const kindDiff = a.kind.localeCompare(b.kind);
    if (kindDiff !== 0) return kindDiff;

    const aId = Number(a.request_id ?? a.batch_id ?? 0);
    const bId = Number(b.request_id ?? b.batch_id ?? 0);
    return bId - aId;
}

export function mergeUnifiedRows<T extends UnifiedApprovalRowLike>(
    ...rowGroups: T[][]
): T[] {
    return rowGroups.flat().sort(compareUnifiedRows);
}

export async function fetchStreamTopRows<T>(
    fetchPage: (offset: number, limit: number) => Promise<{ rows: T[]; total: number }>,
    needed: number,
    chunkSize = UNIFIED_FETCH_CHUNK_SIZE,
): Promise<{ rows: T[]; total: number }> {
    const rows: T[] = [];
    let offset = 0;
    let total = 0;

    while (rows.length < needed) {
        const remaining = needed - rows.length;
        const limit = Math.min(chunkSize, remaining);
        const page = await fetchPage(offset, limit);
        total = page.total;

        if (page.rows.length === 0) break;

        rows.push(...page.rows);
        offset += page.rows.length;

        if (page.rows.length < limit) break;
        if (offset >= total) break;
    }

    return { rows, total };
}

type SourceFetcher<T> = (offset: number, limit: number) => Promise<{ rows: T[]; total: number }>;

type SourceState<T> = {
    fetcher: SourceFetcher<T>;
    buffer: T[];
    bufferPos: number;
    directusOffset: number;
    total: number;
    exhausted: boolean;
};

function peek<T>(state: SourceState<T>): T | null {
    return state.bufferPos < state.buffer.length ? state.buffer[state.bufferPos] : null;
}

function consume<T>(state: SourceState<T>): T | null {
    if (state.bufferPos >= state.buffer.length) return null;
    return state.buffer[state.bufferPos++];
}

async function ensureBuffered<T>(state: SourceState<T>): Promise<void> {
    if (state.exhausted) return;
    if (state.bufferPos < state.buffer.length) return;

    state.buffer = [];
    state.bufferPos = 0;

    const page = await state.fetcher(state.directusOffset, UNIFIED_FETCH_CHUNK_SIZE);
    state.total = page.total;
    state.buffer = page.rows.slice().sort(compareUnifiedRows as (a: T, b: T) => number);

    if (page.rows.length === 0) {
        state.exhausted = true;
        return;
    }

    state.directusOffset += page.rows.length;
    if (state.directusOffset >= state.total) {
        state.exhausted = true;
    }
}

export async function fetchMergedUnifiedPage<T extends UnifiedApprovalRowLike>(
    page: number,
    pageSize: number,
    sources: Array<SourceFetcher<T> | null>,
): Promise<{ rows: T[]; total: number }> {
    // Defensive guards against malformed / NaN inputs
    const safePage = Number.isFinite(page) && page >= 1 ? Math.round(page) : 1;
    const safePageSize = Number.isFinite(pageSize) && pageSize >= 1 ? Math.round(pageSize) : 50;
    const skipCount = (safePage - 1) * safePageSize;
    if (!Number.isFinite(skipCount) || skipCount < 0) return { rows: [], total: 0 };

    const activeSources: Array<SourceState<T>> = [];

    for (const fetcher of sources) {
        if (!fetcher) continue;
        const state: SourceState<T> = {
            fetcher,
            buffer: [],
            bufferPos: 0,
            directusOffset: 0,
            total: 0,
            exhausted: false,
        };
        await ensureBuffered(state);
        if (state.exhausted && state.buffer.length === 0) continue;
        activeSources.push(state);
    }

    // Get total counts from all sources
    const totalCount = activeSources.reduce((sum, s) => sum + s.total, 0);
    const result: T[] = [];
    let emitted = 0;
    let skipped = 0;

    while (activeSources.length > 0) {
        // Recharge any exhausted sources that have fallen behind
        for (const s of activeSources) {
            await ensureBuffered(s);
        }

        // Remove truly exhausted sources (empty buffer, no more data)
        for (let i = activeSources.length - 1; i >= 0; i--) {
            if (activeSources[i].exhausted && activeSources[i].buffer.length === 0) {
                activeSources.splice(i, 1);
            }
        }

        if (activeSources.length === 0) break;

        // Find the source with the smallest row (best according to compareUnifiedRows)
        let bestIdx = 0;
        for (let i = 1; i < activeSources.length; i++) {
            const a = peek(activeSources[bestIdx]);
            const b = peek(activeSources[i]);
            if (a === null) { bestIdx = i; continue; }
            if (b === null) continue;
            if (compareUnifiedRows(a, b) > 0) bestIdx = i;
        }

        const best = peek(activeSources[bestIdx]);
        if (best === null) {
            activeSources.splice(bestIdx, 1);
            continue;
        }

        if (skipped >= skipCount) {
            result.push(consume(activeSources[bestIdx])!);
            emitted++;
            if (emitted >= pageSize) break;
        } else {
            consume(activeSources[bestIdx]);
            skipped++;
        }
    }

    return { rows: result, total: totalCount };
}
