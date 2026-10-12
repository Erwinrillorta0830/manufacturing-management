import assert from "node:assert/strict";
import { fetchStagingJobOrders } from "./staging-api.ts";

const originalFetch = globalThis.fetch;
let capturedInit;
globalThis.fetch = async (_url, init) => {
    capturedInit = init;
    return Response.json({
        success: true,
        data: [],
        stats: {},
        workCenters: [],
        branches: []
    });
};

try {
    const controller = new AbortController();
    await fetchStagingJobOrders({ signal: controller.signal });
    assert.equal(capturedInit.signal, controller.signal, "the request must pass its AbortSignal to fetch");
} finally {
    globalThis.fetch = originalFetch;
}

console.log("material-staging API abort signal assertion passed");
