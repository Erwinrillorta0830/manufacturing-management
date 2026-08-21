export type PaymentValidationLine = {
    coaId?: unknown;
    bankId?: unknown;
    checkNo?: unknown;
};

export type PaymentBankAccount = {
    bankName?: string | null;
    accountNumber?: string | null;
};

/**
 * Petty Cash and Revolving Fund bank/cash accounts do not require a check
 * number. Unknown account titles intentionally remain check payments so
 * validation fails closed.
 */
export function isPettyCashAccount(accountTitle?: string | null): boolean {
    const normalizedTitle = (accountTitle || "").trim().toLowerCase();
    return normalizedTitle.includes("petty cash") ||
        normalizedTitle.includes("cash on hand") ||
        normalizedTitle.includes("revolving fund") ||
        normalizedTitle.includes("revolving funds");
}

export function isPettyCashBankAccount(bankAccount?: PaymentBankAccount | null): boolean {
    if (!bankAccount) return false;
    return isPettyCashAccount([bankAccount.bankName, bankAccount.accountNumber].filter(Boolean).join(" - "));
}

export function validatePaymentLine(
    line: PaymentValidationLine,
    accountTitle?: string | null,
    bankAccount?: PaymentBankAccount | null,
): string | null {
    if (line.coaId == null || line.coaId === "") {
        return "Please select a GL COA account.";
    }

    if (!accountTitle || accountTitle.trim() === "") {
        return "Please select a valid GL COA account.";
    }

    if (line.bankId == null || line.bankId === "") {
        return "Please select a bank account.";
    }

    if (!isPettyCashBankAccount(bankAccount) && String(line.checkNo ?? "").trim() === "") {
        return "Please provide a check number.";
    }

    return null;
}
