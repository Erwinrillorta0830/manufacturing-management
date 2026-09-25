import assert from "node:assert/strict";
import {
    calculateMaterialConsumptionDefaults,
    preserveExistingActualQuantities,
    sumProductionOutputQuantities
} from "./material-consumption.ts";

assert.equal(sumProductionOutputQuantities("8", "1", "2"), 11);

assert.deepEqual(preserveExistingActualQuantities([
    { jo_material_id: 1, reservation_id: 10, actual_qty: "73.333333", available_stock: 100 },
    { jo_material_id: 1, reservation_id: 11, actual_qty: "36.666667", available_stock: 50 }
], [
    { jo_material_id: 1, reservation_id: 10, actual_qty: "12.5", available_stock: 80 }
]), [
    { jo_material_id: 1, reservation_id: 10, actual_qty: "12.5", available_stock: 100 },
    { jo_material_id: 1, reservation_id: 11, actual_qty: "36.666667", available_stock: 50 }
]);

assert.deepEqual(preserveExistingActualQuantities([
    { jo_material_id: 1, reservation_id: 10, actual_qty: "2.828000", available_stock: 2.828 },
    { jo_material_id: 1, reservation_id: 11, actual_qty: "0.848400", available_stock: 0.8484 }
], [
    { jo_material_id: 1, reservation_id: 10, actual_qty: "2.500000", available_stock: 2.828 }
], new Set(["1:10"])), [
    { jo_material_id: 1, reservation_id: 10, actual_qty: "2.500000", available_stock: 2.828 },
    { jo_material_id: 1, reservation_id: 11, actual_qty: "0.848400", available_stock: 0.8484 }
]);

const balancedReservations = calculateMaterialConsumptionDefaults([
    { jo_material_id: 1, allocated_quantity: 100, available_stock: 100 },
    { jo_material_id: 1, allocated_quantity: 100, available_stock: 50 }
], 10, sumProductionOutputQuantities("8", "1", "2"));
assert.deepEqual(balancedReservations, [
    { theoreticalQuantity: 73.333333, actualQuantity: "73.333333" },
    { theoreticalQuantity: 36.666667, actualQuantity: "36.666667" }
]);

const shortageReservations = calculateMaterialConsumptionDefaults([
    { jo_material_id: 2, allocated_quantity: 100, available_stock: 40 },
    { jo_material_id: 2, allocated_quantity: 100, available_stock: 60 }
], 10, 11);
assert.deepEqual(shortageReservations, [
    { theoreticalQuantity: 44, actualQuantity: "40.000000" },
    { theoreticalQuantity: 66, actualQuantity: "60.000000" }
]);
assert.equal(
    shortageReservations.reduce((sum, line) => sum + Number(line.actualQuantity), 0),
    100
);

const exactShortfallBeforeTopUp = calculateMaterialConsumptionDefaults([
    { jo_material_id: 20, allocated_quantity: 3.342181818, available_stock: 2.828 }
], 10, 11);
assert.equal(exactShortfallBeforeTopUp[0].theoreticalQuantity, 3.6764);
assert.equal(exactShortfallBeforeTopUp[0].actualQuantity, "2.828000");
assert.equal(Number((exactShortfallBeforeTopUp[0].theoreticalQuantity - 2.828).toFixed(6)), 0.8484);

const exactConsumptionAfterTopUp = calculateMaterialConsumptionDefaults([
    { jo_material_id: 20, allocated_quantity: 3.342181818, available_stock: 2.828 },
    { jo_material_id: 20, allocated_quantity: 3.342181818, available_stock: 0.8484 }
], 10, 11);
assert.deepEqual(exactConsumptionAfterTopUp, [
    { theoreticalQuantity: 2.828, actualQuantity: "2.828000" },
    { theoreticalQuantity: 0.8484, actualQuantity: "0.848400" }
]);

const requiredQuantityFallback = calculateMaterialConsumptionDefaults([
    { jo_material_id: 3, required_quantity: 50, issued_to_wip_quantity: 4, available_stock: 0 },
    { jo_material_id: 3, required_quantity: 50, issued_to_wip_quantity: 6, available_stock: 0 }
], 10, 10);
assert.deepEqual(requiredQuantityFallback, [
    { theoreticalQuantity: 20, actualQuantity: "0.000000" },
    { theoreticalQuantity: 30, actualQuantity: "0.000000" }
]);

const zeroOutput = calculateMaterialConsumptionDefaults([
    { jo_material_id: 4, allocated_quantity: 75, available_stock: 75 }
], 10, 0);
assert.deepEqual(zeroOutput, [
    { theoreticalQuantity: 0, actualQuantity: "0.000000" }
]);

console.log("material-consumption assertions passed");
