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

const { createInventoryRefreshScheduler, isRelevantInventoryMovement } = await import("./inventory-movement-refresh.ts");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.equal(isRelevantInventoryMovement({ branch_id: 4, product_id: 12 }, 4, new Set([12, 15])), true);
assert.equal(isRelevantInventoryMovement({ branch_id: { id: 4 }, product_id: { product_id: "12" } }, 4, new Set([12])), true);
assert.equal(isRelevantInventoryMovement({ branch_id: 5, product_id: 12 }, 4, new Set([12])), false);
assert.equal(isRelevantInventoryMovement({ branch_id: 4, product_id: 20 }, 4, new Set([12])), false);

let burstRefreshCount = 0;
const burstScheduler = createInventoryRefreshScheduler(async () => {
    burstRefreshCount += 1;
}, { debounceMs: 15, maxWaitMs: 80 });
burstScheduler.schedule();
burstScheduler.schedule();
burstScheduler.schedule();
await delay(35);
assert.equal(burstRefreshCount, 1);
burstScheduler.dispose();

let maxWaitRefreshCount = 0;
const maxWaitScheduler = createInventoryRefreshScheduler(async () => {
    maxWaitRefreshCount += 1;
}, { debounceMs: 100, maxWaitMs: 200 });
maxWaitScheduler.schedule();
await delay(50);
maxWaitScheduler.schedule();
await delay(50);
maxWaitScheduler.schedule();
await delay(50);
maxWaitScheduler.schedule();
await delay(80);
assert.equal(maxWaitRefreshCount, 1);
maxWaitScheduler.dispose();

let refreshCount = 0;
let releaseFirstRefresh;
let firstRefreshStarted;
const firstRefreshStartedPromise = new Promise((resolve) => { firstRefreshStarted = resolve; });
const inFlightScheduler = createInventoryRefreshScheduler(() => {
    refreshCount += 1;
    if (refreshCount === 1) {
        firstRefreshStarted();
        return new Promise((resolve) => { releaseFirstRefresh = resolve; });
    }
    return Promise.resolve();
}, { debounceMs: 10, maxWaitMs: 50 });
inFlightScheduler.schedule();
await firstRefreshStartedPromise;
inFlightScheduler.schedule();
inFlightScheduler.schedule();
releaseFirstRefresh();
await delay(20);
assert.equal(refreshCount, 2);
inFlightScheduler.dispose();

console.log("Planning inventory movement refresh checks passed.");
