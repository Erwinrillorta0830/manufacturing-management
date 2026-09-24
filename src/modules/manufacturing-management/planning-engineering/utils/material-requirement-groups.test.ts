import assert from "node:assert/strict";
import { groupMaterialRequirements } from "./material-requirement-groups";

const grouped = groupMaterialRequirements([
    { product_id: 901, uom_id: 14, required_quantity: 60.081 },
    { product_id: 901, uom_id: { unit_id: 14 }, required_quantity: 60.081 },
    { product_id: 901, uom_id: 15, required_quantity: 2 },
    { product_id: 902, uom_id: 14, required_quantity: 3 }
], {
    productId: (item) => item.product_id,
    uomId: (item) => item.uom_id,
    quantity: (item) => item.required_quantity
});

assert.equal(grouped.length, 3);
assert.equal(grouped[0].requiredQuantity, 120.162);
assert.equal(grouped[0].sourceItems.length, 2);
assert.equal(grouped[1].requiredQuantity, 2);
assert.equal(grouped[2].requiredQuantity, 3);

const defaultUomGrouped = groupMaterialRequirements([
    { product_id: 901, uom_id: undefined, required_quantity: 1 },
    { product_id: 901, uom_id: undefined, required_quantity: 2 }
], {
    productId: (item) => item.product_id,
    uomId: (item) => item.uom_id,
    quantity: (item) => item.required_quantity
});

assert.equal(defaultUomGrouped.length, 1);
assert.equal(defaultUomGrouped[0].requiredQuantity, 3);

const relationProductGrouped = groupMaterialRequirements([
    { product_id: { product_id: 901, unit_id: 31 }, uom_id: { unit_id: 14 }, required_quantity: 4 },
    { product_id: { product_id: 901, unit_id: 31 }, uom_id: { unit_id: 14 }, required_quantity: 5 }
], {
    productId: (item) => item.product_id,
    uomId: (item) => item.uom_id,
    quantity: (item) => item.required_quantity
});

assert.equal(relationProductGrouped.length, 1);
assert.equal(relationProductGrouped[0].productId, 901);
assert.equal(relationProductGrouped[0].requiredQuantity, 9);
