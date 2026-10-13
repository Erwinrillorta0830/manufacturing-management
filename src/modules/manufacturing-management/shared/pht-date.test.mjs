import assert from "node:assert/strict";
import test from "node:test";
import { formatPhtDateTime } from "../../../app/api/manufacturing/services/core-api.service.ts";
import {
    addCalendarDaysToDateInput,
    formatPhtTimestamp,
    formatPhtTimestamp12Hour,
    formatPhtTime12Hour,
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

test("12-hour PHT timestamps include AM/PM and preserve date and timezone", () => {
    assert.equal(formatPhtTimestamp12Hour("2026-10-12 14:24:59"), "Oct 12, 2026 2:24:59 PM PHT");
    assert.equal(formatPhtTimestamp12Hour("2026-10-12T06:24:59.000Z"), "Oct 12, 2026 2:24:59 PM PHT");
    assert.equal(formatPhtTimestamp12Hour("2026-10-12 00:04:05"), "Oct 12, 2026 12:04:05 AM PHT");
    assert.equal(formatPhtTimestamp12Hour("2026-10-12 12:04:05"), "Oct 12, 2026 12:04:05 PM PHT");
    assert.equal(formatPhtTimestamp12Hour(null), "N/A");
});

test("12-hour PHT time-only format displays AM/PM without date or timezone suffix", () => {
    assert.equal(formatPhtTime12Hour("2026-10-12 14:24:59"), "2:24:59 PM");
    assert.equal(formatPhtTime12Hour("2026-10-12 00:04:05"), "12:04:05 AM");
    assert.equal(formatPhtTime12Hour("2026-10-12 12:04:05"), "12:04:05 PM");
    assert.equal(formatPhtTime12Hour(null), "");
});
