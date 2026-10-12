import assert from "node:assert/strict";
import test from "node:test";
import { getCachedPromise } from "./cached-promise.ts";

test("reuses a successful in-flight request for the same key", async () => {
    const cache = new Map();
    let calls = 0;
    let resolveRequest;
    const load = () => {
        calls += 1;
        return new Promise((resolve) => {
            resolveRequest = resolve;
        });
    };

    const first = getCachedPromise(cache, "same", load);
    const second = getCachedPromise(cache, "same", load);
    await Promise.resolve();
    assert.equal(calls, 1);
    resolveRequest(["cached"]);
    assert.deepEqual(await first, ["cached"]);
    assert.deepEqual(await second, ["cached"]);
    assert.deepEqual(await getCachedPromise(cache, "same", load), ["cached"]);
    assert.equal(calls, 1);
});

test("removes rejected requests so the next call can retry", async () => {
    const cache = new Map();
    let calls = 0;
    const load = async () => {
        calls += 1;
        if (calls === 1) throw new Error("temporary failure");
        return "ready";
    };

    await assert.rejects(getCachedPromise(cache, "retry", load), /temporary failure/);
    assert.equal(await getCachedPromise(cache, "retry", load), "ready");
    assert.equal(calls, 2);
});
