// src/modules/manufacturing-management/mm/inventory-warehousing/inventory-reports/components/LowStockCarousel.tsx

"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,
    PackageX,
    ChevronLeft,
    ChevronRight,
    TrendingDown,
    ArrowUpRight,
    ShieldCheck,
    Boxes,
    Tag,
} from "lucide-react";
import {
    InventoryReportProduct,
    LowStockAlertConfig,
    LowStockAlertStatus,
} from "../types";
import { fetchInventoryReports } from "../services/inventory-reports.service";

export interface LowStockCarouselProps {
    config?: LowStockAlertConfig;
    products?: InventoryReportProduct[];
    loading?: boolean;
    className?: string;
}

export function LowStockCarousel({
    config,
    products: externalProducts,
    loading: externalLoading,
    className = "",
}: LowStockCarouselProps) {
    // Internal fetch state for standalone usage in other modules
    const [internalProducts, setInternalProducts] = useState<InventoryReportProduct[]>([]);
    const [internalLoading, setInternalLoading] = useState<boolean>(!externalProducts);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const [itemsPerPage, setItemsPerPage] = useState<number>(4);
    const [isHovered, setIsHovered] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Responsive items per page listener
    useEffect(() => {
        const updateItemsPerPage = () => {
            if (window.innerWidth >= 1280) {
                setItemsPerPage(4);
            } else if (window.innerWidth >= 1024) {
                setItemsPerPage(3);
            } else if (window.innerWidth >= 640) {
                setItemsPerPage(2);
            } else {
                setItemsPerPage(1);
            }
        };

        updateItemsPerPage();
        window.addEventListener("resize", updateItemsPerPage);
        return () => window.removeEventListener("resize", updateItemsPerPage);
    }, []);

    // Standalone canonical fetch when products are not passed in
    useEffect(() => {
        if (externalProducts !== undefined) return;

        let isMounted = true;

        fetchInventoryReports({
            branchId: null,
            categoryId: null,
            productTypeId: null,
            status: "below_maintaining",
            search: "",
        })
            .then((res) => {
                if (!isMounted) return;
                if (res.success && res.data) {
                    setInternalProducts(res.data);
                }
            })
            .catch((err) => {
                console.warn("[LowStockCarousel] Standalone fetch error:", err);
            })
            .finally(() => {
                if (isMounted) setInternalLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [externalProducts]);

    const activeProducts = externalProducts ?? internalProducts;
    const isLoading = externalLoading ?? internalLoading;

    // Filter items according to configured statuses
    const filteredProducts = useMemo(() => {
        const allowedStatuses: LowStockAlertStatus[] = config?.statuses ?? ["out_of_stock", "low_stock"];
        const statusSet = new Set<string>(allowedStatuses);

        const list = activeProducts.filter((p) => {
            const isTargetStatus = statusSet.has(p.stockStatus);
            const hasDeficit = p.isBelowMaintaining || p.deficitQuantity > 0;
            return isTargetStatus || hasDeficit;
        });

        // Sort by urgency: out_of_stock first, then by largest deficit quantity
        list.sort((a, b) => {
            if (a.stockStatus === "out_of_stock" && b.stockStatus !== "out_of_stock") return -1;
            if (b.stockStatus === "out_of_stock" && a.stockStatus !== "out_of_stock") return 1;
            return (b.deficitQuantity || 0) - (a.deficitQuantity || 0);
        });

        const maxItems = config?.maxItems ?? 16;
        return list.slice(0, maxItems);
    }, [activeProducts, config?.statuses, config?.maxItems]);

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const safeCurrentPage = Math.min(currentPage, Math.max(0, totalPages - 1));

    // Optional Auto-scroll
    useEffect(() => {
        if (!config?.autoScroll || isHovered || totalPages <= 1) return;

        const intervalMs = config.autoScrollInterval ?? 6000;
        const timer = setInterval(() => {
            setCurrentPage((prev) => (prev + 1) % totalPages);
        }, intervalMs);

        return () => clearInterval(timer);
    }, [config?.autoScroll, config?.autoScrollInterval, isHovered, totalPages]);

    const handlePrev = useCallback(() => {
        setCurrentPage((prev) => {
            const current = Math.min(prev, Math.max(0, totalPages - 1));
            return current > 0 ? current - 1 : Math.max(0, totalPages - 1);
        });
    }, [totalPages]);

    const handleNext = useCallback(() => {
        setCurrentPage((prev) => {
            const current = Math.min(prev, Math.max(0, totalPages - 1));
            return current < totalPages - 1 ? current + 1 : 0;
        });
    }, [totalPages]);

    // Format currency helper
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat("en-PH", {
            style: "currency",
            currency: "PHP",
            minimumFractionDigits: 2,
        }).format(val || 0);
    };

    // Visible window of products
    const visibleProducts = useMemo(() => {
        const start = safeCurrentPage * itemsPerPage;
        return filteredProducts.slice(start, start + itemsPerPage);
    }, [filteredProducts, safeCurrentPage, itemsPerPage]);

    // If explicitly disabled in config, do not render
    if (config?.enabled === false) {
        return null;
    }

    // Loading Skeleton
    if (isLoading) {
        return (
            <div className={`w-full bg-card/60 border border-border/80 rounded-2xl p-4 sm:p-5 shadow-xs ${className}`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="h-5 w-48 bg-muted animate-pulse rounded-md" />
                        <div className="h-4 w-16 bg-muted/70 animate-pulse rounded-full" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 bg-muted rounded-lg animate-pulse" />
                        <div className="h-8 w-8 bg-muted rounded-lg animate-pulse" />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                    {Array.from({ length: itemsPerPage }).map((_, idx) => (
                        <div
                            key={idx}
                            className="h-44 rounded-xl border border-border/60 bg-muted/30 p-4 animate-pulse flex flex-col justify-between"
                        >
                            <div className="space-y-2">
                                <div className="h-4 w-24 bg-muted/60 rounded" />
                                <div className="h-5 w-40 bg-muted rounded" />
                            </div>
                            <div className="h-10 w-full bg-muted/40 rounded-lg" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Empty state: All stocks healthy
    if (filteredProducts.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`w-full bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 sm:px-5 sm:py-3.5 flex items-center justify-between gap-4 shadow-2xs ${className}`}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                            All Safety Stock Levels Healthy
                            <span className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                100% Compliant
                            </span>
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                            No products are currently at or below safety stock maintaining thresholds.
                        </p>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <div
            ref={containerRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`w-full bg-gradient-to-b from-card/90 to-card border border-border/70 rounded-2xl p-4 sm:p-5 shadow-xs relative overflow-hidden group ${className}`}
        >
            {/* Header Ribbon */}
            <div className="flex items-center justify-between gap-3 mb-3.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                        <AlertTriangle className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground">
                                Critical & Low Stock Alert Spotlight
                            </h3>
                            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                                {filteredProducts.length} Items Below Threshold
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground hidden sm:block">
                            Live on-hand strictly discounts expired batches under canonical safety rules. Click any item to inspect.
                        </p>
                    </div>
                </div>

                {/* Navigation & Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-mono text-muted-foreground mr-1.5 hidden md:inline-block">
                        Page {safeCurrentPage + 1} of {Math.max(1, totalPages)}
                    </span>
                    <button
                        type="button"
                        onClick={handlePrev}
                        aria-label="Previous items"
                        className="p-1.5 sm:p-2 rounded-xl border border-border bg-background/80 hover:bg-muted text-foreground transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                        disabled={totalPages <= 1}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={handleNext}
                        aria-label="Next items"
                        className="p-1.5 sm:p-2 rounded-xl border border-border bg-background/80 hover:bg-muted text-foreground transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                        disabled={totalPages <= 1}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Carousel Cards Grid with Slide Transition */}
            <div className="overflow-hidden min-h-[175px]">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={safeCurrentPage}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.24, ease: "easeInOut" }}
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5"
                    >
                        {visibleProducts.map((product) => {
                            const isOutOfStock = product.stockStatus === "out_of_stock" || product.onHandQuantity === 0;
                            const maintaining = product.maintainingQuantity || 0;
                            const onHand = product.onHandQuantity || 0;
                            const deficit = product.deficitQuantity > 0 ? product.deficitQuantity : Math.max(0, maintaining - onHand);
                            const uom = product.uomShortcut || product.uomName || "PCS";
                            const cost = product.estimatedReplenishmentCost || 0;

                            // Percentage calculation capped at 100
                            const percentage = maintaining > 0 ? Math.min(100, Math.round((onHand / maintaining) * 100)) : 0;

                            return (
                                <motion.div
                                    key={product.productId}
                                    whileHover={{ y: -2 }}
                                    onClick={() => config?.onProductClick?.(product.productId)}
                                    role={config?.onProductClick ? "button" : undefined}
                                    tabIndex={config?.onProductClick ? 0 : undefined}
                                    className={`relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border transition-all shadow-xs overflow-hidden select-none ${
                                        config?.onProductClick ? "cursor-pointer hover:shadow-md" : ""
                                    } ${
                                        isOutOfStock
                                            ? "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/30 hover:border-rose-500/50"
                                            : "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50"
                                    }`}
                                >
                                    {/* Top Line: SKU & Status Badges */}
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-muted/80 text-foreground/80 border border-border/70">
                                                {product.productCode}
                                            </span>
                                            {product.categoryName && product.categoryName !== "Uncategorized" && (
                                                <span className="text-[9px] font-semibold text-muted-foreground flex items-center gap-1">
                                                    <Tag className="w-2.5 h-2.5" />
                                                    {product.categoryName}
                                                </span>
                                            )}
                                        </div>

                                        {isOutOfStock ? (
                                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 shrink-0 shadow-2xs">
                                                <PackageX className="w-2.5 h-2.5" />
                                                Out of Stock
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/40 shrink-0 shadow-2xs">
                                                <AlertTriangle className="w-2.5 h-2.5" />
                                                Low Stock
                                            </span>
                                        )}
                                    </div>

                                    {/* Product Title */}
                                    <div className="mb-3">
                                        <h4
                                            className="text-xs sm:text-sm font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors"
                                            title={product.productName}
                                        >
                                            {product.productName}
                                        </h4>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                            <Boxes className="w-3 h-3 text-muted-foreground/70" />
                                            <span>{product.productTypeName || "Standard Product"}</span>
                                            <span className="opacity-40">•</span>
                                            <span className="font-semibold text-foreground/70">Target: {maintaining} {uom}</span>
                                        </div>
                                    </div>

                                    {/* Inventory Metric Comparison Pill */}
                                    <div className="bg-background/80 dark:bg-background/50 rounded-lg p-2.5 border border-border/60 mb-2.5 space-y-1.5 shadow-2xs">
                                        <div className="flex items-baseline justify-between">
                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                Live Usable / Target
                                            </span>
                                            <div className="flex items-baseline gap-1">
                                                <span
                                                    className={`text-sm font-black font-mono ${
                                                        isOutOfStock
                                                            ? "text-rose-600 dark:text-rose-400"
                                                            : "text-amber-600 dark:text-amber-400"
                                                    }`}
                                                >
                                                    {onHand.toLocaleString()}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                    / {maintaining.toLocaleString()} {uom}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Capacity Progress Bar */}
                                        <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    isOutOfStock ? "bg-rose-500" : "bg-amber-500"
                                                }`}
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>

                                        {/* Bottom sub-metrics: Deficit & Est Cost */}
                                        <div className="flex items-center justify-between text-[10px] pt-0.5">
                                            <div className="flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                                                <TrendingDown className="w-3 h-3" />
                                                <span>Deficit: -{deficit.toLocaleString()} {uom}</span>
                                            </div>
                                            {cost > 0 && (
                                                <div className="text-[10px] font-mono font-bold text-muted-foreground">
                                                    {formatCurrency(cost)}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer Drilldown Prompt */}
                                    {config?.onProductClick && (
                                        <div className="flex items-center justify-between text-[10px] text-primary font-bold opacity-80 group-hover:opacity-100 transition-opacity pt-0.5">
                                            <span>Inspect Batch Breakdown</span>
                                            <ArrowUpRight className="w-3 h-3" />
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Pagination Dots for Mobile / Tablet */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-3 pt-1">
                    {Array.from({ length: totalPages }).map((_, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => setCurrentPage(idx)}
                            aria-label={`Go to page ${idx + 1}`}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                currentPage === idx
                                    ? "w-6 bg-primary"
                                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default LowStockCarousel;
