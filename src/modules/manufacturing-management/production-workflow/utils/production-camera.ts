export function getProductionCameraErrorMessage(error: unknown): string {
    const errorName = error && typeof error === "object" && "name" in error
        ? String(error.name)
        : "";

    if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
        return "No camera detected. Connect or enable a camera, or use Choose File to select an image.";
    }

    if (errorName === "OverconstrainedError" || errorName === "ConstraintNotSatisfiedError") {
        return "No compatible camera detected. Try another camera, or use Choose File to select an image.";
    }

    if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError" || errorName === "SecurityError") {
        return "Camera access was blocked. Allow camera permission in your browser settings, or use Choose File to select an image.";
    }

    if (errorName === "NotReadableError" || errorName === "TrackStartError") {
        return "The camera is unavailable or already in use. Close other apps using it and try again, or use Choose File.";
    }

    return "Unable to access a camera. Check that one is connected and that this page has camera permission, or use Choose File.";
}
