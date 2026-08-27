// src/modules/financial-management/accounting/supplier-credit-memo/SupplierCreditMemoModule.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupplierCreditMemo, useSuppliers, useChartOfAccounts } from "./hooks/useSupplierCreditMemo";
import { StatsCards }     from "./components/StatsCards";
import { MemoFiltersBar } from "./components/MemoFilters";
import { MemoTable }      from "./components/MemoTable";
import { AddMemoModal }   from "./components/AddMemoModal";

export default function SupplierCreditMemoModule() {
  const [showAddModal, setShowAddModal] = useState(false);

  const {
    memos, loading, error,
    filters, updateFilter, clearFilters, hasFilters,
    showToast,
    stats, refetch,
  } = useSupplierCreditMemo();

  const { suppliers } = useSuppliers();
  const { accounts  } = useChartOfAccounts();

  if (loading && memos.length === 0) return (
    <div className="p-4 md:p-6 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-6 w-1/2" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (error && memos.length === 0) return (
    <div className="p-8 text-center border border-red-500/20 bg-red-500/5 rounded-lg">
      <p className="text-red-500 font-medium">Error: {error}</p>
      <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 bg-background text-foreground min-h-screen space-y-6 w-full box-border overflow-hidden">

      {/* Page Header — title only, no button here */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Supplier Credit Memo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage and track supplier credit memos
        </p>
      </div>

      {/* Filters row — New Credit Memo button is inside, far right */}
      <MemoFiltersBar
        filters={filters}
        suppliers={suppliers}
        accounts={accounts}
        hasFilters={hasFilters}
        onChange={updateFilter}
        onClear={clearFilters}
        onAddNew={() => setShowAddModal(true)}
      />

      {/* Stats */}
      <StatsCards stats={stats} loading={loading} />

      {/* Table */}
      <MemoTable
        memos={memos}
        loading={loading}
        error={error}
        suppliers={suppliers}
        accounts={accounts}
      />

      {/* Add Modal overlay */}
      {showAddModal && (
        <AddMemoModal
          onClose={() => setShowAddModal(false)}
          onSuccess={msg => { showToast(msg, "success"); refetch(); }}
        />
      )}
    </div>
  );
}