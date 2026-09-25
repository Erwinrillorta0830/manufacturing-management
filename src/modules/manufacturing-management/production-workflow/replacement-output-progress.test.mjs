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

const {
    remainingProductionTarget,
    resolveReplacementAwareProductionOutput,
    sumReplacementCreditedQuantity
} = await import("./replacement-output-progress.ts");

const credits = [{ credited_quantity: "300" }, { credited_quantity: 0 }, { credited_quantity: -5 }];
assert.equal(sumReplacementCreditedQuantity(credits), 300);
assert.equal(remainingProductionTarget(354.6278, 300), 54.6278);

assert.deepEqual(resolveReplacementAwareProductionOutput({
    replacementCredits: credits,
    yieldLedgerRows: [],
    actualQuantityProduced: 300,
    completedQuantity: 300
}), {
    inheritedCreditedQuantity: 300,
    currentJobOrderOutputQuantity: 300,
    producedQuantity: 300
});

assert.deepEqual(resolveReplacementAwareProductionOutput({
    replacementCredits: credits,
    yieldLedgerRows: [{ yield_quantity: 9, rejected_quantity: 1 }],
    actualQuantityProduced: 300,
    completedQuantity: 10
}), {
    inheritedCreditedQuantity: 300,
    currentJobOrderOutputQuantity: 10,
    producedQuantity: 310
});

assert.deepEqual(resolveReplacementAwareProductionOutput({
    yieldLedgerRows: [{ yield_quantity: 12, rejected_quantity: 2 }],
    actualQuantityProduced: 0,
    completedQuantity: 14
}), {
    inheritedCreditedQuantity: 0,
    currentJobOrderOutputQuantity: 14,
    producedQuantity: 14
});

console.log("Replacement-aware production output checks passed.");
