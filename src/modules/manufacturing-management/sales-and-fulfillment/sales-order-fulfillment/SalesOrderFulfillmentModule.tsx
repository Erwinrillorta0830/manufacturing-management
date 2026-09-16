"use client";

import React from "react";
import { motion } from "framer-motion";
import { useSalesOrderFulfillment } from "./hooks/use-sales-order-fulfillment";
import { SalesOrderHeader } from "./components/SalesOrderHeader";
import { SalesOrderFilterBar } from "./components/SalesOrderFilterBar";
import { SalesOrderTable } from "./components/SalesOrderTable";
import { SalesOrderDetailModal } from "./components/SalesOrderDetailModal";

export default function SalesOrderFulfillmentModule() {
    const {
        branches,
        isLoadingBranches,
        selectedBranchId,
        setSelectedBranchId,
        orders,
        isLoadingOrders,
        ordersError,
        searchQuery,
        setSearchQuery,
        refreshOrders,

        // Pagination
        page,
        setPage,
        pageSize,
        setPageSize,
        totalOrders,

        // Modal
        isModalOpen,
        openDetailModal,
        closeDetailModal,
        loadingOrderId,
        selectedOrderDetail,
        isLoadingDetail,
        detailError,
        refreshCurrentDetail,

        // Action
        isProceeding,
        handleProceed,
    } = useSalesOrderFulfillment();

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4 p-4 sm:p-6 min-h-full"
        >
            {/* Header */}
            <SalesOrderHeader
                orderCount={totalOrders}
                isLoading={isLoadingOrders}
                onRefresh={refreshOrders}
            />

            {/* Filter Bar */}
            <SalesOrderFilterBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                branches={branches}
                selectedBranchId={selectedBranchId}
                onBranchChange={setSelectedBranchId}
                isLoadingBranches={isLoadingBranches}
                totalOrders={totalOrders}
            />

            {/* Table */}
            <SalesOrderTable
                orders={orders}
                isLoading={isLoadingOrders}
                error={ordersError}
                loadingOrderId={loadingOrderId}
                page={page}
                pageSize={pageSize}
                totalOrders={totalOrders}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                onViewDetails={openDetailModal}
                onRetry={refreshOrders}
            />

            {/* Detail Modal */}
            <SalesOrderDetailModal
                isOpen={isModalOpen}
                onClose={closeDetailModal}
                detail={selectedOrderDetail}
                isLoading={isLoadingDetail}
                error={detailError}
                onRefresh={refreshCurrentDetail}
                isProceeding={isProceeding}
                onProceed={handleProceed}
            />
        </motion.div>
    );
}
