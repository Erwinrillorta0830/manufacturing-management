import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { InventoryMovement } from "../types";
import { fetchInventoryMovements } from "../services/lot-management-api";

export function useInventoryMovements(
    selectedProductId: number | "ALL" = "ALL",
    selectedLotId: number | "ALL" = "ALL",
    selectedBatchId: number | "ALL" = "ALL",
    globalSearchQuery: string = ""
) {
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [loadingMovements, setLoadingMovements] = useState(true);
    const [movementError, setMovementError] = useState<string | null>(null);

    // Filters
    const [movementSearchQuery, setMovementSearchQuery] = useState("");
    const [directionFilter, setDirectionFilter] = useState<"ALL" | "IN" | "OUT">("ALL");
    const [transactionTypeFilter, setTransactionTypeFilter] = useState<string>("ALL");
    const [customLotFilter, setCustomLotFilter] = useState<number | "ALL" | null>(null);
    const [customProductFilter, setCustomProductFilter] = useState<number | "ALL" | null>(null);

    useEffect(() => {
        setCustomProductFilter(null);
    }, [selectedProductId]);

    useEffect(() => {
        setCustomLotFilter(null);
    }, [selectedLotId]);

    const productFilter = customProductFilter !== null ? customProductFilter : selectedProductId;
    const setProductFilter = (val: number | "ALL") => setCustomProductFilter(val);

    const lotFilter = customLotFilter !== null ? customLotFilter : selectedLotId;
    const setLotFilter = (val: number | "ALL") => setCustomLotFilter(val);

    const loadMovements = useCallback(async () => {
        setLoadingMovements(true);
        setMovementError(null);
        try {
            const list = await fetchInventoryMovements();
            setMovements(list);
            setMovementError(null);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to load inventory movements";
            console.error("Failed to load inventory movements:", e);
            setMovementError(msg);
            toast.error(msg);
        } finally {
            setLoadingMovements(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        setMovementError(null);
        fetchInventoryMovements()
            .then((list) => {
                if (isMounted) {
                    setMovements(list);
                    setMovementError(null);
                    setLoadingMovements(false);
                }
            })
            .catch((e) => {
                if (isMounted) {
                    const msg = e instanceof Error ? e.message : "Failed to load inventory movements";
                    console.error("Failed to load inventory movements:", e);
                    setMovementError(msg);
                    toast.error(msg);
                    setLoadingMovements(false);
                }
            });
        return () => {
            isMounted = false;
        };
    }, []);

    // Unique transaction types present in dataset for dropdown options
    const availableTransactionTypes = useMemo(() => {
        const set = new Set<string>();
        movements.forEach((m) => {
            if (m.transactionType) set.add(m.transactionType);
            if (m.sourceModule) set.add(m.sourceModule);
        });
        return Array.from(set).sort();
    }, [movements]);

    // Filter and sort movements
    const filteredMovements = useMemo(() => {
        const localQuery = movementSearchQuery.toLowerCase().trim();
        const globalQuery = globalSearchQuery.toLowerCase().trim();

        return movements
            .filter((m) => {
                // Direction filter
                if (directionFilter !== "ALL") {
                    const dirUpper = String(m.movementDirection || "").toUpperCase();
                    if (dirUpper !== directionFilter) return false;
                }

                // Transaction Type / Source Module filter
                if (transactionTypeFilter !== "ALL") {
                    const tType = String(m.transactionType || "").toUpperCase();
                    const sMod = String(m.sourceModule || "").toUpperCase();
                    const filterUpper = transactionTypeFilter.toUpperCase();
                    if (tType !== filterUpper && sMod !== filterUpper) return false;
                }

                // Storage Lot filter
                if (lotFilter !== "ALL") {
                    if (Number(m.lotId) !== Number(lotFilter)) return false;
                }

                // Product filter
                if (productFilter !== "ALL") {
                    if (Number(m.productId) !== Number(productFilter)) return false;
                }

                // Batch filter
                if (selectedBatchId !== "ALL") {
                    if (Number(m.inventoryLotId ?? m.batchId) !== Number(selectedBatchId)) return false;
                }

                const matchesText = (query: string) => {
                    if (!query) return true;
                    return (
                        (m.referenceNo || "").toLowerCase().includes(query) ||
                        (m.movementKey || "").toLowerCase().includes(query) ||
                        (m.batchNo || "").toLowerCase().includes(query) ||
                        (m.productName || "").toLowerCase().includes(query) ||
                        (m.productCode || "").toLowerCase().includes(query) ||
                        (m.lotName || "").toLowerCase().includes(query) ||
                        (m.remarks || "").toLowerCase().includes(query) ||
                        (m.transactionType || "").toLowerCase().includes(query) ||
                        (m.sourceModule || "").toLowerCase().includes(query)
                    );
                };

                return matchesText(localQuery) && matchesText(globalQuery);
            })
            .sort((a, b) => {
                // Sort by postedAt / transactionDate desc
                const timeA = new Date(a.postedAt || a.transactionDate || 0).getTime();
                const timeB = new Date(b.postedAt || b.transactionDate || 0).getTime();
                return timeB - timeA;
            })
            .map((m, idx) => ({
                ...m,
                displayNumber: idx + 1
            }));
    }, [
        movements,
        movementSearchQuery,
        globalSearchQuery,
        directionFilter,
        transactionTypeFilter,
        lotFilter,
        productFilter,
        selectedBatchId
    ]);

    // Aggregate summary stats
    const movementStats = useMemo(() => {
        let totalIn = 0;
        let totalOut = 0;
        let totalValueIn = 0;

        filteredMovements.forEach((m) => {
            const qIn = Number(m.quantityIn || 0);
            const qOut = Number(m.quantityOut || 0);
            totalIn += qIn;
            totalOut += qOut;
            totalValueIn += Number(m.differenceCost || (qIn * (m.unitCost || 0)));
        });

        return {
            totalCount: filteredMovements.length,
            totalIn,
            totalOut,
            netQuantity: totalIn - totalOut,
            totalValueIn
        };
    }, [filteredMovements]);

    const resetFilters = () => {
        setMovementSearchQuery("");
        setDirectionFilter("ALL");
        setTransactionTypeFilter("ALL");
        setLotFilter("ALL");
        setCustomProductFilter(null);
    };

    return {
        movements,
        filteredMovements,
        loadingMovements,
        movementError,
        movementSearchQuery,
        setMovementSearchQuery,
        directionFilter,
        setDirectionFilter,
        transactionTypeFilter,
        setTransactionTypeFilter,
        lotFilter,
        setLotFilter,
        productFilter,
        setProductFilter,
        availableTransactionTypes,
        movementStats,
        loadMovements,
        resetFilters
    };
}
