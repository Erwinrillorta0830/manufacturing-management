"use client";

import * as React from "react";
import { toast } from "sonner";

import { isUnauthorizedError } from "../../shared/apiHttp";
import { getProductTypes, type ProductTypeOption } from "../providers/pcrApi";

export function usePCRProductTypes() {
    const [productTypes, setProductTypes] = React.useState<ProductTypeOption[]>([]);
    const [productTypesLoading, setProductTypesLoading] = React.useState(true);
    const [productTypesError, setProductTypesError] = React.useState<string | null>(null);
    const [sessionExpired, setSessionExpired] = React.useState(false);

    const handleUnauthorized = React.useCallback(() => {
        setSessionExpired(true);
    }, []);

    const loadProductTypes = React.useCallback(async () => {
        setProductTypesLoading(true);
        try {
            const res = await getProductTypes();
            setProductTypes(res.product_types);
            setProductTypesError(null);
        } catch (error: unknown) {
            if (isUnauthorizedError(error)) {
                setSessionExpired(true);
                setProductTypes([]);
                setProductTypesError(null);
                return;
            }

            const message = error instanceof Error ? error.message : "Failed to load product types";
            setProductTypes([]);
            setProductTypesError(message);
            toast.error(message);
        } finally {
            setProductTypesLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void loadProductTypes();
    }, [loadProductTypes]);

    return {
        productTypes,
        productTypesLoading,
        productTypesError,
        sessionExpired,
        loadProductTypes,
        handleUnauthorized,
    };
}
