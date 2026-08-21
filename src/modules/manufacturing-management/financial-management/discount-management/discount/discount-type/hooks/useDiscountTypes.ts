"use client";

import * as React from "react";
import { toast } from "sonner";

import type { DiscountTypeRow, DiscountTypeUpsert, LineDiscountRow } from "../type";
import * as fp from "../providers/fetchProvider";

export function useDiscountTypes() {
  const [rows, setRows] = React.useState<DiscountTypeRow[]>([]);
  const [lines, setLines] = React.useState<LineDiscountRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DiscountTypeRow | null>(null);
  const [search, setSearch] = React.useState("");

  const filteredRows = React.useMemo(() => {
    if (!search) return rows;
    const lower = search.toLowerCase();
    return rows.filter((r) =>
      (r.discount_type || "").toLowerCase().includes(lower)
    );
  }, [rows, search]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [r, l] = await Promise.all([fp.listDiscountTypes(), fp.listLineDiscounts()]);
      setRows(r);
      setLines(l);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load discount types");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const onCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const onEdit = (row: DiscountTypeRow) => {
    setEditing(row);
    setOpen(true);
  };

  const save = async (payload: DiscountTypeUpsert) => {
    try {
      if (payload.id) {
        await fp.updateDiscountType(payload);
        toast.success("Discount type updated");
      } else {
        await fp.createDiscountType(payload);
        toast.success("Discount type created");
      }
      setOpen(false);
      setEditing(null);
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const remove = async (id: number) => {
    try {
      await fp.deleteDiscountType(id);
      toast.success("Discount type deleted");
      setOpen(false);
      setEditing(null);
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return {
    rows,
    lines,
    loading,
    open,
    setOpen,
    editing,
    search,
    setSearch,
    filteredRows,
    onCreate,
    onEdit,
    save,
    remove,
    refresh,
  };
}
