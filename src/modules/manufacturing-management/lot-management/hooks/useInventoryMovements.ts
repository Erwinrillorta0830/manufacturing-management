import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { InventoryMovement } from "../types";
import { fetchInventoryMovements } from "../services/lot-management-api";

export function useInventoryMovements(selectedProductId: number | "ALL" = "ALL") {
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [loadingMovements, setLoadingMovements] = useState(true);

    // Filters
    const [movementSearchQuery, setMovementSearchQuery] = useState("");
    const [directionFilter, setDirectionFilter] = useState<"ALL" | "IN" | "OUT">("ALL");
    const [transactionTypeFilter, setTransactionTypeFilter] = useState<string>("ALL");
    const [lotFilter, setLotFilter] = useState<number | "ALL">("ALL");
    const [customProductFilter, setCustomProductFilter] = useState<number | "ALL" | null>(null);

    useEffect(() => {
        setCustomProductFilter(null);
    }, [selectedProductId]);

    const productFilter = customProductFilter !== null ? customProductFilter : selectedProductId;
    const setProductFilter = (val: number | "ALL") => setCustomProductFilter(val);

    const loadMovements = useCallback(async () => {
        setLoadingMovements(true);
        try {
            const list = await fetchInventoryMovements();
            setMovements(list);
        } catch (e) {
            console.error("Failed to load inventory movements:", e);
            toast.error("Failed to load inventory movements");
        } finally {
            setLoadingMovements(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        fetchInventoryMovements()
            .then((list) => {
                if (isMounted) {
                    setMovements(list);
                    setLoadingMovements(false);
                }
            })
            .catch((e) => {
                if (isMounted) {
                    console.error("Failed to load inventory movements:", e);
                    toast.error("Failed to load inventory movements");
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
        const query = movementSearchQuery.toLowerCase().trim();

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

                // Text search query
                if (query) {
                    const matchesRef = (m.referenceNo || "").toLowerCase().includes(query);
                    const matchesKey = (m.movementKey || "").toLowerCase().includes(query);
                    const matchesBatch = (m.batchNo || "").toLowerCase().includes(query);
                    const matchesProd = (m.productName || "").toLowerCase().includes(query);
                    const matchesCode = (m.productCode || "").toLowerCase().includes(query);
                    const matchesLot = (m.lotName || "").toLowerCase().includes(query);
                    const matchesRemarks = (m.remarks || "").toLowerCase().includes(query);
                    const matchesType = (m.transactionType || "").toLowerCase().includes(query);
                    const matchesModule = (m.sourceModule || "").toLowerCase().includes(query);

                    return (
                        matchesRef ||
                        matchesKey ||
                        matchesBatch ||
                        matchesProd ||
                        matchesCode ||
                        matchesLot ||
                        matchesRemarks ||
                        matchesType ||
                        matchesModule
                    );
                }

                return true;
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
    }, [movements, movementSearchQuery, directionFilter, transactionTypeFilter, lotFilter, productFilter]);

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
