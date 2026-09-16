import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Eye,
    Calendar,
    Package,
    Building2,
    AlertCircle,
    Inbox,
    Layers,
    Clock,
    RefreshCw,
    CheckCircle2,
} from "lucide-react";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { SalesOrderListItem } from "../types";

interface SalesOrderTableProps {
    orders: SalesOrderListItem[];
    isLoading: boolean;
    error: string | null;
    loadingOrderId?: number | null;
    page: number;
    pageSize: number;
    totalOrders: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onViewDetails: (orderId: number) => void;
    onRetry: () => void;
}

export const SalesOrderTable: React.FC<SalesOrderTableProps> = ({
    orders,
    isLoading,
    error,
    loadingOrderId,
    page,
    pageSize,
    totalOrders,
    onPageChange,
    onPageSizeChange,
    onViewDetails,
    onRetry,
}) => {
    // 1. Error state
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-destructive/20 bg-destructive/5 space-y-3">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <div className="space-y-1">
                    <h3 className="text-base font-semibold text-destructive">Failed to load sales orders</h3>
                    <p className="text-xs text-muted-foreground max-w-md">{error}</p>
                </div>
                <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
                    Try Again
                </Button>
            </div>
        );
    }

    // 2. Loading state with skeletons
    if (isLoading) {
        return (
            <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/40">
                        <TableRow>
                            <TableHead className="w-[180px]">Order & PO No</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Branch</TableHead>
                            <TableHead>Schedule</TableHead>
                            <TableHead className="text-right">Items & Qty</TableHead>
                            <TableHead className="text-center">Linked JOs</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead className="text-right w-[120px]">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                                <TableCell className="text-center"><Skeleton className="h-5 w-12 mx-auto" /></TableCell>
                                <TableCell className="text-center"><Skeleton className="h-6 w-24 mx-auto rounded-full" /></TableCell>
                                <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto rounded-md" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    }

    // 3. Empty state
    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed bg-card/40 space-y-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <Inbox className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                    <h3 className="text-base font-semibold">No In-Production Orders Found</h3>
                    <p className="text-xs text-muted-foreground max-w-sm">
                        There are currently no sales orders with status &quot;In Production&quot; matching your search or branch filters.
                    </p>
                </div>
            </div>
        );
    }

    // 4. Staggered motion list
    return (
        <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
            <Table>
                <TableHeader className="bg-muted/40">
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[180px] font-semibold text-xs uppercase tracking-wider">
                            Sales Order #
                        </TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider">
                            Customer
                        </TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider">
                            Branch
                        </TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider">
                            Schedule
                        </TableHead>
                        <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">
                            Items & Qty
                        </TableHead>
                        <TableHead className="text-center font-semibold text-xs uppercase tracking-wider">
                            Linked JOs
                        </TableHead>
                        <TableHead className="text-center font-semibold text-xs uppercase tracking-wider">
                            Status
                        </TableHead>
                        <TableHead className="text-right w-[140px] font-semibold text-xs uppercase tracking-wider">
                            Action
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <AnimatePresence mode="wait">
                        {orders.map((order, idx) => {
                            const isCurrentLoading = loadingOrderId === order.order_id;
                            const isAnyLoading = loadingOrderId !== null;

                            return (
                                <motion.tr
                                    key={order.order_id}
                                    initial={{ opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{
                                        duration: 0.24,
                                        delay: Math.min(idx * 0.035, 0.35),
                                        ease: "easeOut",
                                    }}
                                    whileHover={!isAnyLoading ? { y: -1.5, transition: { duration: 0.15 } } : {}}
                                    className={`group cursor-pointer transition-colors border-b last:border-b-0 ${
                                        isCurrentLoading
                                            ? "bg-primary/10 ring-1 ring-primary/30"
                                            : "hover:bg-muted/50"
                                    }`}
                                    onClick={() => !isAnyLoading && onViewDetails(order.order_id)}
                                >
                                    {/* Sales Order # */}
                                    <TableCell className="font-medium py-3.5">
                                        <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                                            {order.order_no}
                                        </span>
                                    </TableCell>

                                    {/* Customer */}
                                    <TableCell className="py-3.5">
                                        <div className="flex flex-col gap-0.5 max-w-[220px]">
                                            <span className="text-sm font-medium truncate text-foreground">
                                                {order.customer_name}
                                            </span>
                                            <span className="text-[11px] text-muted-foreground font-mono truncate">
                                                {order.customer_code}
                                            </span>
                                        </div>
                                    </TableCell>

                                    {/* Branch */}
                                    <TableCell className="py-3.5">
                                        <div className="flex flex-col gap-0.5 max-w-[180px]">
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                                <span className="truncate">{order.branch_name}</span>
                                            </div>
                                            {order.branch_code && (
                                                <span className="text-[11px] text-muted-foreground font-mono truncate pl-5">
                                                    {order.branch_code}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* Schedule */}
                                    <TableCell className="py-3.5">
                                        <div className="flex flex-col gap-1 text-xs">
                                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                                <Calendar className="h-3 w-3 shrink-0" />
                                                <span>Ordered: {order.order_date}</span>
                                            </div>
                                            {order.delivery_date && (
                                              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                                                    <Clock className="h-3 w-3 shrink-0" />
                                                    <span>
                                                        Target: {new Date(order.delivery_date).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* Items & Qty */}
                                    <TableCell className="text-right py-3.5">
                                        <div className="flex flex-col items-end gap-0.5">
                                            <span className="text-sm font-semibold">
                                                {order.total_ordered_quantity.toLocaleString()} units
                                            </span>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Package className="h-3 w-3" />
                                                {order.item_count} line item{order.item_count === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                    </TableCell>

                                    {/* Linked JOs */}
                                    <TableCell className="text-center py-3.5">
                                        {order.linked_job_orders_count > 0 ? (
                                            <Badge
                                                variant="outline"
                                                className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 font-semibold"
                                            >
                                                <Layers className="h-3 w-3 mr-1" />
                                                {order.linked_job_orders_count} JO{order.linked_job_orders_count === 1 ? "" : "s"}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">None</span>
                                        )}
                                    </TableCell>

                                    {/* Status */}
                                    <TableCell className="text-center py-3.5">
                                        <div className="flex flex-col items-center gap-1.5">
                                            <Badge className="bg-amber-500/15 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[11px] font-semibold py-0.5 px-2">
                                                In Production
                                            </Badge>
                                            {order.readiness_status === "Ready" ? (
                                                <Badge className="bg-emerald-500/15 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold py-0 px-1.5 flex items-center gap-1 shadow-2xs">
                                                    <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                                    <span>Ready</span>
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="bg-muted/30 text-muted-foreground border-border text-[10px] font-medium py-0 px-1.5 flex items-center gap-1"
                                                >
                                                    <Clock className="h-2.5 w-2.5 text-amber-500" />
                                                    <span>Pending</span>
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* Action */}
                                    <TableCell className="text-right py-3.5" onClick={(e) => e.stopPropagation()}>
                                        <motion.div whileHover={!isAnyLoading ? { scale: 1.04 } : {}} whileTap={!isAnyLoading ? { scale: 0.96 } : {}}>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={isAnyLoading}
                                                onClick={() => onViewDetails(order.order_id)}
                                                className={`h-8 gap-1.5 text-xs font-medium transition-all shadow-2xs ${
                                                    isCurrentLoading
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-primary/30 hover:border-primary hover:bg-primary/5 hover:text-primary"
                                                }`}
                                            >
                                                {isCurrentLoading ? (
                                                    <>
                                                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                                                        <span>Loading...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Eye className="h-3.5 w-3.5" />
                                                        <span>Show Details</span>
                                                    </>
                                                )}
                                            </Button>
                                        </motion.div>
                                    </TableCell>
                                </motion.tr>
                            );
                        })}
                    </AnimatePresence>
                </TableBody>
            </Table>

            {/* Pagination Section */}
            {totalOrders > 0 && (
                <div className="border-t p-3 bg-muted/10">
                    <DataTablePagination
                        pageIndex={page}
                        pageSize={pageSize}
                        rowCount={totalOrders}
                        onPageChange={onPageChange}
                        onPageSizeChange={onPageSizeChange}
                    />
                </div>
            )}
        </div>
    );
};
