import { format } from "date-fns";
import {
  SummaryFilters,
  SummaryKPIs,
  TrendItem,
  BranchItem,
  ProductItem,
  SupplierItem
} from "../types/stock-adjustment-summary.types";
import {
  StockAdjustmentHeader,
  StockAdjustmentItem
} from "../../stock-adjustment-registration/types/stock-adjustment.schema";

export const stockAdjustmentSummaryService = {
  // Helper to extract if posted or draft
  getIsPosted(item: StockAdjustmentHeader): boolean {
    const rawPosted = item.isPosted;
    if (rawPosted && typeof rawPosted === "object" && "data" in rawPosted) {
      return (rawPosted as { data: number[] }).data?.[0] === 1;
    }
    return Number(rawPosted) === 1;
  },

  // Perform client-side filter evaluations to match the main list behavior
  filterData(rawData: StockAdjustmentHeader[], filters: SummaryFilters): StockAdjustmentHeader[] {
    return rawData.filter((item) => {
      // 0. Search Filter (Document No, Branch Name, Supplier Name, Remarks, Product Name/Code/Batch)
      if (filters.search && filters.search.trim() !== "") {
        const query = filters.search.toLowerCase().trim();
        const docNo = (item.doc_no || "").toLowerCase();
        const branchName = typeof item.branch_id === "object" ? (item.branch_id?.branch_name || "").toLowerCase() : "";
        const supplierName = typeof item.supplier_id === "object" ? (item.supplier_id?.supplier_name || "").toLowerCase() : "";
        const remarks = (item.remarks || "").toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const productMatch = Array.isArray(item.items) && item.items.some((sub: any) => {
          const pName = (sub.product_name || sub.product_id?.product_name || sub.product_id?.description || "").toLowerCase();
          const pCode = (sub.product_code || sub.product_id?.product_code || "").toLowerCase();
          const bNo = (sub.batch_no || "").toLowerCase();
          return pName.includes(query) || pCode.includes(query) || bNo.includes(query);
        });

        const matches =
          docNo.includes(query) ||
          branchName.includes(query) ||
          supplierName.includes(query) ||
          remarks.includes(query) ||
          productMatch;

        if (!matches) return false;
      }

      // 0.5 Branch Filter
      if (filters.branchId) {
        const itemBranchId = typeof item.branch_id === "object" ? item.branch_id?.id : item.branch_id;
        if (Number(itemBranchId) !== Number(filters.branchId)) return false;
      }

      // 0.8 Type Filter
      if (filters.type) {
        if (item.type !== filters.type) return false;
      }

      // 1. Status Filter
      if (filters.status) {
        const posted = this.getIsPosted(item);
        if (filters.status === "Posted" && !posted) return false;
        if (filters.status === "Unposted" && posted) return false;
      }

      // 1.5 Supplier Filter
      if (filters.supplierId) {
        const itemSupplierId = typeof item.supplier_id === "object" ? item.supplier_id?.id : item.supplier_id;
        if (Number(itemSupplierId) !== Number(filters.supplierId)) return false;
      }

      // 2. From Date Filter (Inclusive)
      if (filters.fromDate && item.created_at) {
        const itemDate = new Date(item.created_at);
        const filterFrom = new Date(filters.fromDate);
        filterFrom.setHours(0, 0, 0, 0);
        if (itemDate < filterFrom) return false;
      }

      // 3. To Date Filter (Inclusive)
      if (filters.toDate && item.created_at) {
        const itemDate = new Date(item.created_at);
        const filterTo = new Date(filters.toDate);
        filterTo.setHours(23, 59, 59, 999);
        if (itemDate > filterTo) return false;
      }

      return true;
    });
  },

  computeKPIs(data: StockAdjustmentHeader[]): SummaryKPIs {
    const totalAdjustments = data.length;
    const postedCount = data.filter((item) => this.getIsPosted(item)).length;
    const unpostedCount = totalAdjustments - postedCount;
    const postingRate = totalAdjustments > 0 ? (postedCount / totalAdjustments) * 100 : 0;

    const totalStockInValue = data
      .filter((item) => item.type === "IN")
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const totalStockOutValue = data
      .filter((item) => item.type === "OUT")
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const netImpact = totalStockInValue - totalStockOutValue;
    const grossValue = totalStockInValue + totalStockOutValue;

    const totalItemsCount = data.reduce((sum, item) => {
      if (Array.isArray(item.items)) {
        return sum + item.items.reduce((itemSum: number, sub: StockAdjustmentItem) => itemSum + (Number(sub.quantity) || 0), 0);
      }
      return sum;
    }, 0);

    return {
      totalAdjustments,
      postedCount,
      unpostedCount,
      postingRate,
      totalStockInValue,
      totalStockOutValue,
      netImpact,
      grossValue,
      totalItemsCount
    };
  },

  computeTrendData(data: StockAdjustmentHeader[]): TrendItem[] {
    const trendMap = new Map<string, { dateStr: string; inValue: number; outValue: number; count: number }>();

    data.forEach((item) => {
      if (!item.created_at) return;
      const dateKey = format(new Date(item.created_at), "yyyy-MM-dd");
      const label = format(new Date(item.created_at), "MMM dd");
      const existing = trendMap.get(dateKey) || { dateStr: label, inValue: 0, outValue: 0, count: 0 };

      const amt = Number(item.amount) || 0;
      if (item.type === "IN") {
        existing.inValue += amt;
      } else {
        existing.outValue += amt;
      }
      existing.count += 1;
      trendMap.set(dateKey, existing);
    });

    return Array.from(trendMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, val]) => val);
  },

  computeBranchData(data: StockAdjustmentHeader[]): BranchItem[] {
    const branchMap = new Map<string, { name: string; inValue: number; outValue: number; total: number; count: number }>();

    data.forEach((item) => {
      const branchName = typeof item.branch_id === "object" ? item.branch_id?.branch_name : item.branch_id || "Main Warehouse";
      const existing = branchMap.get(branchName) || { name: branchName, inValue: 0, outValue: 0, total: 0, count: 0 };
      const amt = Number(item.amount) || 0;

      if (item.type === "IN") {
        existing.inValue += amt;
      } else {
        existing.outValue += amt;
      }
      existing.total += amt;
      existing.count += 1;
      branchMap.set(branchName, existing);
    });

    return Array.from(branchMap.values()).sort((a, b) => b.total - a.total);
  },

  computeProductData(data: StockAdjustmentHeader[]): ProductItem[] {
    const productMap = new Map<string, { name: string; code: string; quantity: number; value: number }>();

    data.forEach((item) => {
      if (Array.isArray(item.items)) {
        item.items.forEach((sub: StockAdjustmentItem) => {
          const name = (typeof sub.product_id === "object" && sub.product_id !== null ? (sub.product_id as unknown as { description?: string; product_name?: string }).description : undefined) || sub.product_name || "Unknown Product";
          const code = sub.product_code || "";
          const cost = Number(sub.cost_per_unit || (typeof sub.product_id === "object" && sub.product_id !== null ? (sub.product_id as unknown as { cost_per_unit?: number }).cost_per_unit : 0)) || 0;
          const qty = Number(sub.quantity) || 0;
          const key = `${code}-${name}`;
          const existing = productMap.get(key) || { name, code, quantity: 0, value: 0 };

          existing.quantity += qty;
          existing.value += qty * cost;
          productMap.set(key, existing);
        });
      }
    });

    return Array.from(productMap.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  },

  computeSupplierData(data: StockAdjustmentHeader[]): SupplierItem[] {
    const supplierMap = new Map<string, { name: string; value: number; count: number }>();

    data.forEach((item) => {
      const supplierName = typeof item.supplier_id === "object" ? item.supplier_id?.supplier_name : item.supplier_id || "N/A";
      const existing = supplierMap.get(supplierName) || { name: supplierName, value: 0, count: 0 };
      const amt = Number(item.amount) || 0;

      existing.value += amt;
      existing.count += 1;
      supplierMap.set(supplierName, existing);
    });

    return Array.from(supplierMap.values())
      .filter((s) => s.name !== "N/A")
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }
};
