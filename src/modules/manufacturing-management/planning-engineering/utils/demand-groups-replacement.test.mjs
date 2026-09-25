import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
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

const { canCreateReplacementJobOrder, replacementJobOrderTargets } = await import("./demand-groups.ts");

const eligibleTerminatedLine = {
    parent_order_status: "In Production",
    remaining_quantity: 50,
    linkedJobOrders: [{ status: "Cancelled", isTerminated: true }]
};

assert.equal(canCreateReplacementJobOrder(eligibleTerminatedLine), true);
assert.equal(canCreateReplacementJobOrder({
    ...eligibleTerminatedLine,
    linkedJobOrders: [...eligibleTerminatedLine.linkedJobOrders, { status: "In Production", isTerminated: false }]
}), false);
assert.equal(canCreateReplacementJobOrder({
    ...eligibleTerminatedLine,
    linkedJobOrders: [{ status: "Cancelled", isTerminated: false }]
}), false);
assert.equal(canCreateReplacementJobOrder({ ...eligibleTerminatedLine, remaining_quantity: 0 }), false);
assert.equal(canCreateReplacementJobOrder({ ...eligibleTerminatedLine, parent_order_status: "Cancelled" }), false);

assert.deepEqual(replacementJobOrderTargets({
    ...eligibleTerminatedLine,
    ordered_quantity: 354.6278,
    remaining_quantity: 54.6278
}), {
    targetQuantity: 354.6278,
    materialTargetQuantity: 54.6278
});

console.log("Replacement Job Order eligibility checks passed.");
