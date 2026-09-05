"use client";

import { useState, useEffect, useCallback } from "react";

import { DiscountType } from "../types/discount-type.schema";

/**
 * Custom hook for managing discount types
 */
export function useDiscountTypes() {
  const [discountTypes, setDiscountTypes] = useState<DiscountType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch discount types from API
   */
  const fetchDiscountTypes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const apiUrl = "/api/manufacturing/financial-management/discount-management/supplier-registration/discount_types";

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch discount types: ${response.statusText}`,
        );
      }

      const result = await response.json();

      const data = result.data || [];
      setDiscountTypes(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setDiscountTypes([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Initial fetch
   */
  useEffect(() => {
    fetchDiscountTypes();
  }, [fetchDiscountTypes]);

  /**
   * Manual refresh
   */
  const refresh = useCallback(() => {
    fetchDiscountTypes();
  }, [fetchDiscountTypes]);

  return {
    discountTypes,
    isLoading,
    error,
    refresh,
  };
}

