"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Supplier } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discount/types/supplier.schema";

/**
 * Custom hook for managing suppliers data
 * Features:
 * - Memoized state
 * - Search filtering
 * - Auto-refresh on window focus
 * - Manual refresh trigger
 */
export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{
    hasError: boolean;
    message?: string;
  }>({
    hasError: false,
  });
  const [searchQuery, setSearchQuery] = useState("");

  /**
   * Fetch suppliers from API
   */
  const fetchSuppliers = useCallback(async (search?: string, isInitial = false) => {
    try {
      if (isInitial) setIsLoading(true);
      setError({ hasError: false });

      const params = new URLSearchParams();
      if (search && search.trim() !== "") {
        params.set("search", search.trim());
      }

      const url = `/api/manufacturing/financial-management/discount-management/supplier-discount/suppliers${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch suppliers");
      }

      const result = await response.json();
      setSuppliers(result.data || []);
    } catch (err: unknown) {
      setError({
        hasError: true,
        message: (err instanceof Error ? err.message : String(err)) || "Could not load supplier records.",
      });
      setSuppliers([]);
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, []);

  /**
   * Manual refresh function
   */
  const refresh = useCallback(() => {
    fetchSuppliers(searchQuery, true);
  }, [fetchSuppliers, searchQuery]);

  /**
   * Search handler with debounced API call
   */
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
    },
    [],
  );

  /**
   * Debounced server search fetch
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuppliers(searchQuery, false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, fetchSuppliers]);

  /**
   * Initial fetch
   */
  useEffect(() => {
    fetchSuppliers("", true);
  }, [fetchSuppliers]);

  /**
   * Memoized filtered suppliers
   * Client-side filtering for instant feedback
   */
  const filteredSuppliers = useMemo(() => {
    if (!searchQuery || searchQuery.trim() === "") {
      return suppliers;
    }

    const query = searchQuery.toLowerCase();
    return suppliers.filter(
      (supplier) =>
        supplier.supplier_name?.toLowerCase().includes(query) ||
        supplier.tin_number?.toLowerCase().includes(query) ||
        supplier.contact_person?.toLowerCase().includes(query) ||
        supplier.supplier_type?.toLowerCase().includes(query),
    );
  }, [suppliers, searchQuery]);

  return {
    suppliers: filteredSuppliers,
    rawSuppliers: suppliers,
    isLoading,
    error,
    refresh,
    searchQuery,
    setSearchQuery: handleSearch,
  };
}

