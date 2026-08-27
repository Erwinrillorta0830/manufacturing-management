// src/modules/financial-management/accounting/supplier-debit-memo/components/StatusBadge.tsx

"use client";

import { STATUS_CONFIG } from "../utils";

export function StatusBadge({ status }: { status: string }) {
  const key = String(status || "").trim();
  const lowerKey = key.toLowerCase() as keyof typeof STATUS_CONFIG;
  const config = STATUS_CONFIG[key] ?? STATUS_CONFIG[lowerKey];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
        config?.className ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {config?.label ?? status}
    </span>
  );
}