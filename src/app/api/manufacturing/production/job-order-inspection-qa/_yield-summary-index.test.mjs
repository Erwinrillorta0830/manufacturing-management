import assert from "node:assert/strict";
import test from "node:test";
import { buildYieldSummaryIndex } from "./_yield-summary-index.ts";

function summarize(rows) {
    return buildYieldSummaryIndex(
        rows,
        (row) => row.jobOrderId,
        (row) => row.loggedAt || row.productionDate
    );
}

test("counts interleaved yields and keeps the latest timestamp per Job Order", () => {
    const summaries = summarize([
        { jobOrderId: 10, loggedAt: "2026-10-10T08:00:00Z" },
        { jobOrderId: 20, productionDate: "2026-10-11" },
        { jobOrderId: 10, productionDate: "2026-10-12T08:00:00Z" },
    ]);

    assert.deepEqual(summaries.get(10), {
        count: 2,
        latestYieldAt: "2026-10-12T08:00:00Z",
        latestTimestamp: Date.parse("2026-10-12T08:00:00Z"),
    });
    assert.deepEqual(summaries.get(20), {
        count: 1,
        latestYieldAt: "2026-10-11",
        latestTimestamp: Date.parse("2026-10-11"),
    });
});

test("uses logged time before production date and keeps the first row on timestamp ties", () => {
    const summaries = summarize([
        { jobOrderId: 10, loggedAt: "2026-10-12T08:00:00Z", productionDate: "2026-10-10" },
        { jobOrderId: 10, loggedAt: "2026-10-12T10:00:00+02:00", productionDate: "2026-10-11" },
    ]);

    assert.equal(summaries.get(10)?.count, 2);
    assert.equal(summaries.get(10)?.latestYieldAt, "2026-10-12T08:00:00Z");
});

test("keeps the first invalid timestamp until a parseable newer timestamp appears", () => {
    const summaries = summarize([
        { jobOrderId: 10, loggedAt: "invalid" },
        { jobOrderId: 10, loggedAt: "" },
        { jobOrderId: 20, loggedAt: "invalid" },
        { jobOrderId: 20, productionDate: "2026-10-12" },
    ]);

    assert.equal(summaries.get(10)?.count, 2);
    assert.equal(summaries.get(10)?.latestYieldAt, "invalid");
    assert.equal(summaries.get(20)?.latestYieldAt, "2026-10-12");
});
