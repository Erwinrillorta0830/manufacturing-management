export const isPaymentAllocationScope = (saveScope?: string) => saveScope === "payment";
export const resolveDisbursementUpdateStatus = (currentStatus: string, saveScope?: string, isHeaderOrPayableModified?: boolean) => {
    return currentStatus;
};
