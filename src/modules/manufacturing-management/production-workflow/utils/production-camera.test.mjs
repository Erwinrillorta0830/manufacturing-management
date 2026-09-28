import assert from "node:assert/strict";
import { getProductionCameraErrorMessage } from "./production-camera.ts";

assert.match(getProductionCameraErrorMessage({ name: "NotFoundError" }), /^No camera detected\./);
assert.match(getProductionCameraErrorMessage({ name: "DevicesNotFoundError" }), /^No camera detected\./);
assert.match(getProductionCameraErrorMessage({ name: "OverconstrainedError" }), /^No compatible camera detected\./);
assert.match(getProductionCameraErrorMessage({ name: "NotAllowedError" }), /access was blocked/);
assert.match(getProductionCameraErrorMessage({ name: "NotReadableError" }), /unavailable or already in use/);
assert.match(getProductionCameraErrorMessage(new Error("unexpected")), /Unable to access a camera/);

console.log("production-camera assertions passed");
