// src/modules/financial-management/line-discount/hooks/useLineDiscounts.ts
"use client";

import * as React from "react";
import { toast } from "sonner";
import type { LineDiscountRow, LineDiscountUpsert } from "../type";
import * as api from "../providers/fetchProvider";

export function useLineDiscounts() {
  const [rows, setRows] = React.useState<LineDiscountRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const refresh = React.useCallback(() => setRefreshKey((v) => v + 1), []);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);

    api
      .listLineDiscounts()
      .then((data) => {
        if (!alive) return;
        setRows(data);
      })
      .catch((e) => {
        if (!alive) return;
        toast.error(e?.message || "Failed to load line discounts");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const create = React.useCallback(async (payload: LineDiscountUpsert) => {
    try {
      const created = await api.createLineDiscount(payload);
      toast.success("Line discount created");
      setRows((prev) => [...prev, created].sort((a, b) => (a.line_discount || "").localeCompare(b.line_discount || "")));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create line discount");
    }
  }, []);

  const update = React.useCallback(async (id: number, payload: LineDiscountUpsert) => {
    try {
      const updated = await api.updateLineDiscount(id, payload);
      toast.success("Line discount updated");
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update line discount");
    }
  }, []);

  const remove = React.useCallback(async (id: number) => {
    try {
      await api.deleteLineDiscount(id);
      toast.success("Line discount deleted");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete line discount");
    }
  }, []);

  return { rows, loading, refresh, create, update, remove };
}
