"use client";

import React, { useState } from "react";
import { RefreshCw, Plus } from "lucide-react";
import { useSalesOrder } from "./hooks/useSalesOrder";
import { ActiveSalesOrdersTable } from "./components/ActiveSalesOrdersTable";
import { SalesOrderDetailPanel } from "./components/SalesOrderDetailPanel";
import { CreateSalesOrderModal } from "./components/CreateSalesOrderModal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export default function SalesOrderModule() {
    const {
        salesOrders,
        loading,
        selectedOrder,
        setSelectedOrder,
        orderDetails,
        loadingDetails,
        updatingStatusId,
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
        setSearchQuery,
        statusFilter,
        setStatusFilter,
        customerCodeFilter,
        setCustomerCodeFilter,
        dateFromFilter,
        setDateFromFilter,
        dateToFilter,
        setDateToFilter,
        totalCount,
        totalPages
    } = useSalesOrder();

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
 
    return (
        <div className="space-y-6">
            {/* Header info */}
            <div className="relative overflow-hidden bg-card text-card-foreground rounded-2xl p-6 shadow-sm border border-border">
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Order Operations</span>
                        <h1 className="text-2xl font-black tracking-tight text-foreground">Sales Order Management</h1>
                        <p className="text-xs text-muted-foreground">Convert won quotations, approve target price locks, and launch raw materials reservations.</p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 text-xs font-black shadow-xs transition-all hover:-translate-y-0.5 cursor-pointer border-none"
                        >
                            <Plus className="h-4 w-4 stroke-[3]" /> Create Direct SO
                        </button>
                        <button
                            onClick={refreshData}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted px-4 py-2.5 text-xs font-bold text-foreground transition-all hover:-translate-y-0.5 cursor-pointer shadow-xs"
                        >
                            <RefreshCw className="h-4 w-4" /> Refresh
                        </button>
                    </div>
                </div>
                {/* Decorative glowing blobs */}
                <div className="absolute right-0 top-0 -mt-8 -mr-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
                <div className="absolute left-1/3 bottom-0 -mb-8 w-24 h-24 bg-primary/10 rounded-full blur-xl pointer-events-none"></div>
            </div>
 
            {/* Main Content Pane */}
            <div className="space-y-6">
                <ActiveSalesOrdersTable
                    salesOrders={salesOrders}
                    loading={loading}
                    updatingStatusId={updatingStatusId}
                    viewOrderDetails={viewOrderDetails}
                    handleApproveOrder={handleApproveOrder}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    customerCodeFilter={customerCodeFilter}
                    setCustomerCodeFilter={setCustomerCodeFilter}
                    dateFromFilter={dateFromFilter}
                    setDateFromFilter={setDateFromFilter}
                    dateToFilter={dateToFilter}
                    setDateToFilter={setDateToFilter}
                    totalCount={totalCount}
                    totalPages={totalPages}
                    limit={limit}
                    setLimit={setLimit}
                />
            </div>

            {/* Modal - details view */}
            <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
                <DialogContent className="sm:max-w-6xl p-0 overflow-hidden bg-muted/30">
                    <DialogTitle className="sr-only">Sales Order Details</DialogTitle>
                    <div className="max-h-[90vh] overflow-y-auto">
                        <SalesOrderDetailPanel
                            selectedOrder={selectedOrder}
                            setSelectedOrder={setSelectedOrder}
                            orderDetails={orderDetails}
                            loadingDetails={loadingDetails}
                            updatingStatusId={updatingStatusId}
                            handleApproveOrder={handleApproveOrder}
                            handleUpdateQuantities={handleUpdateQuantities}
                            handleSubmitForApproval={handleSubmitForApproval}
                            onOrderUpdated={refreshData}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <CreateSalesOrderModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSubmit={handleCreateSalesOrderDirect}
            />
        </div>
    );
}
