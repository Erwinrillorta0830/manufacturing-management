// src/modules/financial-management/asset-management/hooks/useCreateAsset.tsx
import { useState } from "react";
import { assetService } from "../services/assetService";
import { AssetFormValues } from "../types";
import { toast } from "sonner";

export const useCreateAsset = (onSuccess?: () => void) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createAsset = async (values: AssetFormValues) => {
    setIsSubmitting(true);
    try {
      await assetService.createAsset(values, 81);
      toast.success("Asset saved successfully!");
      if (onSuccess) onSuccess(); // Refreshes the table
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save asset");
    } finally {
      setIsSubmitting(false);
    }
  };

  return { createAsset, isSubmitting };
};
