// src/modules/financial-management/accounting/supplier-credit-memo/components/AddMemoModal.tsx

"use client";

import { useState, useRef, useMemo } from "react";
import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { Label }   from "@/components/ui/label";
import { Badge }   from "@/components/ui/badge";
import { X, Loader2, Plus, Search, ChevronDown, Check } from "lucide-react";
import { useCreateMemo, useSuppliers, useChartOfAccounts } from "../hooks/useSupplierCreditMemo";
import type { CreateMemoPayload } from "../types";

// ─── Searchable dropdown ───────────────────────────────────────────────────────
interface SearchableSelectProps {
  placeholder: string;
  loading:     boolean;
  options:     { value: string; label: string }[];
  value:       string;
  onChange:    (val: string) => void;
}

function SearchableSelect({ placeholder, loading, options, value, onChange }: SearchableSelectProps) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const inputRef            = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() =>
    search.trim()
      ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      : options,
    [options, search]
  );

  const selected = options.find(o => o.value === value);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {loading ? "Loading..." : (selected?.label ?? placeholder)}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />

          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
            {/* Search input */}
            <div className="flex items-center border-b border-border px-3 py-2 gap-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground text-foreground"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")}>
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            {/* Options list */}
            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No results found.</p>
              ) : (
                filtered.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => handleSelect(o.value)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground text-left"
                  >
                    <Check className={`h-3.5 w-3.5 shrink-0 ${value === o.value ? "opacity-100" : "opacity-0"}`} />
                    {o.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────────
interface AddMemoModalProps {
  onClose:   () => void;
  onSuccess: (message: string) => void;
}

export function AddMemoModal({ onClose, onSuccess }: AddMemoModalProps) {
  const { submit, loading, error } = useCreateMemo();
  const { suppliers, loading: suppLoading } = useSuppliers();
  const { accounts,  loading: coaLoading  } = useChartOfAccounts();

  const [supplierId, setSupplierId] = useState("");
  const [coaId,      setCoaId]      = useState("");

  const today = new Date().toISOString().split("T")[0];

  const supplierOptions = useMemo(() =>
    suppliers.map(s => ({ value: String(s.id), label: s.supplier_name })),
    [suppliers]
  );

  const coaOptions = useMemo(() =>
    accounts.map(a => {
      const id = ('id' in a && typeof (a as { id?: number }).id === 'number') ? (a as { id: number }).id : a.coa_id;
      return { value: String(id), label: a.account_title ?? String(id) };
    }),
    [accounts]
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const payload: CreateMemoPayload = {
      supplier_id:      Number(supplierId),
      chart_of_account: Number(coaId),
      date:             fd.get("date") as string,
      amount:           parseFloat(fd.get("amount") as string),
      reason:           (fd.get("reason") as string).trim() || undefined,
    };

    const result = await submit(payload);
    if (result.success) {
      onSuccess(result.message ?? "Credit memo created successfully.");
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl bg-background rounded-xl border border-border shadow-2xl">

          {/* Header */}
          <div className="flex items-start justify-between px-6 py-5 border-b border-border">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                  Credit
                </Badge>
              </div>
              <h2 className="text-base font-semibold tracking-tight">New Supplier Credit Memo</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date().toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">

                {/* Supplier Name */}
                <div className="col-span-2 md:col-span-1 space-y-1.5">
                  <Label className="text-xs font-medium">
                    Supplier Name <span className="text-destructive">*</span>
                  </Label>
                  <SearchableSelect
                    placeholder="Select supplier..."
                    loading={suppLoading}
                    options={supplierOptions}
                    value={supplierId}
                    onChange={setSupplierId}
                  />
                </div>

                {/* Chart of Account */}
                <div className="col-span-2 md:col-span-1 space-y-1.5">
                  <Label className="text-xs font-medium">
                    Chart of Account <span className="text-destructive">*</span>
                  </Label>
                  <SearchableSelect
                    placeholder="Select account..."
                    loading={coaLoading}
                    options={coaOptions}
                    value={coaId}
                    onChange={setCoaId}
                  />
                </div>

                {/* Memo Date */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Memo Date <span className="text-destructive">*</span>
                  </Label>
                  <Input type="date" name="date" defaultValue={today} required className="h-9 text-xs" />
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Amount <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">₱</span>
                    <Input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required className="h-9 text-xs pl-7" />
                  </div>
                </div>

                {/* Reason */}
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-medium">Reason</Label>
                  <textarea
                    name="reason"
                    rows={3}
                    placeholder="e.g. Price adjustment, damaged goods return..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>

              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                  <X className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-end gap-2 rounded-b-xl">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-9 px-4 text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={loading} className="h-9 px-4 text-xs gap-1.5">
                {loading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>
                  : <><Plus className="h-3.5 w-3.5" /> Add Memo</>
                }
              </Button>
            </div>
          </form>

        </div>
      </div>
    </>
  );
}