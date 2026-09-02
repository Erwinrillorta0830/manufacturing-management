export type CustomerProfileValidationInput = {
    store_signage?: unknown;
    tel_number?: unknown;
    bank_details?: unknown;
    price_type_id?: unknown;
    otherDetails?: unknown;
};

export type CustomerProfileValidationErrors = Record<string, string>;

export function positiveInteger(value: unknown): number | null {
    const parsed = typeof value === "string" && value.trim() !== ""
        ? Number(value.trim())
        : value;

    return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed > 0
        ? parsed
        : null;
}

export function trimmedString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export function validateTelephone(value: unknown): string | null {
    const telephone = trimmedString(value);
    if (!telephone) return "Telephone Number is required.";
    if (!/^\+?[\d\s\-()]+$/.test(telephone)) {
        return "Telephone Number may contain only digits, spaces, hyphens, parentheses, and an optional leading +.";
    }

    const digitCount = telephone.replace(/\D/g, "").length;
    if (digitCount < 7 || digitCount > 15) {
        return "Telephone Number must contain 7 to 15 digits.";
    }

    return null;
}

export function validateCustomerProfileFields(
    input: CustomerProfileValidationInput,
): CustomerProfileValidationErrors {
    const errors: CustomerProfileValidationErrors = {};

    if (!trimmedString(input.store_signage)) {
        errors.store_signage = "Store Signage is required.";
    }

    const telephoneError = validateTelephone(input.tel_number);
    if (telephoneError) errors.tel_number = telephoneError;

    if (!trimmedString(input.bank_details)) {
        errors.bank_details = "Bank Details are required.";
    }

    if (!positiveInteger(input.price_type_id)) {
        errors.price_type_id = "Price Type must be a valid active price-template ID.";
    }

    if (!trimmedString(input.otherDetails)) {
        errors.otherDetails = "Other Details / Description is required.";
    }

    return errors;
}
