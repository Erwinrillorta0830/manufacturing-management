import assert from "node:assert/strict";
import { aggregateWizardMaterialComponents } from "./material-summary";
import { calculateRecipeMaterialCostPerUnit } from "./cogs-helper";
import { calculateMaterialRequirementPlan } from "./production-timing";

const kansuiRows = aggregateWizardMaterialComponents([
    {
        component_id: 6,
        uom_id: 14,
        quantity_required: 60.08,
        wastage_factor_percentage: 0,
        cost_per_unit: 4,
        unit_of_measurement: "Container",
        component_product_id: { product_id: 9001, product_name: "Alkaline Salt Solution (Kansui)", cost_per_unit: 4 }
    },
    {
        component_id: 8,
        uom_id: { unit_id: 14 },
        quantity_required: 60.08,
        wastage_factor_percentage: 0,
        cost_per_unit: 4,
        unit_of_measurement: "Container",
        component_product_id: { product_id: 9001, product_name: "Alkaline Salt Solution (Kansui)", cost_per_unit: 4 }
    }
]);

assert.equal(kansuiRows.length, 1);
assert.equal(kansuiRows[0].quantity_required, 120.16);
assert.equal(
    calculateMaterialRequirementPlan(1, 1, Number(kansuiRows[0].quantity_required), Number(kansuiRows[0].wastage_factor_percentage)).plannedRequired,
    120.16
);

const mixedWastageRows = aggregateWizardMaterialComponents([
    {
        quantity_required: 2,
        wastage_factor_percentage: 10,
        cost_per_unit: 10,
        uom_id: 14,
        component_product_id: { product_id: 9001, cost_per_unit: 10 }
    },
    {
        quantity_required: 3,
        wastage_factor_percentage: 20,
        cost_per_unit: 20,
        uom_id: 14,
        component_product_id: { product_id: 9001, cost_per_unit: 20 }
    }
]);

assert.equal(mixedWastageRows.length, 1);
const aggregatedWastageCost = calculateRecipeMaterialCostPerUnit(mixedWastageRows.map((component) => ({
    quantity_required: Number(component.quantity_required),
    wastage_factor_percentage: Number(component.wastage_factor_percentage),
    cost_per_unit: Number(component.cost_per_unit)
})));
assert.ok(Math.abs(aggregatedWastageCost - (2 * 10 / 0.9 + 3 * 20 / 0.8)) < 1e-9);

const separateMaterials = aggregateWizardMaterialComponents([
    { quantity_required: 1, uom_id: 14, component_product_id: { product_id: 9001 } },
    { quantity_required: 1, uom_id: 15, component_product_id: { product_id: 9001 } },
    { quantity_required: 1, uom_id: 14, component_product_id: { product_id: 9002 } }
]);

assert.equal(separateMaterials.length, 3);
