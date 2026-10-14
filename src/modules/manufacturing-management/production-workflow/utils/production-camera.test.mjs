import assert from "node:assert/strict";
import { getProductionCameraErrorMessage, shouldUseNativeCameraCapture } from "./production-camera.ts";

assert.equal(shouldUseNativeCameraCapture(false, false), true);
assert.equal(shouldUseNativeCameraCapture(false, true), true);
assert.equal(shouldUseNativeCameraCapture(true, false), true);
assert.equal(shouldUseNativeCameraCapture(true, true), false);

assert.match(getProductionCameraErrorMessage({ name: "NotFoundError" }), /^No browser camera detected\./);
assert.match(getProductionCameraErrorMessage({ name: "DevicesNotFoundError" }), /^No browser camera detected\./);
assert.match(getProductionCameraErrorMessage({ name: "OverconstrainedError" }), /^No compatible browser camera detected\./);
assert.match(getProductionCameraErrorMessage({ name: "NotAllowedError" }), /device capture controls/);
assert.match(getProductionCameraErrorMessage({ name: "NotReadableError" }), /browser camera is unavailable or already in use/);
assert.match(getProductionCameraErrorMessage(new Error("unexpected")), /Unable to access the browser camera/);

console.log("production-camera assertions passed");
