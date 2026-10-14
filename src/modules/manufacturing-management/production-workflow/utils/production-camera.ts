export function shouldUseNativeCameraCapture(isSecureContext: boolean, hasGetUserMedia: boolean): boolean {
    return !isSecureContext || !hasGetUserMedia;
}

export function getProductionCameraErrorMessage(error: unknown): string {
    const errorName = error && typeof error === "object" && "name" in error
        ? String(error.name)
        : "";

    if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
        return "No browser camera detected. Use the device capture controls or choose a file.";
    }

    if (errorName === "OverconstrainedError" || errorName === "ConstraintNotSatisfiedError") {
        return "No compatible browser camera detected. Use the device capture controls or choose a file.";
    }

    if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError" || errorName === "SecurityError") {
        return "Browser camera access was blocked. Use the device capture controls or choose a file.";
    }

    if (errorName === "NotReadableError" || errorName === "TrackStartError") {
        return "The browser camera is unavailable or already in use. Use the device capture controls or choose a file.";
    }

    return "Unable to access the browser camera. Use the device capture controls or choose a file.";
}
