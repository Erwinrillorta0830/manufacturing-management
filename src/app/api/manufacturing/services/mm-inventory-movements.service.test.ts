import assert from "node:assert/strict";
import { fetchMmInventoryMovements } from "./mm-inventory-movements.service";
import { sumMovementQuantitiesByStorageLot } from "../qa-receiving/_movement-stock";

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

    return new Response(JSON.stringify([
        { movementId: 1, mmLotId: 181, branchId: 198, productId: 25889, quantityIn: 1059, quantityOut: 0 },
        { movementId: 2, mmLotId: 181, branchId: 198, productId: 25889, quantityIn: 0, quantityOut: 59 },
        { movementId: 3, mmLotId: 182, branchId: 198, productId: 25889, quantityIn: 10, quantityOut: 10 },
        { movementId: 4, mmLotId: 183, branchId: 198, productId: 25889, quantityIn: 2, quantityOut: 5 }
    ]), { status: 200 });
}) as typeof fetch;

void (async () => {
    try {
        const movements = await fetchMmInventoryMovements({ branch: 198, product: 25858 }, "test-token");
        assert.deepEqual(
            [...sumMovementQuantitiesByStorageLot(movements)].sort(([left], [right]) => left - right),
            [[181, 1000], [182, 0], [183, -3]]
        );
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
