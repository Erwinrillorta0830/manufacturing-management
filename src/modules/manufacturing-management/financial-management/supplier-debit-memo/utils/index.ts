// src/modules/financial-management/accounting/supplier-debit-memo/utils/index.ts

// ─── Constants ────────────────────────────────────────────────────────────────

export const API_BASE = "/api/manufacturing/financial-management/supplier-debit-memo";

export const MEMO_STATUSES: string[] = [
  "Available",
  "Applied",
];

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  Available: { label: "Available", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400 dark:border-emerald-500/30" },
  Applied:   { label: "Applied",   className: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400 dark:border-blue-500/30" },
};

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatPeso(amount: number): string {
  return `₱${Number(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year:  "numeric",
    month: "short",
    day:   "2-digit",
  });
}

export function getNextMemoNumber(lastNumber: string): string {
  const num = parseInt(lastNumber.replace(/\D+/g, ""), 10);
  return `SDM-${String(isNaN(num) ? 1 : num + 1).padStart(3, "0")}`;
}