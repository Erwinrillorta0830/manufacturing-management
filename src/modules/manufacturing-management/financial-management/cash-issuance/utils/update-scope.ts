export const isPaymentAllocationScope = (saveScope?: string) => saveScope === "payment";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const resolveDisbursementUpdateStatus = (currentStatus: string, saveScope?: string, isHeaderOrPayableModified?: boolean) => {
    return currentStatus;
};
