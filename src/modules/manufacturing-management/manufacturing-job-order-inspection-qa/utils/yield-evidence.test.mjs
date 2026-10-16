import assert from "node:assert/strict";
import { test } from "node:test";
import { yieldEvidenceChannelLabel, yieldEvidenceRequirements, yieldEvidenceRequirementsForLedger } from "./yield-evidence.ts";
import { validateManufacturingEvidenceChannelBatch } from "../../production-workflow/services/production-yield-image.ts";

test("accepted and rejected evidence are required only for positive quantities", () => {
    assert.deepEqual(yieldEvidenceRequirements(0, 0), {
        inspectorShift: true,
        acceptedStock: false,
        rejectedStock: false
    });
    assert.deepEqual(yieldEvidenceRequirements(1, 0), {
        inspectorShift: true,
        acceptedStock: true,
        rejectedStock: false
    });
    assert.deepEqual(yieldEvidenceRequirements(0, 0.5), {
        inspectorShift: true,
        acceptedStock: false,
        rejectedStock: true
    });
});

test("registered rejected output no longer requires rejected evidence", () => {
    assert.deepEqual(yieldEvidenceRequirementsForLedger(1, 1, true), {
        inspectorShift: true,
        acceptedStock: true,
        rejectedStock: false
    });
    assert.deepEqual(yieldEvidenceRequirementsForLedger(1, 1, false), {
        inspectorShift: true,
        acceptedStock: true,
        rejectedStock: true
    });
    assert.deepEqual(yieldEvidenceRequirementsForLedger(0, 0, true), {
        inspectorShift: true,
        acceptedStock: false,
        rejectedStock: false
    });
});

test("evidence channels have distinct audit labels", () => {
    assert.equal(yieldEvidenceChannelLabel("INSPECTOR_SHIFT"), "Inspector / Shift Evidence");
    assert.equal(yieldEvidenceChannelLabel("QA_ACCEPTED_STOCK"), "QA Accepted Stock Evidence");
    assert.equal(yieldEvidenceChannelLabel("QA_REJECTED_STOCK"), "QA Rejected Stock Evidence");
});

test("evidence limits include files already saved for the channel", () => {
    const oneByteImage = new File(["x"], "evidence.png", { type: "image/png" });
    assert.equal(validateManufacturingEvidenceChannelBatch(9, 100, [oneByteImage], "QA accepted stock evidence"), null);
    assert.match(
        validateManufacturingEvidenceChannelBatch(10, 0, [oneByteImage], "QA accepted stock evidence"),
        /No more than 10/
    );
    assert.match(
        validateManufacturingEvidenceChannelBatch(0, 100 * 1024 * 1024, [oneByteImage], "QA accepted stock evidence"),
        /100 MB/
    );
});
