"use client";

import { useState, useEffect, useCallback } from "react";

import { toast } from "sonner";
// import { fetchSupplierProducts, ... } from \"../services/products-per-suppliers\";
import { ProductPerSupplierWithDetails } from "../types/product-per-suppplier.schema";

/**
 * Custom hook for managing products assigned to a supplier
 */
export function useSupplierProducts(supplierId: number | null) {
  const [products, setProducts] = useState<ProductPerSupplierWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch products for supplier
   */
  const fetchProducts = useCallback(async (id: number, silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      setError(null);

      // DEBUGGER
      const apiUrl = `/api/manufacturing/financial-management/discount-management/supplier-discount/suppliers/${id}/products`;

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error("Failed to fetch products from API bridge");
      }

      const result = await response.json();
      setProducts(result.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setProducts([]);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  /**
   * Update discount type for product
   */
  const updateDiscount = useCallback(
    async (itemId: number, discountType: number | null) => {
      if (!supplierId) return false;
      try {
        const response = await fetch(
          `/api/manufacturing/financial-management/discount-management/supplier-discount/products-per-supplier/${itemId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ discount_type: discountType }),
          },
        );

        if (!response.ok) throw new Error("Update failed");
        toast.success("Discount type updated");
        await fetchProducts(supplierId, true);
        return true;
      } catch {
        toast.error("Failed to update discount");
        return false;
      }
    },
    [supplierId, fetchProducts],
  );

  /**
   * Remove product from supplier
   */
  const removeProduct = useCallback(
    async (itemId: number) => {
      if (!supplierId) return false;
      try {
        const response = await fetch(
          `/api/manufacturing/financial-management/discount-management/supplier-discount/products-per-supplier/${itemId}`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok) throw new Error("Delete failed");
        toast.success("Product removed");
        await fetchProducts(supplierId, true);
        return true;
      } catch {
        toast.error("Failed to remove product");
        return false;
      }
    },
    [supplierId, fetchProducts],
  );

  /**
   * Fetch products when supplierId changes
   */
  useEffect(() => {
    if (supplierId) {
      fetchProducts(supplierId);
    } else {
      setProducts([]);
      setError(null);
    }
  }, [supplierId, fetchProducts]);

  /**
   * Manual refresh
   */
  const refresh = useCallback(() => {
    if (supplierId) {
      fetchProducts(supplierId);
    }
  }, [supplierId, fetchProducts]);

  return {
    products,
    isLoading,
    error,
    updateDiscount,
    removeProduct,
    refresh,
  };
}

