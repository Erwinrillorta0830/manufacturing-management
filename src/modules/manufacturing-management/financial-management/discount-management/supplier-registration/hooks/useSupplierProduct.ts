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
      const apiUrl = `/api/manufacturing/financial-management/discount-management/supplier-registration/suppliers/${id}/products`;

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
   * Add product to supplier
   */
  const addProduct = useCallback(
    async (productId: number, discountType: number | null = null) => {
      if (!supplierId) return false;
      try {
        // Logic: The API route already handles the "isProductAlreadyAdded" check server-side
        const response = await fetch(
          `/api/manufacturing/financial-management/discount-management/supplier-registration/suppliers/${supplierId}/products`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: productId,
              discount_type: discountType,
            }),
          },
        );

        const result = await response.json();

        if (!response.ok) {
          toast.error(result.error || "Failed to add product");
          return false;
        }

        toast.success("Product added successfully");
        await fetchProducts(supplierId, true);
        return true;
      } catch (err) {
        console.error(err);
        toast.error("An error occurred while adding the product");
        return false;
      }
    },
    [supplierId, fetchProducts],
  );

  /**
   * Update discount type for product
   */
  const updateDiscount = useCallback(
    async (itemId: number, discountType: number | null) => {
      if (!supplierId) return false;
      try {
        const response = await fetch(
          `/api/manufacturing/financial-management/discount-management/supplier-registration/products-per-supplier/${itemId}`,
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
          `/api/manufacturing/financial-management/discount-management/supplier-registration/products-per-supplier/${itemId}`,
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

  /**
   * Add multiple products to supplier in bulk
   */
  const addProductsBulk = useCallback(
    async (productIds: number[]) => {
      if (!supplierId || productIds.length === 0) return false;
      try {
        setIsLoading(true);

        const response = await fetch(
          `/api/manufacturing/financial-management/discount-management/supplier-registration/suppliers/${supplierId}/products/bulk`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: productIds }),
          },
        );

        const result = await response.json();

        if (!response.ok) {
          toast.error(result.error || "Failed to add products in bulk");
          return false;
        }

        toast.success(result.message || "Products added successfully");
        await fetchProducts(supplierId, true);
        return true;
      } catch (err) {
        console.error(err);
        toast.error("An error occurred during bulk assignment");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [supplierId, fetchProducts],
  );

  return {
    products,
    isLoading,
    error,
    addProduct,
    addProductsBulk,
    updateDiscount,
    removeProduct,
    refresh,
  };
}

