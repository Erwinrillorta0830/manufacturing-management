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

const { buildQAYieldAssessments, isCommittedYieldLedger } = await import("./_qa-accepted-output.ts");

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

console.log("QA yield ledger commit-state checks passed.");
