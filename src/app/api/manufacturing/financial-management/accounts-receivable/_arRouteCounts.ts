import type { ARFullPayload, ARRow } from './_arFetchAndDerive';

/** Derived AR rows actually available to the dashboard (post server-side derivation). */
export function derivedInvoiceTotal(payload: ARFullPayload): number {
  return payload.rows.length;
}

/** Unfiltered headline total; prefers Directus source count when derivation drops rows. */
export function unfilteredInvoiceTotal(payload: ARFullPayload): number {
  return payload.sourceInvoiceCount ?? payload.rows.length;
}

export function summaryTotalInvoices(payload: ARFullPayload, isFiltered: boolean): number {
  return isFiltered ? derivedInvoiceTotal(payload) : unfilteredInvoiceTotal(payload);
}

/** Table view totals: derived rows only; filtered table reflects the active subset. */
export function tableTotalInvoices(
  payload: ARFullPayload,
  filtered: ARRow[],
  isFiltered: boolean,
): number {
  return isFiltered ? filtered.length : derivedInvoiceTotal(payload);
}
