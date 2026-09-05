"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Representative,
  RepresentativeFormValues,
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/representative.schema";
import { toast } from "sonner";

/**
 * Custom hook for managing supplier representatives
 * Features:
 * - Fetch representatives by supplier
 * - Add new representative
 * - Remove representative
 * - Auto-refresh
 */
export function useRepresentatives(supplierId: number | null) {
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch representatives for supplier
   */
  const fetchRepresentatives = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/manufacturing/financial-management/discount-management/supplier-registration/representatives?supplier_id=${id}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch representatives");
      }

      const result = await response.json();
      setRepresentatives(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setRepresentatives([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Add new representative
   */
  const addRepresentative = useCallback(
    async (data: Omit<RepresentativeFormValues, "supplier_id">) => {
      if (!supplierId) {
        toast.error("Supplier ID is required");
        return false;
      }

      try {
        const payload: RepresentativeFormValues = {
          ...data,
          supplier_id: supplierId,
        };

        const response = await fetch(
          "/api/manufacturing/financial-management/discount-management/supplier-registration/representatives",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        const result = await response.json();

        if (!response.ok) {
          toast.error(result.error || "Failed to add representative");
          return false;
        }

        toast.success("Representative added successfully");

        // Refresh list
        await fetchRepresentatives(supplierId);
        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        toast.error(errorMsg);
        return false;
      }
    },
    [supplierId, fetchRepresentatives],
  );

  /**
   * Remove representative
   */
  const removeRepresentative = useCallback(
    async (id: number) => {
      if (!supplierId) {
        toast.error("Supplier ID is required");
        return false;
      }

      try {
        const response = await fetch(
          `/api/manufacturing/financial-management/discount-management/supplier-registration/representatives/${id}`,
          {
            method: "DELETE",
          },
        );

        const result = await response.json();

        if (!response.ok) {
          toast.error(result.error || "Failed to remove representative");
          return false;
        }

        toast.success("Representative removed successfully");

        // Refresh list
        await fetchRepresentatives(supplierId);
        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        toast.error(errorMsg);
        return false;
      }
    },
    [supplierId, fetchRepresentatives],
  );

  /**
   * Fetch when supplierId changes
   */
  useEffect(() => {
    if (supplierId) {
      fetchRepresentatives(supplierId);
    } else {
      setRepresentatives([]);
      setError(null);
    }
  }, [supplierId, fetchRepresentatives]);

  /**
   * Manual refresh
   */
  const refresh = useCallback(() => {
    if (supplierId) {
      fetchRepresentatives(supplierId);
    }
  }, [supplierId, fetchRepresentatives]);

  return {
    representatives,
    isLoading,
    error,
    addRepresentative,
    removeRepresentative,
    refresh,
  };
}

