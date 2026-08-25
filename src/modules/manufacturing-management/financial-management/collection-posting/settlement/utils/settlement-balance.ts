import { SettlementAllocation, UnpaidInvoice } from "../../types";

export const SETTLEMENT_BALANCE_TOLERANCE = 0.01;

export const roundCurrency = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const toCurrencyCents = (value: number) => Math.round((Number(value) || 0) * 100);

export const getSourceAllocationCapacity = (sourceAmount: number, usedElsewhere = 0) => roundCurrency(
    Math.max(0, Math.abs(Number(sourceAmount) || 0) - Math.max(0, Number(usedElsewhere) || 0))
);

export const getInvoiceAllocationCapacity = (invoiceBalance: number, appliedElsewhere = 0) => roundCurrency(
    Math.max(0, Number(invoiceBalance) - Math.max(0, Number(appliedElsewhere) || 0))
);

/**
 * Returns the largest currency amount that can be applied to both sides of an
 * allocation. Integer cents keep manual input and auto-match arithmetic in sync.
 */
export const capSettlementAllocation = (
    requestedAmount: number,
    sourceAvailable: number,
    invoiceAvailable: number
) => {
    const requestedCents = Math.max(0, toCurrencyCents(Math.abs(requestedAmount)));
    const sourceCents = Math.max(0, toCurrencyCents(sourceAvailable));
    const invoiceCents = Math.max(0, toCurrencyCents(invoiceAvailable));
    return Math.min(requestedCents, sourceCents, invoiceCents) / 100;
};

export const getInvoiceSettlementCap = (invoice: UnpaidInvoice) => roundCurrency(Math.max(
    0,
    Number(invoice.maxSettleableAmount ?? invoice.remainingBalance ?? invoice.originalAmount ?? 0)
));

export const getInvoiceRequiredBalance = (invoice: UnpaidInvoice) => Math.max(
    0,
    getInvoiceSettlementCap(invoice)
);

export const getInvoiceAppliedForSettlement = (
    allocations: SettlementAllocation[],
    invoiceId: number
) => roundCurrency(
    allocations
        .filter(allocation => allocation.invoiceId === invoiceId)
        .reduce((sum, allocation) => sum + Number(allocation.amountApplied || 0), 0)
);

export const findUnderAllocatedInvoice = (
    invoices: UnpaidInvoice[],
    allocations: SettlementAllocation[]
) => invoices.find(invoice => {
    const required = getInvoiceRequiredBalance(invoice);
    const applied = getInvoiceAppliedForSettlement(allocations, invoice.id);
    return required - applied > SETTLEMENT_BALANCE_TOLERANCE;
});

export const findOverAllocatedInvoice = (
    invoices: UnpaidInvoice[],
    allocations: SettlementAllocation[]
) => invoices.find(invoice => {
    const required = getInvoiceRequiredBalance(invoice);
    const applied = getInvoiceAppliedForSettlement(allocations, invoice.id);
    return applied - required > SETTLEMENT_BALANCE_TOLERANCE;
});

export const getCartBalanceTotals = (
    invoices: UnpaidInvoice[],
    allocations: SettlementAllocation[]
) => {
    const required = roundCurrency(invoices.reduce(
        (sum, invoice) => sum + getInvoiceRequiredBalance(invoice),
        0
    ));
    const applied = roundCurrency(invoices.reduce(
        (sum, invoice) => sum + getInvoiceAppliedForSettlement(allocations, invoice.id),
        0
    ));

    return {
        required,
        applied,
        difference: roundCurrency(required - applied),
    };
};
