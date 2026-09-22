import assert from "node:assert/strict";
import { fetchMmInventoryMovements } from "./mm-inventory-movements.service";

const originalFetch = globalThis.fetch;
const originalSpringBaseUrl = process.env.SPRING_API_BASE_URL;

process.env.SPRING_API_BASE_URL = "http://inventory-test";

let calls = 0;
globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
        return new Response(JSON.stringify({ message: "Too many requests" }), {
            status: 429,
            headers: { "Retry-After": "0" }
        });
    }

    return new Response("[]", { status: 200 });
}) as typeof fetch;

void (async () => {
    try {
        const movements = await fetchMmInventoryMovements({ branch: 198, product: 25858 }, "test-token");
        assert.deepEqual(movements, []);
        assert.equal(calls, 2);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalSpringBaseUrl === undefined) {
            delete process.env.SPRING_API_BASE_URL;
        } else {
            process.env.SPRING_API_BASE_URL = originalSpringBaseUrl;
        }
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
