import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { SalesOrder, SalesOrderDetail, CreateSalesOrderPayload } from "../types";
import { 
    fetchSalesOrders, 
    fetchSalesOrderDetails, 
    approveSalesOrder, 
    updateSalesOrderDetails,
    updateSalesOrderStatus,
    createSalesOrderDirect
} from "../services/sales-order-api";

export function useSalesOrder() {
    const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
    
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrderState] = useState<SalesOrder | null>(null);
    const [orderDetails, setOrderDetails] = useState<SalesOrderDetail[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    
    const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
    const [savingQuantities, setSavingQuantities] = useState(false);

    // Pagination, Search, and Status states
    const [currentPage, setCurrentPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [customerCodeFilter, setCustomerCodeFilter] = useState("");
    const [dateFromFilter, setDateFromFilter] = useState("");
    const [dateToFilter, setDateToFilter] = useState("");
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const listAbortRef = useRef<AbortController | null>(null);
    const detailAbortRef = useRef<AbortController | null>(null);
    const listRequestIdRef = useRef(0);
    const detailRequestIdRef = useRef(0);
    const selectedOrderIdRef = useRef<number | null>(null);

    const isAbortError = (error: unknown) => error instanceof Error && error.name === "AbortError";

    const setSelectedOrder = (order: SalesOrder | null) => {
        detailAbortRef.current?.abort();
        detailAbortRef.current = null;
        detailRequestIdRef.current += 1;
        selectedOrderIdRef.current = order?.order_id ?? null;
        setSelectedOrderState(order);

        if (!order) {
            setOrderDetails([]);
            setLoadingDetails(false);
        }
    };

    // Load Sales Orders
    const loadSalesOrders = async (
        page = currentPage, 
        search = searchQuery, 
        status = statusFilter,
        customer = customerCodeFilter,
        dateFrom = dateFromFilter,
        dateTo = dateToFilter
    ) => {
        listAbortRef.current?.abort();
        const controller = new AbortController();
        const requestId = ++listRequestIdRef.current;
        listAbortRef.current = controller;
        setLoading(true);
        try {
            const res = await fetchSalesOrders({
                page,
                limit,
                search,
                status: status === "All" ? "" : status,
                customerCode: customer,
                dateFrom,
                dateTo
            }, {
                signal: controller.signal
            });
            if (requestId !== listRequestIdRef.current) return;
            setSalesOrders(res.data);
            setTotalCount(res.meta.totalCount);
            setTotalPages(res.meta.totalPages);
            setCurrentPage(res.meta.page);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (!isAbortError(e) && requestId === listRequestIdRef.current) {
                toast.error(e.message || "Failed to fetch sales orders");
            }
        } finally {
            if (requestId === listRequestIdRef.current) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        loadSalesOrders(currentPage, searchQuery, statusFilter, customerCodeFilter, dateFromFilter, dateToFilter);
// eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, searchQuery, statusFilter, customerCodeFilter, dateFromFilter, dateToFilter]);

    useEffect(() => () => {
        listRequestIdRef.current += 1;
        detailRequestIdRef.current += 1;
        listAbortRef.current?.abort();
        detailAbortRef.current?.abort();
    }, []);

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
        setCurrentPage(1);
    };

    const handleStatusChange = (status: string) => {
        setStatusFilter(status);
        setCurrentPage(1);
    };

    const handleCustomerChange = (customer: string) => {
        setCustomerCodeFilter(customer);
        setCurrentPage(1);
    };

    const handleDateFromChange = (date: string) => {
        setDateFromFilter(date);
        setCurrentPage(1);
    };

    const handleDateToChange = (date: string) => {
        setDateToFilter(date);
        setCurrentPage(1);
    };

    const loadOrderDetails = async (orderId: number) => {
        detailAbortRef.current?.abort();
        const controller = new AbortController();
        const requestId = ++detailRequestIdRef.current;
        detailAbortRef.current = controller;
        setLoadingDetails(true);
        try {
            const data = await fetchSalesOrderDetails(orderId, { signal: controller.signal });
            if (requestId !== detailRequestIdRef.current || selectedOrderIdRef.current !== orderId) return null;
            setOrderDetails(data);
            return data;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (!isAbortError(e) && requestId === detailRequestIdRef.current) {
                toast.error(e.message || "Failed to load order details");
            }
            return null;
        } finally {
            if (requestId === detailRequestIdRef.current) {
                setLoadingDetails(false);
            }
        }
    };

    const viewOrderDetails = async (order: SalesOrder) => {
        setSelectedOrder(order);
        await loadOrderDetails(order.order_id);
    };

    const handleApproveOrder = async (orderId: number) => {
        setUpdatingStatusId(orderId);
        try {
            await approveSalesOrder(orderId);
            toast.success("Sales Order approved! Ready for Operations scheduling.");
            loadSalesOrders(currentPage, searchQuery, statusFilter);
            if (selectedOrder && selectedOrder.order_id === orderId) {
                setSelectedOrderState(prev => prev ? { ...prev, order_status: "For Invoicing" } : null);
            }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            toast.error(e.message || "Failed to update status");
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const handleUpdateQuantities = async (orderId: number, details: { detail_id: number; ordered_quantity: number }[]) => {
        setSavingQuantities(true);
        try {
            await updateSalesOrderDetails(orderId, details);
            toast.success("Quantities updated successfully!");
            loadSalesOrders(currentPage, searchQuery, statusFilter);
            const data = selectedOrderIdRef.current === orderId
                ? await loadOrderDetails(orderId)
                : null;
            if (data && selectedOrderIdRef.current === orderId) {
                const totalAmount = data.reduce((acc, item) => acc + Number(item.net_amount || 0), 0);
                setSelectedOrderState(prev => prev ? { ...prev, total_amount: totalAmount, net_amount: totalAmount - Number(prev.discount_amount || 0) } : null);
            }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            toast.error(e.message || "Failed to update quantities");
        } finally {
            setSavingQuantities(false);
        }
    };

    const handleSubmitForApproval = async (orderId: number) => {
        setUpdatingStatusId(orderId);
        try {
            await updateSalesOrderStatus(orderId, "For Approval");
            toast.success("Sales Order submitted for approval!");
            loadSalesOrders(currentPage, searchQuery, statusFilter);
            if (selectedOrder && selectedOrder.order_id === orderId) {
                setSelectedOrderState(prev => prev ? { ...prev, order_status: "For Approval" } : null);
            }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            toast.error(e.message || "Failed to submit for approval");
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const handleCreateSalesOrderDirect = async (payload: CreateSalesOrderPayload) => {
        try {
            const res = await createSalesOrderDirect(payload);
            toast.success("Sales Order created directly!");
            await loadSalesOrders(
                currentPage,
                searchQuery,
                statusFilter,
                customerCodeFilter,
                dateFromFilter,
                dateToFilter
            );
            return res;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to create sales order directly";
            toast.error(msg);
            throw e;
        }
    };

    const refreshData = () => {
        loadSalesOrders(currentPage, searchQuery, statusFilter, customerCodeFilter, dateFromFilter, dateToFilter);
    };

    return {
        salesOrders,
        loading,
        selectedOrder,
        setSelectedOrder,
        orderDetails,
        loadingDetails,
        updatingStatusId,
        savingQuantities,
        viewOrderDetails,
        handleApproveOrder,
        handleUpdateQuantities,
        handleSubmitForApproval,
        handleCreateSalesOrderDirect,
        refreshData,
        currentPage,
        setCurrentPage,
        limit,
        setLimit,
        searchQuery,
        setSearchQuery: handleSearchChange,
        statusFilter,
        setStatusFilter: handleStatusChange,
        customerCodeFilter,
        setCustomerCodeFilter: handleCustomerChange,
        dateFromFilter,
        setDateFromFilter: handleDateFromChange,
        dateToFilter,
        setDateToFilter: handleDateToChange,
        totalCount,
        totalPages
    };
}
