"use client";

import * as React from "react";
import { toast } from "sonner";

import { isUnauthorizedError } from "../../shared/apiHttp";
import { getSuppliers, type SupplierOption } from "../providers/pcrApi";

export function usePCRSuppliers() {
    const [suppliers, setSuppliers] = React.useState<SupplierOption[]>([]);
    const [suppliersLoading, setSuppliersLoading] = React.useState(true);
    const [suppliersError, setSuppliersError] = React.useState<string | null>(null);
    const [sessionExpired, setSessionExpired] = React.useState(false);

    const handleUnauthorized = React.useCallback(() => {
        setSessionExpired(true);
    }, []);

    const loadSuppliers = React.useCallback(async () => {
        setSuppliersLoading(true);
        try {
            const res = await getSuppliers();
            setSuppliers(res.suppliers);
            setSuppliersError(null);
        } catch (error: unknown) {
            if (isUnauthorizedError(error)) {
                setSessionExpired(true);
                setSuppliers([]);
                setSuppliersError(null);
                return;
            }

            const message = error instanceof Error ? error.message : "Failed to load suppliers";
            setSuppliers([]);
            setSuppliersError(message);
            toast.error(message);
        } finally {
            setSuppliersLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void loadSuppliers();
    }, [loadSuppliers]);

    return {
        suppliers,
        suppliersLoading,
        suppliersError,
        sessionExpired,
        loadSuppliers,
        handleUnauthorized,
    };
}
