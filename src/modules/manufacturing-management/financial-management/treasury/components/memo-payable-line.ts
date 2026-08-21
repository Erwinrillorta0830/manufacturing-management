// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const isMemoPayableLine = (line: unknown, memoReferences?: unknown) => false;
export const normalizeMemoReference = (ref?: string) => ref || "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripMemoLineMetadata = (line: unknown) => line as any;
