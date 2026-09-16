import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
    Branch,
    SalesOrderListItem,
    SalesOrderDetailData,
} from "../types";
import {
    fetchBranches,
    fetchSalesOrders,
    fetchSalesOrderDetail,
    proceedToConsolidation,
} from "../services/sales-order-fulfillment-api";

export function useSalesOrderFulfillment() {
    // Branches
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(true);
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);

    // Orders List & Pagination
    const [orders, setOrders] = useState<SalesOrderListItem[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(true);
    const [ordersError, setOrdersError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [totalOrders, setTotalOrders] = useState<number>(0);

    // Modal / Detail State
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [selectedOrderDetail, setSelectedOrderDetail] = useState<SalesOrderDetailData | null>(null);
    const [loadingOrderId, setLoadingOrderId] = useState<number | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    // Action State
    const [isProceeding, setIsProceeding] = useState<boolean>(false);

    // Filter change helpers that reset page to 1
    const handleSearchChange = useCallback((val: string) => {
        setSearchQuery(val);
        setPage(1);
    }, []);

    const handleBranchChange = useCallback((id: number | null) => {
        setSelectedBranchId(id);
        setPage(1);
    }, []);

    const handlePageSizeChange = useCallback((newSize: number) => {
        setPageSize(newSize);
        setPage(1);
    }, []);

    // 1. Load branches once on mount
    useEffect(() => {
        let isMounted = true;
        async function loadBranches() {
            try {
                setIsLoadingBranches(true);
                const data = await fetchBranches();
                if (isMounted) {
                    setBranches(data);
                }
            } catch (err) {
                console.error("Failed to load branches:", err);
            } finally {
                if (isMounted) setIsLoadingBranches(false);
            }
        }
        loadBranches();
        return () => {
            isMounted = false;
        };
    }, []);

    // 2. Fetch orders list
    const loadOrders = useCallback(async () => {
        setIsLoadingOrders(true);
        setOrdersError(null);
        try {
            const res = await fetchSalesOrders({
                branchId: selectedBranchId,
                search: searchQuery,
                page,
                pageSize,
            });
            setOrders(res.data);
            setTotalOrders(res.total);
        } catch (err) {
            const msg = (err as Error).message || "Failed to load Sales Orders";
            setOrdersError(msg);
        } finally {
            setIsLoadingOrders(false);
        }
    }, [selectedBranchId, searchQuery, page, pageSize]);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    // 3. Open Detail Modal - Wait for load before showing modal
    const openDetailModal = useCallback(async (orderId: number) => {
        setLoadingOrderId(orderId);
        setDetailError(null);

        try {
            const data = await fetchSalesOrderDetail(orderId);
            setSelectedOrderId(orderId);
            setSelectedOrderDetail(data);
            setIsModalOpen(true);
        } catch (err) {
            const msg = (err as Error).message || "Failed to load Sales Order details";
            setDetailError(msg);
            toast.error(msg);
        } finally {
            setLoadingOrderId(null);
        }
    }, []);

    // 4. Close Detail Modal
    const closeDetailModal = useCallback(() => {
        setIsModalOpen(false);
        setSelectedOrderId(null);
        setSelectedOrderDetail(null);
        setDetailError(null);
    }, []);

    // 5. Revalidate / Refresh current order detail in modal
    const refreshCurrentDetail = useCallback(async () => {
        if (!selectedOrderId) return;
        setIsLoadingDetail(true);
        try {
            const data = await fetchSalesOrderDetail(selectedOrderId);
            setSelectedOrderDetail(data);
        } catch (err) {
            console.error("Failed to refresh detail:", err);
            toast.error("Failed to refresh order details");
        } finally {
            setIsLoadingDetail(false);
        }
    }, [selectedOrderId]);

    // 6. Proceed to Consolidation
    const handleProceed = useCallback(async () => {
        if (!selectedOrderId) return;
        setIsProceeding(true);
        try {
            const res = await proceedToConsolidation(selectedOrderId);
            if (res.success) {
                closeDetailModal();
                await loadOrders();
            }
        } catch (err) {
            console.error("Proceed to consolidation failed:", err);
        } finally {
            setIsProceeding(false);
        }
    }, [selectedOrderId, closeDetailModal, loadOrders]);

    return {
        branches,
        isLoadingBranches,
        selectedBranchId,
        setSelectedBranchId: handleBranchChange,
        orders,
        isLoadingOrders,
        ordersError,
        searchQuery,
        setSearchQuery: handleSearchChange,
        refreshOrders: loadOrders,

        // Pagination
        page,
        setPage,
        pageSize,
        setPageSize: handlePageSizeChange,
        totalOrders,

        // Modal
        isModalOpen,
        openDetailModal,
        closeDetailModal,
        loadingOrderId,
        selectedOrderId,
        selectedOrderDetail,
        isLoadingDetail,
        detailError,
        refreshCurrentDetail,

        // Action
        isProceeding,
        handleProceed,
    };
}
