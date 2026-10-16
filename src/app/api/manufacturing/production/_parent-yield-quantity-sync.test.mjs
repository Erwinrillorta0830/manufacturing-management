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
    applyParentQuantityDelta,
    ParentYieldQuantitySyncError,
    withJobOrderActualQuantityLock
} = await import("./_parent-yield-quantity-sync.ts");

let parentQuantity = 0;
const client = {
    readCurrentQuantity: async () => parentQuantity,
    writeQuantity: async (quantity) => { parentQuantity = quantity; }
};

assert.equal(await applyParentQuantityDelta(395, 24, 1, client), 1);
assert.equal(await applyParentQuantityDelta(395, 24, 2, client), 3);
assert.equal(await applyParentQuantityDelta(395, 24, -1, client), 2);

let retryWrites = 0;
let retryQuantity = 5;
await applyParentQuantityDelta(396, 25, 1, {
    readCurrentQuantity: async () => retryQuantity,
    writeQuantity: async (quantity) => {
        retryWrites += 1;
        if (retryWrites === 2) retryQuantity = quantity;
    }
});
assert.equal(retryWrites, 2, "a definitely unapplied write should retry once");
assert.equal(retryQuantity, 6);

let ambiguousWrites = 0;
await assert.rejects(
    applyParentQuantityDelta(397, 26, 1, {
        readCurrentQuantity: async () => ambiguousWrites === 0 ? 5 : 7,
        writeQuantity: async () => { ambiguousWrites += 1; }
    }),
    (error) => error instanceof ParentYieldQuantitySyncError
        && error.code === "QA_PARENT_QUANTITY_SYNC_FAILED"
        && error.jobOrderId === 397
        && error.ledgerId === 26
        && error.delta === 1
);
assert.equal(ambiguousWrites, 1, "an ambiguous write must not be retried");

let serializedQuantity = 0;
const serializedClient = {
    readCurrentQuantity: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return serializedQuantity;
    },
    writeQuantity: async (quantity) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        serializedQuantity = quantity;
    }
};
await Promise.all([
    applyParentQuantityDelta(398, 27, 1, serializedClient),
    applyParentQuantityDelta(398, 28, 1, serializedClient)
]);
assert.equal(serializedQuantity, 2, "concurrent same-Job-Order deltas must serialize");

let lockOrder = [];
await Promise.all([
    withJobOrderActualQuantityLock(399, async () => {
        lockOrder.push("first-start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        lockOrder.push("first-end");
    }),
    withJobOrderActualQuantityLock(399, async () => { lockOrder.push("second"); })
]);
assert.deepEqual(lockOrder, ["first-start", "first-end", "second"]);

console.log("Parent Job Order released-good quantity synchronization checks passed.");
