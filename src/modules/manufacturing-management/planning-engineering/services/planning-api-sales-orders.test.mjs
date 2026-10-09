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

const { fetchSalesOrders, cancelPendingSalesOrderRequests } = await import("./planning-api.ts");
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalDateNow = Date.now;

function setFakeClock(startAt = 0) {
    let now = startAt;
    const delays = [];
    Date.now = () => now;
    globalThis.setTimeout = ((callback, delay = 0) => {
        const wait = Number(delay) || 0;
        delays.push(wait);
        now += wait;
        queueMicrotask(callback);
        return delays.length;
    });
    globalThis.clearTimeout = (() => undefined);
    return { delays, now: () => now };
}

try {
    const clock = setFakeClock(10_000);
    let attempts = 0;
    globalThis.fetch = async () => {
        attempts += 1;
        if (attempts === 1) {
            return new Response(JSON.stringify({ error: "rate limited", retryAfterSeconds: 1 }), {
                status: 429,
                headers: { "Retry-After": "2", "Content-Type": "application/json" }
            });
        }
        return new Response(JSON.stringify({ data: [{ order_id: 12 }], detailsMap: { 12: [] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    };

    const recovered = await fetchSalesOrders("planning");
    assert.equal(attempts, 2);
    assert.deepEqual(clock.delays, [2000]);
    assert.equal(recovered.data[0].order_id, 12);

    let resolveSharedRequest;
    attempts = 0;
    globalThis.fetch = async () => {
        attempts += 1;
        return new Promise((resolve) => { resolveSharedRequest = resolve; });
    };
    const firstQueueRequest = fetchSalesOrders("planning");
    const secondQueueRequest = fetchSalesOrders("planning");
    assert.equal(firstQueueRequest, secondQueueRequest);
    resolveSharedRequest(new Response(JSON.stringify({ data: [], detailsMap: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    }));
    await Promise.all([firstQueueRequest, secondQueueRequest]);
    assert.equal(attempts, 1);

    const timeoutClock = setFakeClock(0);
    attempts = 0;
    globalThis.fetch = async () => {
        attempts += 1;
        return new Response(JSON.stringify({ error: "rate limited" }), {
            status: 429,
            headers: { "Retry-After": "15", "Content-Type": "application/json" }
        });
    };

    await assert.rejects(fetchSalesOrders("for-production"), /temporarily busy/);
    assert.equal(timeoutClock.now(), 120_000);
    assert.ok(attempts < 20);

    attempts = 0;
    globalThis.fetch = async () => {
        attempts += 1;
        return new Response(JSON.stringify({ error: "temporary server failure" }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
        });
    };
    await assert.rejects(fetchSalesOrders("in-production"), /temporary server failure/);
    assert.equal(attempts, 1);

    let startedWaiting;
    const retryWaitStarted = new Promise((resolve) => { startedWaiting = resolve; });
    globalThis.setTimeout = (() => {
        startedWaiting();
        return 1;
    });
    globalThis.clearTimeout = (() => undefined);
    attempts = 0;
    globalThis.fetch = async () => {
        attempts += 1;
        return new Response(JSON.stringify({ error: "rate limited" }), {
            status: 429,
            headers: { "Retry-After": "5", "Content-Type": "application/json" }
        });
    };

    const cancelledRequest = fetchSalesOrders("planning");
    await retryWaitStarted;
    cancelPendingSalesOrderRequests();
    await assert.rejects(cancelledRequest, { name: "AbortError" });
    assert.equal(attempts, 1);
} finally {
    cancelPendingSalesOrderRequests();
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    Date.now = originalDateNow;
}

console.log("Sales Order queue retry checks passed.");
