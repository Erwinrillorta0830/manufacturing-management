const QUANTITY_EPSILON = 0.000001;

const jobOrderQuantityLocks = new Map<number, Promise<void>>();

export class ParentYieldQuantitySyncError extends Error {
    readonly code = "QA_PARENT_QUANTITY_SYNC_FAILED";
    readonly status = 503;
    readonly jobOrderId: number;
    readonly ledgerId: number | null;
    readonly delta: number;

    constructor(
        jobOrderId: number,
        ledgerId: number | null,
        delta: number,
        detail?: string
    ) {
        super(
            `Could not sync actual_quantity_produced for Job Order ${jobOrderId}`
            + `${ledgerId ? `, yield ledger ${ledgerId}` : ""}, delta ${delta}.`
            + (detail ? ` ${detail}` : " The QA result may have saved; reconcile the parent quantity before retrying.")
        );
        this.name = "ParentYieldQuantitySyncError";
        this.jobOrderId = jobOrderId;
        this.ledgerId = ledgerId;
        this.delta = delta;
    }
}

export async function acquireJobOrderActualQuantityLock(jobOrderId: number): Promise<() => void> {
    const previous = jobOrderQuantityLocks.get(jobOrderId) || Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
        releaseCurrent = resolve;
    });
    jobOrderQuantityLocks.set(jobOrderId, current);
    await previous;

    let released = false;
    return () => {
        if (released) return;
        released = true;
        if (jobOrderQuantityLocks.get(jobOrderId) === current) {
            jobOrderQuantityLocks.delete(jobOrderId);
        }
        releaseCurrent();
    };
}

export async function withJobOrderActualQuantityLock<T>(
    jobOrderId: number,
    operation: () => Promise<T>
): Promise<T> {
    const release = await acquireJobOrderActualQuantityLock(jobOrderId);
    try {
        return await operation();
    } finally {
        release();
    }
}

export interface ParentQuantitySyncClient {
    readCurrentQuantity: () => Promise<unknown>;
    writeQuantity: (quantity: number) => Promise<void>;
}

export async function applyParentQuantityDeltaWhileLocked(
    jobOrderId: number,
    ledgerId: number | null,
    delta: number,
    client: ParentQuantitySyncClient
): Promise<number> {
    if (!Number.isFinite(delta)) {
        throw new ParentYieldQuantitySyncError(jobOrderId, ledgerId, delta, "The requested quantity delta is invalid.");
    }
    if (Math.abs(delta) < QUANTITY_EPSILON) return 0;

    let previousQuantity: number;
    try {
        previousQuantity = Number((await client.readCurrentQuantity()) ?? 0);
    } catch (error) {
        throw new ParentYieldQuantitySyncError(
            jobOrderId,
            ledgerId,
            delta,
            `The current parent quantity could not be read${error instanceof Error ? `: ${error.message}` : "."}`
        );
    }
    if (!Number.isFinite(previousQuantity)) {
        throw new ParentYieldQuantitySyncError(jobOrderId, ledgerId, delta, "The current parent quantity is invalid.");
    }

    const nextQuantity = Math.round((previousQuantity + delta) * 1_000_000) / 1_000_000;
    if (nextQuantity < -QUANTITY_EPSILON) {
        throw new ParentYieldQuantitySyncError(jobOrderId, ledgerId, delta, "The delta would make the parent quantity negative.");
    }
    const expectedQuantity = Math.max(0, nextQuantity);
    if (Math.abs(expectedQuantity - previousQuantity) < QUANTITY_EPSILON) return expectedQuantity;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            await client.writeQuantity(expectedQuantity);
        } catch {
            // Read-after-write determines whether this write applied before deciding to retry.
        }

        let persistedQuantity: number;
        try {
            persistedQuantity = Number((await client.readCurrentQuantity()) ?? 0);
        } catch (error) {
            throw new ParentYieldQuantitySyncError(
                jobOrderId,
                ledgerId,
                delta,
                `The parent quantity write could not be verified${error instanceof Error ? `: ${error.message}` : "."}`
            );
        }

        if (Number.isFinite(persistedQuantity) && Math.abs(persistedQuantity - expectedQuantity) < QUANTITY_EPSILON) {
            return expectedQuantity;
        }
        if (attempt === 0 && Number.isFinite(persistedQuantity) && Math.abs(persistedQuantity - previousQuantity) < QUANTITY_EPSILON) {
            continue;
        }

        throw new ParentYieldQuantitySyncError(
            jobOrderId,
            ledgerId,
            delta,
            `The parent quantity is ${Number.isFinite(persistedQuantity) ? persistedQuantity : "invalid"}; expected ${expectedQuantity}.`
        );
    }

    throw new ParentYieldQuantitySyncError(jobOrderId, ledgerId, delta);
}

export async function applyParentQuantityDelta(
    jobOrderId: number,
    ledgerId: number | null,
    delta: number,
    client: ParentQuantitySyncClient
): Promise<number> {
    return withJobOrderActualQuantityLock(
        jobOrderId,
        () => applyParentQuantityDeltaWhileLocked(jobOrderId, ledgerId, delta, client)
    );
}
