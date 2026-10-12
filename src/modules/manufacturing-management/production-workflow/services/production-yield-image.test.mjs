import assert from "node:assert/strict";
import test from "node:test";
import {
    MANUFACTURING_EVIDENCE_MAX_FILES,
    MANUFACTURING_EVIDENCE_MAX_TOTAL_BYTES,
    PRODUCTION_YIELD_IMAGE_MAX_BYTES,
    validateManufacturingEvidenceBatch
} from "./production-yield-image.ts";

function evidenceFile(name, type, size) {
    return { name, type, size };
}

test("accepts several valid breakdown evidence images", () => {
    const files = [
        evidenceFile("equipment-close-up.jpg", "image/jpeg", 2 * 1024 * 1024),
        evidenceFile("line-overview.png", "image/png", 3 * 1024 * 1024),
        evidenceFile("bad-lot.webp", "image/webp", 1 * 1024 * 1024)
    ];

    assert.equal(validateManufacturingEvidenceBatch(files, "Breakdown evidence"), null);
});

test("rejects a file that exceeds the existing per-image size limit", () => {
    const files = [evidenceFile("oversized.jpg", "image/jpeg", PRODUCTION_YIELD_IMAGE_MAX_BYTES + 1)];

    assert.match(validateManufacturingEvidenceBatch(files, "Breakdown evidence"), /no larger than 5 MB/i);
});

test("rejects more than the configured attachment count", () => {
    const files = Array.from({ length: MANUFACTURING_EVIDENCE_MAX_FILES + 1 }, (_, index) =>
        evidenceFile(`photo-${index}.jpg`, "image/jpeg", 1024)
    );

    assert.match(validateManufacturingEvidenceBatch(files, "Breakdown evidence"), /no more than 10/i);
});

test("rejects a batch above the total request size limit", () => {
    const files = [
        evidenceFile("clip-one.mp4", "video/mp4", 60 * 1024 * 1024),
        evidenceFile("clip-two.mp4", "video/mp4", MANUFACTURING_EVIDENCE_MAX_TOTAL_BYTES - 60 * 1024 * 1024 + 1)
    ];

    assert.match(validateManufacturingEvidenceBatch(files, "Breakdown evidence"), /100 MB in total/i);
});

test("rejects unsupported file types", () => {
    const files = [evidenceFile("notes.pdf", "application/pdf", 1024)];

    assert.match(validateManufacturingEvidenceBatch(files, "Breakdown evidence"), /must be a PNG, JPG, or WEBP/i);
});
