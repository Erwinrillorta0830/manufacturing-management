"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { StockConversionProduct, StockConversionPayload } from "../types/stock-conversion.types";

export function useStockConversion() {
  const [data, setData] = useState<StockConversionProduct[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<{
    brands: { id: number; name: string }[];
    categories: { id: number; name: string }[];
    units: { id: number; name: string }[];
    suppliers: { id: number; name: string; shortcut: string }[];
  }>({ brands: [], categories: [], units: [], suppliers: [] });

  const loadingProductsRef = useRef<Set<number>>(new Set());

  /**
   * Validate if an RFID tag is already used or exists in history
   */
  const validateDuplicateTag = useCallback(async (rfid: string, mode: "source" | "target" = "target"): Promise<{ exists: boolean; reason?: string }> => {
    try {
      const sp = new URLSearchParams({ action: "validate_tag", rfid, mode });
      const res = await fetch(`/api/scm/transfers/stock-conversion/validate-rfid?${sp.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Validation failed");
      const data = await res.json();
      return { exists: !!data.exists, reason: data.reason };
    } catch (e: unknown) {
      console.error("Tag validation error:", e);
      return { exists: true, reason: "error" };
    }
  }, []);


  /**
   * Fetch inventory balances for specific products directly from Spring Boot
   * via /api/manufacturing/product-onhand (client-side proxy — no Directus)
   */
  const loadProductsInventory = useCallback(async (productIds: number[]) => {
    const fetchableIds = productIds.filter(id => !loadingProductsRef.current.has(id));
    if (!fetchableIds.length) return;
    
    fetchableIds.forEach(id => loadingProductsRef.current.add(id));

    setData(prev => prev.map(p => 
      fetchableIds.includes(p.productId) ? { ...p, inventoryLoaded: p.inventoryLoaded ?? false } : p
    ));

    try {
      const activeBranchId = filters.branchId || "";
      const invMap: Record<number, number> = {};

      // Fetch per-product on-hand from Spring Boot /api/mm-product-onhand/filter?product=...
      await Promise.all(
        fetchableIds.map(async (pid) => {
          const sp = new URLSearchParams();
          if (activeBranchId) sp.set("branch", activeBranchId);
          sp.set("product", String(pid));

          const res = await fetch(`/api/manufacturing/product-onhand?${sp.toString()}`, { cache: "no-store" });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.error(`[useStockConversion] Product ${pid} onhand error (HTTP ${res.status}):`, errData);
            throw new Error(`Spring Boot error HTTP ${res.status}: ${JSON.stringify(errData)}`);
          }

          const onhandList: Array<{ productId: number; branchId: number; onhandQuantity: number; totalQuantityIn: number; totalQuantityOut: number }> = await res.json();
          console.group(`📦 [ProductOnhand] /api/manufacturing/product-onhand (Product: ${pid}, Branch: ${activeBranchId || 'ALL'})`);
          console.log(`📌 Raw API response:`, onhandList);
          console.groupEnd();

          onhandList.forEach((item) => {
            const pId = Number(item.productId);
            const qty = Math.max(0, Number(item.onhandQuantity ?? 0));
            if (pId > 0) {
              invMap[pId] = (invMap[pId] || 0) + qty;
            }
          });
        })
      );

      console.group(`✅ [ProductOnhand] Resolved invMap for requested products`);
      console.table(
        fetchableIds.map((pid) => ({
          productId: pid,
          resolvedQty: invMap[pid] ?? '0 (no movements)',
        }))
      );
      console.groupEnd();

      setData(prev => {
        return prev.map(p => {
          if (!fetchableIds.includes(p.productId)) return p;
          const finalQty = invMap[p.productId] ?? 0;
          console.log(`[ProductOnhand] "${p.productName}" (ID: ${p.productId}) → ${finalQty} ${p.currentUnit}`);
          return {
            ...p,
            quantity: finalQty,
            totalAmount: Number((finalQty * (p.pricePerUnit || 0)).toFixed(2)),
            inventoryLoaded: true,
            inventoryError: false,
          };
        });
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("[useStockConversion] Inventory fetch failed with error:", message);
      toast.error("Spring Boot Inventory Error", {
        description: message,
      });
      setData(prev => prev.map(p => 
        fetchableIds.includes(p.productId) ? { ...p, inventoryLoaded: true, inventoryError: true } : p
      ));
    } finally {
      fetchableIds.forEach(id => loadingProductsRef.current.delete(id));
    }
  }, [filters.branchId]);

  /**
   * Fetch paginated product list with filters
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const activeBranchId = filters.branchId || "";
      const sp = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        ...filters,
      });
      if (activeBranchId) sp.set("branchId", String(activeBranchId));

      const res = await fetch(`/api/scm/transfers/stock-conversion?${sp.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch stock conversion data");
      
      const newData = json.data || [];
      setData(newData);
      setTotalCount(json.totalCount || 0);
      if (json.options) setOptions(json.options);
      
      if (newData.length) {
        loadProductsInventory(newData.map((p: StockConversionProduct) => p.productId));
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setIsLoading(false);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, filters, loadProductsInventory]);

  /**
   * Convert stock action
   */
  const convertStockAction = async (payload: StockConversionPayload) => {
    setIsUpdating(true);
    setConvertingId(payload.productId);
    try {
      const res = await fetch("/api/scm/transfers/stock-conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to convert stock");

      toast.success("Stock conversion complete!");
      
      setData(prev => prev.map(p => {
        if (p.productId === payload.productId) {
          const newQty = Math.max(0, p.quantity - payload.quantityToConvert);
          return { ...p, quantity: newQty, totalAmount: Number((newQty * p.pricePerUnit).toFixed(2)) };
        }
        if (p.productId === payload.targetProductId) {
          const newQty = p.quantity + payload.convertedQuantity;
          return { ...p, quantity: newQty, totalAmount: Number((newQty * p.pricePerUnit).toFixed(2)) };
        }
        return p;
      }));

      return resData;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      toast.error(message);
      throw e;
    } finally {
      setIsUpdating(false);
      setConvertingId(null);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      refresh();
    });
  }, [refresh]);

  return {
    data,
    totalCount,
    page,
    pageSize,
    setPage,
    setPageSize,
    options,
    isLoading,
    isUpdating,
    convertingId,
    error,
    refresh,
    loadProductsInventory,
    validateDuplicateTag,

    setFilters: (update: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
      setFilters(prev => {
        const next = typeof update === 'function' ? update(prev) : update;
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        return next;
      });
    },
    convertStock: convertStockAction,
  };
}