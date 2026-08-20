// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const acquireDocumentNumberLock = async (transactionTypeId: number | string) => { return () => {}; };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const releaseDocumentNumberLock = async (lock?: unknown) => {};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const findNextAvailableDocumentNumber = async (transactionTypeId: number | string, fetcher?: unknown) => "DOC-0001";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const isDocumentNumberConflictError = (error: unknown) => false;
