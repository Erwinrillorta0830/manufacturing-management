import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/procurement/_directus";

export const QA_RESULTS_COLLECTION = "purchase_order_receiving_qa_results";

export interface QaResultInput {
    spec_id: number;
    actual_reading: string;
    is_passed: boolean;
}

export interface QaResultExpectation {
    spec_id: number;
    actual_reading: string;
    is_passed?: boolean;
}

export interface QaResultRow {
    result_id: number;
    receiving_line_id: number;
    spec_id: number;
    actual_reading: string;
    is_passed: boolean;
}

export class QaResultPersistenceError extends Error {
    constructor(readonly status: 409 | 422 | 503, message: string) {
        super(message);
    }
}

function relationId(value: unknown, key: string): number {
    return Number(value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value);
}

function passedValue(value: unknown): boolean | null {
    if (value === true || value === 1 || value === "1" || value === "true") return true;
    if (value === false || value === 0 || value === "0" || value === "false") return false;
    return null;
}

function parseRows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

function normalizeRow(row: Record<string, unknown>): QaResultRow {
    const resultId = Number(row.result_id);
    const receivingLineId = relationId(row.receiving_line_id, "purchase_order_product_id");
    const specId = relationId(row.spec_id, "spec_id");
    const isPassed = passedValue(row.is_passed);
    if (![resultId, receivingLineId, specId].every(id => Number.isSafeInteger(id) && id > 0)
        || isPassed === null
        || typeof row.actual_reading !== "string") {
        throw new QaResultPersistenceError(409, "A persisted QA result has invalid identity or evaluation data.");
    }
    return {
        result_id: resultId,
        receiving_line_id: receivingLineId,
        spec_id: specId,
        actual_reading: row.actual_reading,
        is_passed: isPassed
    };
}

async function readRows(path: string): Promise<QaResultRow[]> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new QaResultPersistenceError(503, "Unable to verify persisted QA results.");
    }
    return parseRows(await response.json()).map(normalizeRow);
}

export async function fetchQaResults(receivingLineIds: number[]): Promise<QaResultRow[]> {
    const ids = [...new Set(receivingLineIds.filter(id => Number.isSafeInteger(id) && id > 0))];
    if (ids.length === 0) return [];
    const params = new URLSearchParams({
        "filter[receiving_line_id][_in]": ids.join(","),
        fields: "result_id,receiving_line_id,spec_id,actual_reading,is_passed",
        limit: "-1"
    });
    return readRows(`/items/${QA_RESULTS_COLLECTION}?${params.toString()}`);
}

function expectedKey(result: QaResultExpectation): string {
    return `${result.spec_id}:${result.actual_reading}`;
}

export function qaResultsMatch(expected: QaResultExpectation[], actual: QaResultRow[]): boolean {
    if (expected.length !== actual.length) return false;
    const actualBySpec = new Map<number, QaResultRow>();
    for (const row of actual) {
        if (actualBySpec.has(row.spec_id)) return false;
        actualBySpec.set(row.spec_id, row);
    }
    const expectedKeys = new Set<string>();
    for (const result of expected) {
        if (expectedKeys.has(expectedKey(result))) return false;
        expectedKeys.add(expectedKey(result));
        const persisted = actualBySpec.get(result.spec_id);
        if (!persisted || persisted.actual_reading !== result.actual_reading) return false;
        if (result.is_passed !== undefined && persisted.is_passed !== result.is_passed) return false;
    }
    return true;
}

async function assertSpecificationsBelongToProduct(productId: number, results: QaResultInput[]) {
    if (results.length === 0) return;
    const specIds = [...new Set(results.map(result => result.spec_id))];
    if (specIds.length !== results.length) {
        throw new QaResultPersistenceError(422, "Duplicate QA specifications are not allowed.");
    }
    const params = new URLSearchParams({
        "filter[spec_id][_in]": specIds.join(","),
        fields: "spec_id,product_id",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/product_qa_specs?${params.toString()}`, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new QaResultPersistenceError(503, "Unable to verify QA specification configuration.");
    }
    const rows = parseRows(await response.json());
    const specProductIds = new Map(rows.map(row => [relationId(row.spec_id, "spec_id"), relationId(row.product_id, "product_id")]));
    if (specProductIds.size !== specIds.length || specIds.some(specId => specProductIds.get(specId) !== productId)) {
        throw new QaResultPersistenceError(422, "A QA result references a specification for a different product.");
    }
}

export async function ensureQaResults(args: {
    receivingLineId: number;
    productId: number;
    results: QaResultInput[];
}): Promise<number[]> {
    const { receivingLineId, productId, results } = args;
    if (!Number.isSafeInteger(receivingLineId) || receivingLineId <= 0 || !Number.isSafeInteger(productId) || productId <= 0) {
        throw new QaResultPersistenceError(422, "QA result references an invalid receiving line or product.");
    }
    await assertSpecificationsBelongToProduct(productId, results);

    const params = new URLSearchParams({
        "filter[receiving_line_id][_eq]": String(receivingLineId),
        fields: "result_id,receiving_line_id,spec_id,actual_reading,is_passed",
        limit: "-1"
    });
    const existing = await readRows(`/items/${QA_RESULTS_COLLECTION}?${params.toString()}`);
    if (qaResultsMatch(results, existing)) return existing.map(row => row.result_id);
    if (results.length === 0 && existing.length > 0) {
        throw new QaResultPersistenceError(409, `Receiving line ${receivingLineId} has unexpected QA results.`);
    }

    const existingBySpec = new Map<number, QaResultRow>();
    for (const row of existing) {
        if (existingBySpec.has(row.spec_id)) {
            throw new QaResultPersistenceError(409, `Receiving line ${receivingLineId} has duplicate QA results.`);
        }
        existingBySpec.set(row.spec_id, row);
    }

    for (const result of results) {
        const persisted = existingBySpec.get(result.spec_id);
        if (persisted && (persisted.actual_reading !== result.actual_reading || persisted.is_passed !== result.is_passed)) {
            throw new QaResultPersistenceError(409, `QA result for receiving line ${receivingLineId}, specification ${result.spec_id} conflicts with the existing record.`);
        }
    }

    const missing = results
        .filter(result => !existingBySpec.has(result.spec_id))
        .map(result => ({
            receiving_line_id: receivingLineId,
            spec_id: result.spec_id,
            actual_reading: result.actual_reading,
            is_passed: result.is_passed ? 1 : 0
        }));
    if (missing.length > 0) {
        const response = await fetch(`${DIRECTUS_URL}/items/${QA_RESULTS_COLLECTION}`, {
            method: "POST",
            headers,
            body: JSON.stringify(missing)
        });
        if (!response.ok) {
            const verified = await readRows(`/items/${QA_RESULTS_COLLECTION}?${params.toString()}`);
            if (!qaResultsMatch(results, verified)) {
                throw new QaResultPersistenceError(503, "QA results could not be persisted completely.");
            }
        }
    }

    const persisted = await readRows(`/items/${QA_RESULTS_COLLECTION}?${params.toString()}`);
    if (!qaResultsMatch(results, persisted)) {
        throw new QaResultPersistenceError(503, `QA results for receiving line ${receivingLineId} are incomplete.`);
    }
    return persisted.map(row => row.result_id);
}
