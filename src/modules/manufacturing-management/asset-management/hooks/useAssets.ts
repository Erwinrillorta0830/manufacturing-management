"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AssetTableData } from "../types";

export function useAssets() {
  const [assets, setAssets] = useState<AssetTableData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{
    hasError: boolean;
    message?: string;
  }>({
    hasError: false,
  });

  const fetchAssets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError({ hasError: false });

      const response = await fetch("/api/manufacturing/asset-management");
      if (!response.ok) throw new Error("Failed to fetch data from server");

      const result = await response.json();

      if (!Array.isArray(result))
        throw new Error("Invalid data format received");

      setAssets(result);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Could not load asset records.";
      setError({
        hasError: true,
        message,
      });
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchAssets();
    });
  }, [fetchAssets]);

  const refresh = useCallback(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Patches a single row in the local state without triggering a full refetch
  const updateAssetLocally = useCallback(
    (updatedAsset: Partial<AssetTableData> & { id: number }) => {
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === updatedAsset.id ? { ...asset, ...updatedAsset } : asset,
        ),
      );
    },
    [],
  );

  const appendAssetLocally = useCallback(
    (newAsset: AssetTableData) => {
      setAssets((prev) => [newAsset, ...prev]);
    },
    [],
  );

  return {
    assets,
    isLoading,
    error,
    refresh,
    updateAssetLocally,
    appendAssetLocally,
  };
}
