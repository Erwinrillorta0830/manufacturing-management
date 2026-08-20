"use client";

import * as React from "react";
import type { PriceType } from "../types";
import * as api from "../providers/pricingApi";
import { applyLoadError } from "../../shared/loadErrorState";

export function usePriceTypes() {
    const [loading, setLoading] = React.useState(true);
    const [priceTypes, setPriceTypes] = React.useState<PriceType[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [unauthorized, setUnauthorized] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await api.getPriceTypes();
                if (!mounted) return;

                setPriceTypes(res.data ?? []);
                setUnauthorized(false);
            } catch (error: unknown) {
                if (!mounted) return;
                applyLoadError(error, "Failed to load price types", setUnauthorized, setError);
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    return { loading, error, unauthorized, priceTypes };
}