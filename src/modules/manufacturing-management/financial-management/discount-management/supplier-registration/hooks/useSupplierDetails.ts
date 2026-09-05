"use client";

import { useState, useEffect, useCallback } from "react";
import { Supplier } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/supplier.schema";

/**
 * Custom hook for fetching single supplier details
 */
export function useSupplierDetails(supplierId: number | null) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch supplier details
   */
  const fetchSupplier = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/manufacturing/financial-management/discount-management/supplier-registration/suppliers/${id}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch supplier details");
      }

      const result = await response.json();
      setSupplier(result.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setSupplier(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch when supplierId changes
   */
  useEffect(() => {
    if (supplierId) {
      fetchSupplier(supplierId);
    } else {
      setSupplier(null);
      setError(null);
    }
  }, [supplierId, fetchSupplier]);

  /**
   * Manual refresh
   */
  const refresh = useCallback(() => {
    if (supplierId) {
      fetchSupplier(supplierId);
    }
  }, [supplierId, fetchSupplier]);

  return {
    supplier,
    isLoading,
    error,
    refresh,
  };
}

