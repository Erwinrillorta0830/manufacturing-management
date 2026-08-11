"use client";

import * as React from "react";
import * as api from "../../product-pricing/providers/pricingApi";
import type { PriceType } from "../../product-pricing/types";
import { toast } from "sonner";

export function usePriceTypeActions() {
    const [isPending, setIsPending] = React.useState(false);

    async function createPriceType(data: Partial<PriceType>) {
        try {
            setIsPending(true);
            const res = await api.createPriceType(data);
            toast.success("Price type created successfully");
            return res.data;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(message || "Failed to create price type");
            throw error;
        } finally {
            setIsPending(false);
        }
    }

    async function updatePriceType(id: number, data: Partial<PriceType>) {
        try {
            setIsPending(true);
            const res = await api.updatePriceType(id, data);
            toast.success("Price type updated successfully");
            return res.data;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(message || "Failed to update price type");
            throw error;
        } finally {
            setIsPending(false);
        }
    }

    async function deletePriceType(id: number) {
        try {
            setIsPending(true);
            await api.deletePriceType(id);
            toast.success("Price type deleted successfully");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(message || "Failed to delete price type");
            throw error;
        } finally {
            setIsPending(false);
        }
    }

    return {
        isPending,
        createPriceType,
        updatePriceType,
        deletePriceType,
    };
}
