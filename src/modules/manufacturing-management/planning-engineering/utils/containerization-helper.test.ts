import assert from "node:assert/strict";
import { formatInventoryQuantity, getKilogramsPerInventoryUnit } from "./containerization-helper";

const kilogramsPerBag = getKilogramsPerInventoryUnit({
    unit_of_measurement: { unit_shortcut: "BAG" },
    product_weight: 15.35,
    weight_unit_id: { code: "kg" }
});

assert.equal(kilogramsPerBag, 15.35);
assert.deepEqual(formatInventoryQuantity(2.1626, "Bag", kilogramsPerBag), {
    quantity: "2.1626 Bag",
    kilograms: "33.1959 kg"
});

console.log("containerization-helper tests passed");
