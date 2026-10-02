import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
    BatchExpirationItem,
    BatchExpirationKpis,
    BatchExpirationFilters,
    TimelineWindow,
} from "../types";
import {
    fetchBatchExpirations,
    exportBatchExpirationsToExcel,
} from "../services/expiration-tracking-api";

const initialKpis: BatchExpirationKpis = {
    expired_count: 0,
    expired_value: 0,
    critical_count: 0,
    critical_value: 0,
    warning_count: 0,
    warning_value: 0,
    upcoming_count: 0,
    upcoming_value: 0,
    next_7_days_count: 0,
    next_7_days_value: 0,
    next_30_days_count: 0,
    next_30_days_value: 0,
    next_90_days_count: 0,
    next_90_days_value: 0,
    next_180_days_count: 0,
    next_180_days_value: 0,
    total_batches_monitored: 0,
    total_inventory_value: 0,
};

const initialFilters: BatchExpirationFilters = {
    status: "ALL",
    branch_id: "ALL",
    product_type: "ALL",
    only_with_on_hand: true, // Recommended: filter out zero on-hand by default
    search: "",
};

export function useBatchesExpiration() {
    const [items, setItems] = useState<BatchExpirationItem[]>([]);
    const [kpis, setKpis] = useState<BatchExpirationKpis>(initialKpis);
    const [timeline, setTimeline] = useState<TimelineWindow[]>([]);
    const [branches, setBranches] = useState<Array<{ id: number; branch_name: string; branch_code: string }>>([]);
    const [productTypes, setProductTypes] = useState<Array<{ id: number; name: string }>>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [filters, setFilters] = useState<BatchExpirationFilters>(initialFilters);
    const [activeTab, setActiveTab] = useState<"table" | "timeline">("table");

    // Drawer state
    const [selectedBatch, setSelectedBatch] = useState<BatchExpirationItem | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

    const loadData = useCallback(async (currentFilters: BatchExpirationFilters) => {
        setLoading(true);
        try {
            const res = await fetchBatchExpirations(currentFilters);
            if (res.success) {
                setItems(res.data);
                setKpis(res.kpis);
                setTimeline(res.timeline);
                if (res.branches && res.branches.length > 0) {
                    setBranches(res.branches);
                }
                if (res.product_types && res.product_types.length > 0) {
                    setProductTypes(res.product_types);
                }
            } else {
                toast.error(res.error || "Failed to load batch expiration data");
                setItems([]);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to connect to server";
            toast.error(msg);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const { branch_id, status, product_type, only_with_on_hand } = filters;

    useEffect(() => {
        loadData({ branch_id, status, product_type, only_with_on_hand, search: "" });
    }, [loadData, branch_id, status, product_type, only_with_on_hand]);

    // Client-side text search filtering
    const filteredItems = useMemo(() => {
        if (!filters.search.trim()) return items;
        const q = filters.search.toLowerCase().trim();
        return items.filter((item) => {
            return (
                item.product_name.toLowerCase().includes(q) ||
                item.product_code.toLowerCase().includes(q) ||
                item.batch_no.toLowerCase().includes(q) ||
                item.lot_name.toLowerCase().includes(q) ||
                item.branch_name.toLowerCase().includes(q)
            );
        });
    }, [items, filters.search]);

    const handleFilterChange = useCallback((key: keyof BatchExpirationFilters, value: unknown) => {
        setFilters((prev) => ({
            ...prev,
            [key]: value,
        }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(initialFilters);
        toast.info("Filters reset to default");
    }, []);

    const handleOpenDrawer = useCallback((batch: BatchExpirationItem) => {
        setSelectedBatch(batch);
        setIsDrawerOpen(true);
    }, []);

    const handleCloseDrawer = useCallback(() => {
        setIsDrawerOpen(false);
    }, []);

    const handleExport = useCallback(() => {
        try {
            exportBatchExpirationsToExcel(filteredItems);
            toast.success(`Exported ${filteredItems.length} batches to Excel (.xlsx)`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Export failed");
        }
    }, [filteredItems]);

    return {
        items: filteredItems,
        totalItemsCount: items.length,
        kpis,
        timeline,
        branches,
        productTypes,
        loading,
        filters,
        activeTab,
        selectedBatch,
        isDrawerOpen,
        setActiveTab,
        handleFilterChange,
        resetFilters,
        handleOpenDrawer,
        handleCloseDrawer,
        handleExport,
        refresh: () => loadData(filters),
    };
}
