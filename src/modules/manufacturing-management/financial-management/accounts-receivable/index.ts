"use client";

// index.ts
// Barrel export — re-exports everything from the module so consumers
// can import from one place:
//   import AccountsReceivableModule from '@/modules/manufacturing-management/financial-management/accounts-receivable'

export { default } from './AccountsReceivableModule';
export * from './types';
export * from './utils';
export * from './hooks/useAccountsReceivable';
export * from './components/MetricCard';
export * from './components/AgingChart';
export * from './components/SalesmanChart';
export * from './components/BranchprogressList';
export * from './components/InvoiceTable';