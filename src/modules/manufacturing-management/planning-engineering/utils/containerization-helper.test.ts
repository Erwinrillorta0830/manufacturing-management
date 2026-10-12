import assert from "node:assert/strict";
import {
    calculateContainerizationMetrics,
    formatInventoryQuantity,
    getKilogramsPerInventoryUnit
} from "./containerization-helper";

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
assert.deepEqual(formatInventoryQuantity(2.1626, "Bag", null), {
    quantity: "2.1626 Bag",
    kilograms: null
});

// Unconfigured at 100% yield: no cutting weight, no flour data. The panel
// must render display-safe zeros (0 Pcs / 0 Full / 0 Pallets), never NaN.
const unconfiguredAtFullYield = calculateContainerizationMetrics(
    "Unconfigured Product",
    12001,
    12,
    100,
    0,
    undefined,
    24,
    undefined,
    undefined,
    [],
    7092.5556,
    12001,
    null
);
assert.equal(unconfiguredAtFullYield.expectedYieldPercentage, 100);
assert.equal(unconfiguredAtFullYield.hasWeightBasedOutputEstimate, false);
assert.equal(unconfiguredAtFullYield.netPieces, 0);
assert.equal(unconfiguredAtFullYield.totalCasesBundlesFull, 0);
assert.equal(unconfiguredAtFullYield.remainingPcs, 0);
assert.equal(unconfiguredAtFullYield.hasPalletEstimate, false);
assert.equal(unconfiguredAtFullYield.totalPalletsFull, 0);
assert.equal(unconfiguredAtFullYield.remainingCasesBundles, 0);

// Flour weight known but cutting weight missing: still unconfigured, and a
// missing yield still defaults to 100%.
const noCuttingWeight = calculateContainerizationMetrics(
    "No Cutting Weight",
    12001,
    12,
    undefined,
    0,
    undefined,
    24,
    15.37,
    32892.5,
    [],
    7092.5556,
    12001,
    null
);
assert.equal(noCuttingWeight.expectedYieldPercentage, 100);
assert.equal(noCuttingWeight.hasFlourWeightEstimate, true);
assert.equal(noCuttingWeight.hasWeightBasedOutputEstimate, false);
assert.equal(noCuttingWeight.netPieces, 0);
assert.equal(noCuttingWeight.totalCasesBundlesFull, 0);

// Configured control at 100% yield: estimate present, net equals gross.
const configuredAtFullYield = calculateContainerizationMetrics(
    "Configured Product",
    12001,
    12,
    100,
    0,
    500,
    24,
    15.37,
    32892.5,
    [],
    7092.5556,
    12001,
    null
);
assert.equal(configuredAtFullYield.hasWeightBasedOutputEstimate, true);
assert.ok(configuredAtFullYield.grossPieces > 0);
assert.equal(configuredAtFullYield.netPieces, configuredAtFullYield.grossPieces);
assert.equal(
    configuredAtFullYield.totalCasesBundlesFull,
    Math.floor(configuredAtFullYield.netPieces / 12)
);
assert.equal(configuredAtFullYield.hasPalletEstimate, true);

// Piece-based production uses the effective JO target even when physical
// weight and packaging conversion masters are not configured.
const piecesWithoutPackaging = calculateContainerizationMetrics(
    "Piece Product",
    14185,
    undefined,
    100,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    [],
    1,
    14185,
    null,
    "PCS"
);
assert.equal(piecesWithoutPackaging.hasNetPieceEstimate, true);
assert.equal(piecesWithoutPackaging.hasWeightBasedOutputEstimate, false);
assert.equal(piecesWithoutPackaging.grossPieces, 14185);
assert.equal(piecesWithoutPackaging.netPieces, 14185);
assert.equal(piecesWithoutPackaging.hasCaseBundleEstimate, false);
assert.equal(piecesWithoutPackaging.hasPalletEstimate, false);

const piecesAtReducedYield = calculateContainerizationMetrics(
    "Piece Product",
    14185,
    undefined,
    85,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    [],
    1,
    14185,
    null,
    "PIECES"
);
assert.equal(piecesAtReducedYield.netPieces, 12057.25);

const piecesWithPackaging = calculateContainerizationMetrics(
    "Piece Product",
    14185,
    12,
    100,
    undefined,
    undefined,
    40,
    undefined,
    undefined,
    [],
    1,
    14185,
    null,
    "PCS"
);
assert.equal(piecesWithPackaging.hasCaseBundleEstimate, true);
assert.equal(piecesWithPackaging.totalCasesBundlesFull, 1182);
assert.equal(piecesWithPackaging.remainingPcs, 1);
assert.equal(piecesWithPackaging.hasPalletEstimate, true);
assert.equal(piecesWithPackaging.totalPalletsFull, 29);
assert.equal(piecesWithPackaging.remainingCasesBundles, 22);

console.log("containerization-helper tests passed");
