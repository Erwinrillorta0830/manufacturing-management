import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
registerHooks({
    resolve(specifier, context, nextResolve) {
        const isAlias = specifier.startsWith("@/");
        const isExtensionlessRelative = specifier.startsWith(".") && !/\.(?:mjs|cjs|js|tsx?|jsx?)$/.test(specifier);
        if (!isAlias && !isExtensionlessRelative) return nextResolve(specifier, context);

        const basePath = isAlias
            ? path.resolve(sourceRoot, specifier.slice(2))
            : fileURLToPath(new URL(specifier, context.parentURL));
        const target = [basePath, ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => `${basePath}${extension}`)]
            .find((candidate) => existsSync(candidate));
        return nextResolve(pathToFileURL(target || basePath).href, context);
    }
});

const { buildQAYieldAssessments, isCommittedYieldLedger, verifiedYieldOutputTotalsByJobOrder } = await import("./_qa-accepted-output.ts");
const { qaRecordAfterRevocation, releasedYieldGoodQuantity, releasedYieldQuantityDelta, yieldAuditRowsAfterRevocation } = await import("./qa-release.ts");

assert.equal(isCommittedYieldLedger({ commit_status: "COMMITTED" }), true);
assert.equal(isCommittedYieldLedger({ commit_status: null }), true);
assert.equal(isCommittedYieldLedger({ commit_status: "PENDING" }), false);
assert.equal(isCommittedYieldLedger({ commit_status: "FAILED" }), false);

const assessments = buildQAYieldAssessments([
    { ledger_id: 1, job_order_id: 10, yield_quantity: 100, commit_status: "COMMITTED" },
    { ledger_id: 2, job_order_id: 10, yield_quantity: 300, commit_status: "PENDING" },
    { ledger_id: 3, job_order_id: 10, yield_quantity: 50 }
], [], []);

assert.deepEqual(assessments.map((assessment) => assessment.ledgerId), [1, 3]);

assert.equal(releasedYieldGoodQuantity({ qa_status: "Passed", qa_accepted_quantity: 2, yield_quantity: 3 }), 2);
assert.equal(releasedYieldGoodQuantity({ qa_status: "Passed", qa_accepted_quantity: null, yield_quantity: 3 }), 3);
assert.equal(releasedYieldGoodQuantity({ qa_status: "Pending", qa_accepted_quantity: 2, yield_quantity: 3 }), 0);
assert.equal(releasedYieldQuantityDelta(
    { qa_status: "Pending", qa_accepted_quantity: 2 },
    { qa_status: "Passed", qa_accepted_quantity: 2 }
), 2);
assert.equal(releasedYieldQuantityDelta(
    { qa_status: "Passed", qa_accepted_quantity: 2 },
    { qa_status: "Pending", qa_accepted_quantity: 2 }
), -2);
assert.equal(releasedYieldQuantityDelta(
    { qa_status: "Passed", qa_accepted_quantity: 2 },
    { qa_status: "Passed", qa_accepted_quantity: 2 }
), 0);
assert.deepEqual(yieldAuditRowsAfterRevocation(
    { qa_revoked_through_audit_id: 12 },
    [{ daily_qa_id: 10 }, { daily_qa_id: 13 }]
), [{ daily_qa_id: 13 }]);
assert.equal(qaRecordAfterRevocation({ inspected_at: "2026-10-16 10:00:01" }, "2026-10-16 10:00:00"), true);
assert.equal(qaRecordAfterRevocation({ inspected_at: "2026-10-16 10:00:00" }, "2026-10-16 10:00:00"), false);

const releaseAssessment = buildQAYieldAssessments([
    { ledger_id: 4, job_order_id: 10, yield_quantity: 3, qa_accepted_quantity: 2, qa_rejected_quantity: 1, qa_status: "Passed" }
], [{
    daily_qa_id: 14,
    ledger_id: 4,
    sensory_status: "Passed",
    lab_status: "Passed",
    action_taken: "Released",
    weight_check_passed: 1
}], []);
assert.equal(releaseAssessment[0].acceptedQuantity, 2);
assert.equal(releaseAssessment[0].qaRejectedQuantity, 1);

const verifiedTotals = verifiedYieldOutputTotalsByJobOrder([
    releaseAssessment[0],
    { ...releaseAssessment[0], ledgerId: 40, acceptedQuantity: 8, qaRejectedQuantity: 4, qaStatus: "Pending" },
    { ...releaseAssessment[0], ledgerId: 41, acceptedQuantity: 6, qaRejectedQuantity: 2, qaStatus: "QA Hold" },
]);
assert.deepEqual(verifiedTotals.get(10), {
    acceptedQuantity: 2,
    rejectedQuantity: 1,
    totalProducedQuantity: 3,
});

const revokedAssessment = buildQAYieldAssessments([
    { ledger_id: 5, job_order_id: 10, yield_quantity: 3, qa_accepted_quantity: 2, qa_status: "Pending", qa_revoked_through_audit_id: 10 }
], [{
    daily_qa_id: 8,
    ledger_id: 5,
    sensory_status: "Passed",
    lab_status: "Passed",
    action_taken: "Released",
    weight_check_passed: 1
}], []);
assert.equal(revokedAssessment[0].qaStatus, "Pending");
assert.equal(revokedAssessment[0].acceptedQuantity, 0);

const reauditedAssessment = buildQAYieldAssessments([
    { ledger_id: 6, job_order_id: 10, yield_quantity: 3, qa_accepted_quantity: 2, qa_status: "Pending", qa_revoked_through_audit_id: 10 }
], [{
    daily_qa_id: 8,
    ledger_id: 6,
    sensory_status: "Passed",
    lab_status: "Passed",
    action_taken: "Released",
    weight_check_passed: 1
}, {
    daily_qa_id: 11,
    ledger_id: 6,
    sensory_status: "Failed",
    lab_status: "Failed",
    action_taken: "Hold",
    weight_check_passed: 0
}], []);
assert.equal(reauditedAssessment[0].qaStatus, "QA Hold");
assert.equal(reauditedAssessment[0].acceptedQuantity, 0);

console.log("QA released-good quantity and revocation-cycle checks passed.");
