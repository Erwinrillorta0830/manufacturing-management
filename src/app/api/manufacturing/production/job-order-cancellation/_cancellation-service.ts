/**
 * Compatibility wrapper. The shared raw-material return engine now lives in
 * ../_material-return.ts and is re-exported here so existing imports
 * (job-order-cancellation route, QA route) keep working unchanged.
 */
export * from "../_material-return";
