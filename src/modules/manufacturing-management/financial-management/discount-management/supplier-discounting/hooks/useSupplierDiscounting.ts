// src/modules/financial-management/accounting/discount-management/supplier-discounting/hooks/useSupplierDiscounting.ts
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { supplierDiscountingApi } from "../providers/supplierDiscountingApi";
import type {
  SupplierDiscountBulkResult,
  SupplierDiscountFilterState,
  SupplierDiscountModuleData,
  SupplierDiscountProductPage,
  SupplierDiscountSupplier,
} from "../types";

const emptyProductPage: SupplierDiscountProductPage = {
  products: [],
  filterOptions: {
    supplierId: null,
    categories: [],
    brands: [],
  },
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    search: "",
  },
  emptyStateMessage: null,
};

/**
 * Formats failed bulk rows so the toast identifies the exact products that failed.
 */
function failedRuleDescription(failed: SupplierDiscountBulkResult["failed"], savedCount: number) {
  const rows = failed
    .map((item) => `${item.productName}: ${item.reason}`)
    .join("\n");
  const saved = savedCount > 0 ? `${savedCount} rule(s) saved.\n` : "";
  return `${saved}${rows}`;
}

/**
 * Coordinates supplier selection, product loading, and bulk discount mutations.
 */
export function useSupplierDiscounting(initialModuleData: SupplierDiscountModuleData) {
  const [moduleData, setModuleData] = useState<SupplierDiscountModuleData>(initialModuleData);
  const [moduleDataLoading, setModuleDataLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierDiscountSupplier | null>(null);
  const [productPage, setProductPage] = useState<SupplierDiscountProductPage>(emptyProductPage);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loadSeqRef = useRef(0);

  /**
   * Loads parent products that match the current assignment filters.
   */
  const loadProducts = useCallback(async (query?: {
    page?: number;
    pageSize?: number;
    search?: string;
    categoryId?: number | null;
    brandId?: number | null;
    supplierId?: number | null;
    discountState?: SupplierDiscountFilterState;
    discountTypeId?: number | null;
  }) => {
    const seq = ++loadSeqRef.current;
    try {
      setProductsLoading(true);
      setProductError(null);
      const result = await supplierDiscountingApi.getProducts(query);
      if (seq !== loadSeqRef.current) return;
      setProductPage(result);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load parent products";
      toast.error(message);
      setProductError(message);
      setProductPage(emptyProductPage);
    } finally {
      if (seq === loadSeqRef.current) setProductsLoading(false);
    }
  }, []);

  /**
   * Updates supplier selection and clears stale row selections.
   */
  const selectSupplier = useCallback((supplierId: number | null) => {
    const supplier = moduleData.suppliers.find((item) => item.id === supplierId) ?? null;
    setSelectedSupplier(supplier);
    setSelectedProductIds([]);
  }, [moduleData.suppliers]);

  /**
   * Toggles a product in the bulk assignment selection.
   */
  const toggleProduct = useCallback((productId: number, checked: boolean) => {
    setSelectedProductIds((current) => {
      if (checked) return Array.from(new Set([...current, productId]));
      return current.filter((item) => item !== productId);
    });
  }, []);

  /**
   * Applies the selected discount to every selected product, creating or updating rules as needed.
   */
  const applyBulkDiscount = useCallback(async (discountTypeId: number | null) => {
    if (!selectedSupplier) {
      toast.error("Select a supplier first");
      return false;
    }

    if (!discountTypeId) {
      toast.error("Select a discount first");
      return false;
    }

    if (selectedProductIds.length === 0) {
      toast.error("Select at least one parent product");
      return false;
    }

    try {
      setSaving(true);
      const preflight = await supplierDiscountingApi.preflightRules({
        supplierId: selectedSupplier.id,
        productIds: selectedProductIds,
      });
      const result = await supplierDiscountingApi.bulkApplyRules({
        supplierId: selectedSupplier.id,
        discountTypeId,
        newLinks: preflight.newLinks,
        existingLinks: preflight.existingLinks,
      });

      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} product discount rule(s) failed to save`, {
          description: failedRuleDescription(result.failed, result.created + result.updated),
        });
        setSelectedProductIds(result.failed.map((item) => item.productId));
      } else {
        const parts: string[] = [];
        if (result.created > 0) parts.push(`${result.created} created`);
        if (result.updated > 0) parts.push(`${result.updated} updated`);
        toast.success(parts.length > 0 ? parts.join(", ") : `Applied ${result.created + result.updated} supplier discount rule(s)`);
        setSelectedProductIds([]);
      }

      return result.failed.length === 0;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply supplier discounts");
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedProductIds, selectedSupplier]);

  /**
   * Retries loading the module metadata (suppliers, categories, brands, discounts).
   */
  const refreshModuleData = useCallback(async () => {
    try {
      setModuleDataLoading(true);
      const data = await supplierDiscountingApi.getModuleData();
      setModuleData(data);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reload module data");
      return false;
    } finally {
      setModuleDataLoading(false);
    }
  }, []);

  const deleteRule = useCallback(async (id: number) => {
    if (!selectedSupplier) return false;

    try {
      setSaving(true);
      await supplierDiscountingApi.deleteRule(id, selectedSupplier.id);
      toast.success("Supplier discount cleared");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear supplier discount");
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedSupplier]);

  return {
    moduleData,
    selectedSupplier,
    productPage,
    selectedProductIds,
    productsLoading,
    productError,
    setProductError,
    moduleDataLoading,
    saving,
    loadProducts,
    selectSupplier,
    toggleProduct,
    setSelectedProductIds,
    applyBulkDiscount,
    deleteRule,
    refreshModuleData,
  };
}
