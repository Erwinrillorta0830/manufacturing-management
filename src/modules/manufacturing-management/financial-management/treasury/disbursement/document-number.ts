export const acquireDocumentNumberLock = async (transactionTypeId: number | string) => { return () => {}; };
export const releaseDocumentNumberLock = async (lock?: any) => {};
export const findNextAvailableDocumentNumber = async (transactionTypeId: number | string, fetcher?: any) => "DOC-0001";
export const isDocumentNumberConflictError = (error: any) => false;
