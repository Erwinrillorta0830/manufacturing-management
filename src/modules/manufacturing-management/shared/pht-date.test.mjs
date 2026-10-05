import assert from "node:assert/strict";
import test from "node:test";
import { formatPhtDateTime } from "../../../app/api/manufacturing/services/core-api.service.ts";
import {
    addCalendarDaysToDateInput,
    formatPhtTimestamp,
    getPhtDateInputValue
} from "./pht-date.ts";

test("PHT date input uses the Manila calendar day around UTC midnight", () => {
    assert.equal(getPhtDateInputValue(new Date("2026-10-05T15:59:00.000Z")), "2026-10-05");
    assert.equal(getPhtDateInputValue(new Date("2026-10-05T16:00:00.000Z")), "2026-10-06");
});

test("date-only due dates add calendar days across month and year boundaries", () => {
    assert.equal(addCalendarDaysToDateInput("2026-12-28", 7), "2027-01-04");
    assert.equal(addCalendarDaysToDateInput("2026-02-31", 7), "2026-02-31");
});

test("persisted timestamp format and display are stable PHT wall-clock values", () => {
    const value = formatPhtDateTime(new Date("2026-10-05T16:30:00.000Z"));
    assert.equal(value, "2026-10-06 00:30:00");
    assert.equal(formatPhtTimestamp(value), "Oct 06, 2026 00:30:00 PHT");
    assert.equal(formatPhtTimestamp("2026-10-05T16:30:00.000Z"), "Oct 06, 2026 00:30:00 PHT");
});
