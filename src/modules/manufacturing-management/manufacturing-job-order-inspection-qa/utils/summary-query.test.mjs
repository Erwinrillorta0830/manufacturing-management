import assert from "node:assert/strict";
import test from "node:test";
import { buildJobOrderDailyYieldSummaryPage } from "./summary-query.ts";

const rows = [
    {
        jobOrderId: 1,
        jobOrderNo: "JO-001",
        status: "For QA and Reconciliation",
        productId: 10,
        productName: "Orange Oil",
        productCode: "OO-01",
        latestYieldAt: "2026-10-12 00:30:00",
        unresolvedYieldCount: 1,
        pendingYieldCount: 1,
        discrepancyYieldCount: 0,
    },
    {
        jobOrderId: 2,
        jobOrderNo: "JO-002",
        status: "Closed",
        productId: 20,
        productName: "Palm Oil",
        productCode: "PO-01",
        latestYieldAt: "2026-10-11T16:30:00.000Z",
        unresolvedYieldCount: 0,
        pendingYieldCount: 0,
        discrepancyYieldCount: 0,
    },
    {
        jobOrderId: 3,
        jobOrderNo: "JO-003",
        status: "Closed",
        productId: 10,
        productName: "Orange Oil",
        productCode: "OO-01",
        latestYieldAt: "2026-10-10 09:00:00",
        unresolvedYieldCount: 2,
        pendingYieldCount: 0,
        discrepancyYieldCount: 2,
    },
];

function query(overrides = {}) {
    return {
        page: 1,
        pageSize: 8,
        search: "",
        status: "",
        productId: "",
        dateFrom: "",
        dateTo: "",
        flaggedOnly: false,
        ...overrides,
    };
}

test("returns page rows and global facets separately", () => {
    const result = buildJobOrderDailyYieldSummaryPage(rows, query());

    assert.deepEqual(result.data.map((row) => row.jobOrderId), [2, 1, 3]);
    assert.equal(result.meta.total, 3);
    assert.equal(result.meta.totalPages, 1);
    assert.equal(result.facets.totalAvailable, 3);
    assert.equal(result.facets.unresolvedJobOrderCount, 2);
    assert.deepEqual(result.facets.statusOptions, ["Closed", "For QA and Reconciliation"]);
    assert.deepEqual(result.facets.productOptions, [
        { value: "10", label: "Orange Oil" },
        { value: "20", label: "Palm Oil" },
    ]);
});

test("applies search, status, product, and flagged filters together", () => {
    const result = buildJobOrderDailyYieldSummaryPage(rows, query({
        search: "oo-01",
        status: "Closed",
        productId: "10",
        flaggedOnly: true,
    }));

    assert.deepEqual(result.data.map((row) => row.jobOrderId), [3]);
    assert.equal(result.meta.total, 1);
    assert.equal(result.facets.totalAvailable, 3);
    assert.equal(result.facets.unresolvedJobOrderCount, 2);
});

test("prioritizes discrepancy and pending counts in the needs-review queue", () => {
    const result = buildJobOrderDailyYieldSummaryPage(rows, query({ flaggedOnly: true }));

    assert.deepEqual(result.data.map((row) => row.jobOrderId), [3, 1]);
});

test("uses inclusive Philippine calendar dates for date filtering", () => {
    const result = buildJobOrderDailyYieldSummaryPage(rows, query({
        dateFrom: "2026-10-12",
        dateTo: "2026-10-12",
    }));

    assert.deepEqual(result.data.map((row) => row.jobOrderId), [2, 1]);
});

test("clamps pages beyond the filtered result and rejects unsupported page sizes", () => {
    const result = buildJobOrderDailyYieldSummaryPage(rows, query({ page: 99, pageSize: 100 }));

    assert.equal(result.meta.page, 1);
    assert.equal(result.meta.pageSize, 8);
    assert.equal(result.meta.totalPages, 1);
    assert.deepEqual(result.data.map((row) => row.jobOrderId), [2, 1, 3]);
});

test("keeps global counts while returning an empty filtered page", () => {
    const result = buildJobOrderDailyYieldSummaryPage(rows, query({ search: "missing" }));

    assert.deepEqual(result.data, []);
    assert.equal(result.meta.total, 0);
    assert.equal(result.meta.totalPages, 1);
    assert.equal(result.facets.totalAvailable, 3);
    assert.equal(result.facets.unresolvedJobOrderCount, 2);
});
