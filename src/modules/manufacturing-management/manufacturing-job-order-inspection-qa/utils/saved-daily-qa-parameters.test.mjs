import assert from "node:assert/strict";
import {
    dailyQAParameterAuditKey,
    indexSavedDailyQAParameters,
} from "./saved-daily-qa-parameters.ts";

const parametersByAudit = indexSavedDailyQAParameters([
    {
        jo_route_id: 31,
        parameter_id: 71,
        value_text: "15.075",
        value_numeric: 15.075,
        is_passed: 1,
        remarks: "Daily QA Audit | Yield Log ID: 501 | In specification",
    },
    {
        jo_route_id: 31,
        parameter_id: 72,
        value_text: "Fail",
        value_numeric: null,
        is_passed: 0,
        remarks: "Daily QA Audit | Yield Log ID: 501 | Out of specification range",
    },
    {
        jo_route_id: 31,
        parameter_id: 71,
        value_text: "22.0",
        value_numeric: 22,
        is_passed: 1,
        remarks: "Daily QA Audit | Yield Log ID: 502 | In specification",
    },
    {
        jo_route_id: 31,
        parameter_id: 73,
        value_text: null,
        value_numeric: 8.25,
        is_passed: true,
        remarks: "Daily QA Audit | Yield Log ID: 501 | In specification",
    },
    {
        jo_route_id: 32,
        parameter_id: 71,
        value_text: "9.25",
        value_numeric: 9.25,
        is_passed: 1,
        remarks: "Daily QA Audit | Yield Log ID: 501 | In specification",
    },
    {
        jo_route_id: 31,
        parameter_id: 74,
        value_text: "Should be ignored",
        value_numeric: null,
        is_passed: 1,
        remarks: "Operator checklist audit",
    },
]);

assert.deepEqual(parametersByAudit.get(dailyQAParameterAuditKey(501, 31)), [
    { parameter_id: 71, value: "15.075", is_passed: true },
    { parameter_id: 72, value: "Fail", is_passed: false },
    { parameter_id: 73, value: "8.25", is_passed: true },
]);
assert.deepEqual(parametersByAudit.get(dailyQAParameterAuditKey(502, 31)), [
    { parameter_id: 71, value: "22.0", is_passed: true },
]);
assert.deepEqual(parametersByAudit.get(dailyQAParameterAuditKey(501, 32)), [
    { parameter_id: 71, value: "9.25", is_passed: true },
]);

console.log("Saved daily QA parameter assertions passed");
