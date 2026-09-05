"use client";

import { useState, useEffect, useCallback } from "react";

import { Product } from "../types/product.schema";

/**
 * Custom hook for managing products list
 */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{
    hasError: boolean;
    message?: string;
  }>({
    hasError: false,
  });
  const [searchQuery, setSearchQuery] = useState("");

  /**
   * Fetch products from API
   */
  const fetchProducts = useCallback(async (search?: string) => {
    try {
      setIsLoading(true);
      setError({ hasError: false, message: "" });

      // CALL THE BRIDGE, NOT THE SERVICE
      const url = new URL(
        "/api/manufacturing/financial-management/discount-management/supplier-registration/products",
        window.location.origin,
      );
      if (search) url.searchParams.append("search", search);

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Server returned ${response.status}`);

      const result = await response.json();
      setProducts(result.data || []);
    } catch (err: unknown) {
      setError({ hasError: true, message: (err instanceof Error ? err.message : String(err)) });
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Search handler
   */
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      fetchProducts(query);
    },
    [fetchProducts],
  );

  /**
   * Initial fetch
   */
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  /**
   * Manual refresh
   */
  const refresh = useCallback(() => {
    fetchProducts(searchQuery);
  }, [fetchProducts, searchQuery]);

  return {
    products,
    isLoading,
    error,
    refresh,
    searchQuery,
    setSearchQuery: handleSearch,
  };
}

