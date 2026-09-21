import { cookies } from "next/headers";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LotTransferError } from "./_errors";
import type { RecordValue } from "./_directus";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL?.trim().replace(/\/+$/, "");

export interface LiveLotBalance {
    sourceBatchFound: boolean;
    sourceBatchOnHand: number;
    targetBatchFound: boolean;
    targetBatchOnHand: number;
    sourceLotOccupied: number;
    targetLotOccupied: number;
}

interface LiveLotBalanceInput {
    branchId: number;
    sourceLotId: number;
    sourceProductId: number;
    sourceInventoryLotId: number;
    sourceBatchNo: string;
    targetLotId: number;
    targetProductId: number;
    targetInventoryLotId: number;
    targetBatchNo: string;
}

function isRecord(value: unknown): value is RecordValue {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numeric(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function firstValue(row: RecordValue, keys: string[]): unknown {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    return undefined;
}

function normalizedBatch(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

function rowBranchId(row: RecordValue): number {
    return numeric(firstValue(row, ["branchId", "branch_id"]));
}

function rowLotId(row: RecordValue): number {
    return numeric(firstValue(row, ["mmLotId", "mm_lot_id", "lotId", "lot_id"]));
}

function rowProductId(row: RecordValue): number {
    return numeric(firstValue(row, ["productId", "product_id"]));
}

function rowInventoryLotId(row: RecordValue): number {
    return numeric(firstValue(row, ["inventoryLotId", "inventory_lot_id"]));
}

function rowBatchNo(row: RecordValue): string {
    return String(firstValue(row, ["batchNo", "batch_no"]) ?? "").trim();
}

function rowOnHand(row: RecordValue): number {
    return numeric(firstValue(row, ["onhandQuantity", "onhand_quantity", "quantity"]));
}

function positiveQuantity(rows: RecordValue[]): number {
    return rows.reduce((sum, row) => sum + Math.max(0, rowOnHand(row)), 0);
}

function tokenFromFile(): string | undefined {
    try {
        const tokenPath = resolve(process.cwd(), "node_modules/.cache/vos-tokens/latest_token.txt");
        if (!existsSync(tokenPath)) return undefined;
        const token = readFileSync(tokenPath, "utf8").trim();
        return token || undefined;
    } catch {
        return undefined;
    }
}

async function springHeaders(): Promise<Record<string, string>> {
    let token: string | undefined;
    try {
        const cookieStore = await cookies();
        token =
            cookieStore.get("vos_access_token")?.value ||
            cookieStore.get("springboot_token")?.value ||
            cookieStore.get("token")?.value;
    } catch {
        // Requests outside a Next request context can still use the local token cache.
    }
    token ||= tokenFromFile();

    const requestHeaders: Record<string, string> = { Accept: "application/json" };
    if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
        requestHeaders.Cookie = `vos_access_token=${token}`;
    }
    return requestHeaders;
}

async function readLiveRows(): Promise<RecordValue[]> {
    if (!SPRING_API_BASE) {
        throw new LotTransferError(503, "Live batch on-hand service is not configured. Refresh and retry.");
    }

    let response: Response;
    try {
        response = await fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/all`, {
            headers: await springHeaders(),
            cache: "no-store"
        });
    } catch (error) {
        throw new LotTransferError(503, "Live batch on-hand service could not be reached. Refresh and retry.", {
            cause: error instanceof Error ? error.message : String(error)
        });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new LotTransferError(503, `Live batch on-hand lookup failed with HTTP ${response.status}. Refresh and retry.`, {
            upstreamStatus: response.status
        });
    }

    const rows = Array.isArray(payload)
        ? payload
        : isRecord(payload) && Array.isArray(payload.data)
            ? payload.data
            : null;
    if (!rows) {
        throw new LotTransferError(502, "Live batch on-hand service returned an invalid response.");
    }
    return rows.filter(isRecord);
}

function matchingBatchRows(
    rows: RecordValue[],
    input: { lotId: number; productId: number; inventoryLotId: number; batchNo: string }
): RecordValue[] {
    const baseRows = rows.filter((row) =>
        rowLotId(row) === input.lotId
        && rowProductId(row) === input.productId
        && normalizedBatch(rowBatchNo(row)) === normalizedBatch(input.batchNo)
    );
    if (input.inventoryLotId <= 0) return baseRows;

    const exactRows = baseRows.filter((row) => rowInventoryLotId(row) === input.inventoryLotId);
    if (exactRows.length > 0) return exactRows;

    // Do not use another known inventory-lot row for the selected batch. A row
    // without an inventory-lot identity is only a safe fallback when no
    // conflicting identity was supplied by the live projection.
    if (baseRows.some((row) => rowInventoryLotId(row) > 0)) return [];
    return baseRows;
}

export async function readLiveLotBalance(input: LiveLotBalanceInput): Promise<LiveLotBalance> {
    const rows = await readLiveRows();
    const branchRows = rows.filter((row) => rowBranchId(row) === input.branchId);
    const sourceLotRows = branchRows.filter((row) => rowLotId(row) === input.sourceLotId);
    const targetLotRows = branchRows.filter((row) => rowLotId(row) === input.targetLotId);
    const sourceBatchRows = matchingBatchRows(sourceLotRows, {
        lotId: input.sourceLotId,
        productId: input.sourceProductId,
        inventoryLotId: input.sourceInventoryLotId,
        batchNo: input.sourceBatchNo
    });
    const targetBatchRows = matchingBatchRows(targetLotRows, {
        lotId: input.targetLotId,
        productId: input.targetProductId,
        inventoryLotId: input.targetInventoryLotId,
        batchNo: input.targetBatchNo
    });

    return {
        sourceBatchFound: sourceBatchRows.length > 0,
        sourceBatchOnHand: positiveQuantity(sourceBatchRows),
        targetBatchFound: targetBatchRows.length > 0,
        targetBatchOnHand: positiveQuantity(targetBatchRows),
        sourceLotOccupied: positiveQuantity(sourceLotRows),
        targetLotOccupied: positiveQuantity(targetLotRows)
    };
}
