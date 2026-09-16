import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Factory } from "lucide-react";

interface SalesOrderHeaderProps {
    orderCount: number;
    isLoading: boolean;
    onRefresh: () => void;
}

export const SalesOrderHeader: React.FC<SalesOrderHeaderProps> = ({
    orderCount,
    isLoading,
    onRefresh,
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b"
        >
            <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                    <motion.div
                        whileHover={{ rotate: 8, scale: 1.08 }}
                        transition={{ type: "spring", stiffness: 350 }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-xs cursor-default"
                    >
                        <Factory className="h-5 w-5" />
                    </motion.div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                            Sales Order Fulfillment
                        </h1>
                        <Badge variant="secondary" className="text-xs font-semibold px-2 py-0.5">
                            {orderCount} {orderCount === 1 ? "order" : "orders"}
                        </Badge>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    Monitor in-production sales orders, review connected job orders and live inventory, and advance ready orders to consolidation planning.
                </p>
            </div>

            <div className="flex items-center gap-2">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRefresh}
                        disabled={isLoading}
                        className="h-9 gap-1.5 transition-all shadow-xs"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-primary" : ""}`} />
                        <span>{isLoading ? "Refreshing..." : "Refresh"}</span>
                    </Button>
                </motion.div>
            </div>
        </motion.div>
    );
};

