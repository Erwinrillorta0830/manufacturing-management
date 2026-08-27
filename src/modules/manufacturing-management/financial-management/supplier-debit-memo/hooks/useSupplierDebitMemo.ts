// src/modules/financial-management/accounting/supplier-debit-memo/hooks/useSupplierDebitMemo.ts

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { SupplierDebitMemo as SupplierMemo, Supplier, ChartOfAccount, CreateDebitMemoPayload, MemoFilters } from "../types";

const API_PATH = "/api/manufacturing/financial-management/supplier-debit-memo";

const DEFAULT_FILTERS: MemoFilters = {
  search:           "",
  supplier_id:      "",
  chart_of_account: "",
  status:           "",
  date_from:        "",
  date_to:          "",
};

function extractList<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  if (typeof json === "object" && json !== null && "data" in json && Array.isArray((json as Record<string, unknown>).data)) {
    return (json as Record<string, unknown>).data as T[];
  }
  return [];
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useSupplierDebitMemo() {
  const [allMemos,  setAllMemos]  = useState<SupplierMemo[]>([]);  // All loaded memos from API
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [filters,   setFilters]   = useState<MemoFilters>(DEFAULT_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);

  // Load all memos once on mount (no filter dependency)
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const toastId = toast.loading('Loading supplier debit memos...');
    try {
      // Load all memos without filters
      const res  = await fetch(`${API_PATH}`);
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg = typeof json === "object" && json !== null && "message" in json
          ? String((json as Record<string, unknown>).message)
          : `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(msg);
      }
      const data = extractList<SupplierMemo>(json);
      setAllMemos(data);
      toast.success('Supplier debit memos loaded successfully', { id: toastId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      toast.error(`Failed to load: ${msg}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter locally using useMemo - all filtering client-side, no API calls
  const memos = useMemo(() => {
    return allMemos.filter(m => {
      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matches = (m.memo_number?.toLowerCase().includes(search)) ||
                       (m.reason?.toLowerCase().includes(search)) ||
                       (m.status?.toLowerCase().includes(search));
        if (!matches) return false;
      }

      // Supplier ID filter
      if (filters.supplier_id && String(m.supplier_id) !== filters.supplier_id) return false;

      // Chart of Account filter
      if (filters.chart_of_account && String(m.chart_of_account) !== filters.chart_of_account) return false;

      // Status filter
      if (filters.status && m.status !== filters.status) return false;

      // Date range filters - use string comparison
      if (filters.date_from) {
        const memoDate = (m.date || '').split(' ')[0];  // Extract YYYY-MM-DD
        if (memoDate && memoDate < filters.date_from) return false;
      }
      if (filters.date_to) {
        const memoDate = (m.date || '').split(' ')[0];  // Extract YYYY-MM-DD
        if (memoDate && memoDate > filters.date_to) return false;
      }

      return true;
    });
  }, [allMemos, filters]);

  const total = memos.length;

  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (type === "success") toast.success(message);
    else toast.error(message);
  };

  const updateFilter = <K extends keyof MemoFilters>(key: K, value: MemoFilters[K]) =>
    setFilters(f => ({ ...f, [key]: value }));

  const clearFilters = () => setFilters(DEFAULT_FILTERS);
  const hasFilters   = Object.values(filters).some(Boolean);

  const stats = {
    total,
    available:      memos.filter(m => m.status === "Available").length,
    pendingSOA:     memos.filter(m => m.status === "Pending SOA").length,
    totalAvailable: memos.filter(m => m.status === "Available").reduce((s, m) => s + parseFloat(m.amount), 0),
    totalAmount:    memos.reduce((s, m) => s + parseFloat(m.amount), 0),
  };

  return {
    memos, total, loading, error,
    filters, updateFilter, clearFilters, hasFilters,
    toast: null,
    showToast,
    modalOpen, setModalOpen,
    stats,
    refetch: load,
  };
}

// ─── Suppliers dropdown ───────────────────────────────────────────────────────
export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const r    = await fetch(`${API_PATH}?action=suppliers`);
        const json: unknown = await r.json();
        // Only include suppliers with supplier_type === 'TRADE'
        const allSuppliers = extractList<Supplier & { supplier_type?: string }>(json);
        const tradeSuppliers = allSuppliers.filter(s => s.supplier_type === 'TRADE');
        if (!cancelled) setSuppliers(tradeSuppliers);
      } catch {
        // silent  dropdowns fail gracefully
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  return { suppliers, loading };
}

// ─── COA dropdown ─────────────────────────────────────────────────────────────
export function useChartOfAccounts() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const r    = await fetch(`${API_PATH}?action=chart-of-accounts`);
        const json: unknown = await r.json();
        if (!cancelled) setAccounts(extractList<ChartOfAccount>(json));
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  return { accounts, loading };
}

// ─── Create memo ──────────────────────────────────────────────────────────────
export function useCreateDebitMemo() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const submit = async (payload: CreateDebitMemoPayload) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(API_PATH, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const json: unknown = await res.json();
      const jsonObj = json as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(
          String(jsonObj?.message || jsonObj?.error || (jsonObj?.errors as unknown[])?.[0] || `HTTP ${res.status}`)
        );
      }
      return {
        success: true,
        data:    jsonObj.data ?? json,
        message: typeof jsonObj.message === "string" ? jsonObj.message : "Memo created successfully.",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return { submit, loading, error };
}