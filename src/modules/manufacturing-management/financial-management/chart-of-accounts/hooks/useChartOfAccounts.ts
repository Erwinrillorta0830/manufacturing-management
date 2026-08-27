// src/modules/financial-management/chart-of-accounts/hooks/useChartOfAccounts.ts
"use client";

import * as React from "react";
import { toast } from "sonner";

import type { AccountTypeRow, BalanceTypeRow, BSISTypeRow, COARow, UserRow } from "../types";
import * as api from "../providers/fetchProvider";

type EditState =
  | { open: false; row: null }
  | { open: true; row: COARow };

export function useChartOfAccounts() {
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);

  const [rows, setRows] = React.useState<COARow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const [accountTypes, setAccountTypes] = React.useState<AccountTypeRow[]>([]);
  const [balanceTypes, setBalanceTypes] = React.useState<BalanceTypeRow[]>([]);
  const [bsisTypes, setBsisTypes] = React.useState<BSISTypeRow[]>([]);
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [lookupsLoading, setLookupsLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<EditState>({ open: false, row: null });

  const [currentUser, setCurrentUser] = React.useState<{ id: number | null; name: string } | null>(null);

  React.useEffect(() => {
    async function loadMe() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (data?.id) {
          const name = [data.user_fname, data.user_lname].filter(Boolean).join(" ") || data.user_email || "User";
          setCurrentUser({ id: Number(data.id), name });
        }
      } catch (e) {
        console.error("Failed to load session user", e);
      }
    }
    loadMe();
  }, []);

  const loadLookups = React.useCallback(async () => {
    try {
      setLookupsLoading(true);
      const [a, b, c, u] = await Promise.all([
        api.listAccountTypes(),
        api.listBalanceTypes(),
        api.listBSISTypes(),
        api.listUsers(),
      ]);
      setAccountTypes(a);
      setBalanceTypes(b);
      setBsisTypes(c);
      setUsers(u);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load lookups");
    } finally {
      setLookupsLoading(false);
    }
  }, []);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.listCOA({ q, page, pageSize });
      setRows(res.data ?? []);
      const t = res?.meta?.filter_count ?? res?.meta?.total_count ?? 0;
      setTotal(typeof t === "number" ? t : 0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load chart of accounts");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, page, pageSize]);

  React.useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  React.useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setCreateOpen(true);
  }

  function openEdit(row: COARow) {
    setEditState({ open: true, row });
  }

  function closeEdit() {
    setEditState({ open: false, row: null });
  }

  async function create(payload: Parameters<typeof api.createCOA>[0]) {
    try {
      const body = {
        ...payload,
        added_by: payload.added_by || currentUser?.id || null,
      } as Parameters<typeof api.createCOA>[0];
      await api.createCOA(body);
      toast.success("Account created");
      setCreateOpen(false);
      setPage(1);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function update(id: number, payload: Parameters<typeof api.updateCOA>[1]) {
    try {
      const body = {
        ...payload,
        added_by: currentUser?.id || payload.added_by || null,
      } as Parameters<typeof api.updateCOA>[1];
      await api.updateCOA(id, body);
      toast.success("Changes saved");
      closeEdit();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteCOA(id);
      toast.success("Account deleted");
      // If last item on page, go back a page (basic)
      const after = Math.max(0, total - 1);
      const maxPage = Math.max(1, Math.ceil(after / pageSize));
      if (page > maxPage) setPage(maxPage);
      else await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < pageCount;

  return {
    // list
    rows,
    total,
    loading,

    // search/paging
    q,
    setQ,
    page,
    setPage,
    pageSize,
    pageCount,
    canPrev,
    canNext,

    // lookups
    accountTypes,
    balanceTypes,
    bsisTypes,
    users,
    lookupsLoading,

    // dialogs
    createOpen,
    setCreateOpen,
    editState,
    openCreate,
    openEdit,
    closeEdit,

    // actions
    create,
    update,
    remove,

    // session
    currentUser,
  };
}
