import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { SalesOrder, SalesOrderDetail } from "../../sales-order/types";
import { 
    fetchSalesOrders, 
    fetchSalesOrderDetails, 
    approveSalesOrder, 
    holdSalesOrder,
    cancelSalesOrder,
    updateSalesOrderStatus 
} from "../../sales-order/services/sales-order-api";

export function useSalesOrderApproval() {
    const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrderState] = useState<SalesOrder | null>(null);
    const [orderDetails, setOrderDetails] = useState<SalesOrderDetail[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [stockData, setStockData] = useState<Record<number, number>>({});
    
    const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

    // Pagination and search states
    const [currentPage, setCurrentPage] = useState(1);
    const [limit] = useState(10);
    const [searchQuery, setSearchQuery] = useState("");
    const [customerCodeFilter, setCustomerCodeFilter] = useState("");
    const [dateFromFilter, setDateFromFilter] = useState("");
    const [dateToFilter, setDateToFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("For Approval,On Hold");
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
            setStockData({});
            setLoadingDetails(false);
        }
    };

    const loadPendingOrders = async (
        page = currentPage, 
        search = searchQuery, 
        customer = customerCodeFilter, 
        dateFrom = dateFromFilter, 
        dateTo = dateToFilter,
        status = statusFilter
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
                status,
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
        } catch (e: unknown) {
            if (!isAbortError(e) && requestId === listRequestIdRef.current) {
                toast.error(e instanceof Error ? e.message : "Failed to load approval queue");
            }
        } finally {
            if (requestId === listRequestIdRef.current) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        loadPendingOrders(currentPage, searchQuery, customerCodeFilter, dateFromFilter, dateToFilter, statusFilter);
// eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, searchQuery, customerCodeFilter, dateFromFilter, dateToFilter, statusFilter]);

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

    const viewOrderDetails = async (order: SalesOrder) => {
        setSelectedOrder(order);
        detailAbortRef.current?.abort();
        const controller = new AbortController();
        const requestId = ++detailRequestIdRef.current;
        detailAbortRef.current = controller;
        setLoadingDetails(true);
        try {
            const data = await fetchSalesOrderDetails(order.order_id, { signal: controller.signal });
            if (requestId !== detailRequestIdRef.current || selectedOrderIdRef.current !== order.order_id) return;
            setOrderDetails(data);
            
            try {
                const productIds = Array.from(new Set(data.map(d => d.product_id?.product_id).filter(Boolean)));
                if (productIds.length > 0) {
                    const branchParam = order.branch_id ? `?branch=${order.branch_id}` : '';
                    
                    // Fetch all stocks for the branch in a single request to avoid dropped concurrent requests
                    const stockRes = await fetch(`/api/manufacturing/product-onhand${branchParam}`, {
                        signal: controller.signal
                    });

                    const newStockData: Record<number, number> = {};
                    
                    if (stockRes.ok) {
                        const stockJson = await stockRes.json();
                        if (Array.isArray(stockJson)) {
                            for (const row of stockJson) {
                                const pid = Number(row.productId || row.product_id);
                                const qty = Number(row.onhandQuantity || row.onhand_quantity) || 0;
                                if (!isNaN(pid) && productIds.includes(pid)) {
                                    newStockData[pid] = (newStockData[pid] || 0) + qty;
                                }
                            }
                        }
                    }
                    
                    setStockData(newStockData);
                }
            } catch (e) {
                console.error("Failed to fetch stock data", e);
            }
        } catch (e: unknown) {
            if (!isAbortError(e) && requestId === detailRequestIdRef.current) {
                toast.error(e instanceof Error ? e.message : "Failed to load order details");
            }
        } finally {
            if (requestId === detailRequestIdRef.current) {
                setLoadingDetails(false);
            }
        }
    };

    const handleApprove = async (orderId: number) => {
        setUpdatingStatusId(orderId);
        try {
            await approveSalesOrder(orderId);
            toast.success("Sales Order approved! Released to production floor.");
            loadPendingOrders(currentPage, searchQuery, customerCodeFilter, dateFromFilter, dateToFilter, statusFilter);
            if (selectedOrder && selectedOrder.order_id === orderId) {
                setSelectedOrder(null);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Approval failed");
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const handleSendToJO = async (orderId: number) => {
        setUpdatingStatusId(orderId);
        try {
            await updateSalesOrderStatus(orderId, "In Production");
            toast.success("Sales Order approved! Sent to production (JO).");
            loadPendingOrders(currentPage, searchQuery, customerCodeFilter, dateFromFilter, dateToFilter, statusFilter);
            if (selectedOrder && selectedOrder.order_id === orderId) {
                setSelectedOrder(null);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to send to JO");
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const handleSendToInvoice = async (orderId: number) => {
        setUpdatingStatusId(orderId);
        try {
            await updateSalesOrderStatus(orderId, "For Invoicing");
            toast.success("Sales Order approved! Sent to Invoicing.");
            loadPendingOrders(currentPage, searchQuery, customerCodeFilter, dateFromFilter, dateToFilter, statusFilter);
            if (selectedOrder && selectedOrder.order_id === orderId) {
                setSelectedOrder(null);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to send to Invoice");
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const handleHold = async (orderId: number) => {
        setUpdatingStatusId(orderId);
        try {
            await holdSalesOrder(orderId);
            toast.success("Sales Order placed On Hold.");
            loadPendingOrders(currentPage, searchQuery, customerCodeFilter, dateFromFilter, dateToFilter, statusFilter);
            if (selectedOrder && selectedOrder.order_id === orderId) {
                setSelectedOrder(null);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Placing order on hold failed");
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const handleReject = async (orderId: number) => {
        setUpdatingStatusId(orderId);
        try {
            await updateSalesOrderStatus(orderId, "Draft");
            toast.success("Sales Order rejected and returned to Draft status.");
            loadPendingOrders(currentPage, searchQuery, customerCodeFilter, dateFromFilter, dateToFilter, statusFilter);
            if (selectedOrder && selectedOrder.order_id === orderId) {
                setSelectedOrder(null);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Rejection failed");
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const handleCancel = async (orderId: number) => {
        setUpdatingStatusId(orderId);
        try {
            await cancelSalesOrder(orderId);
            toast.success("Sales Order cancelled.");
            loadPendingOrders(currentPage, searchQuery, customerCodeFilter, dateFromFilter, dateToFilter, statusFilter);
            if (selectedOrder && selectedOrder.order_id === orderId) {
                setSelectedOrder(null);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Cancellation failed");
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const handleCustomerCodeFilterChange = (code: string) => {
        setCustomerCodeFilter(code);
        setCurrentPage(1);
    };

    const handleDateFromFilterChange = (date: string) => {
        setDateFromFilter(date);
        setCurrentPage(1);
    };

    const handleDateToFilterChange = (date: string) => {
        setDateToFilter(date);
        setCurrentPage(1);
    };

    const handleStatusFilterChange = (status: string) => {
        setStatusFilter(status);
        setCurrentPage(1);
    };

    const refreshData = () => {
        loadPendingOrders(currentPage, searchQuery, customerCodeFilter, dateFromFilter, dateToFilter, statusFilter);
    };

    return {
        salesOrders,
        loading,
        selectedOrder,
        setSelectedOrder,
        orderDetails,
        loadingDetails,
        updatingStatusId,
        currentPage,
        setCurrentPage,
        searchQuery,
        setSearchQuery: handleSearchChange,
        customerCodeFilter,
        setCustomerCodeFilter: handleCustomerCodeFilterChange,
        dateFromFilter,
        setDateFromFilter: handleDateFromFilterChange,
        dateToFilter,
        setDateToFilter: handleDateToFilterChange,
        statusFilter,
        setStatusFilter: handleStatusFilterChange,
        totalCount,
        totalPages,
        limit,
        stockData,
        viewOrderDetails,
        handleApprove,
        handleSendToJO,
        handleSendToInvoice,
        handleHold,
        handleReject,
        handleCancel,
        refreshData
    };
}
