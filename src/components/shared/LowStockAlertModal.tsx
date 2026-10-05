"use client";

import * as React from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
    AlertTriangle,
    X,
    PackageX,
    Package,
    Search,
    ShieldCheck,
    Clock,
    Boxes,
    Layers,
} from "lucide-react";

import { usePathname } from "next/navigation";

export interface NearExpiryBatch {
    batch_no: string;
    lot_name: string | null;
    product_id: number;
    product_name: string;
    product_code: string | null;
    product_description: string | null;
    branch_id: number;
    branch_name: string;
    branch_code: string;
    quantity: number;
    unit: string | null;
    unit_cost: number;
    expiration_date: string | null;
    days_remaining: number | null;
    status: "CRITICAL" | "WARNING" | "UPCOMING" | "EXPIRED";
}

export interface LowStockItem {
    product_id: number;
    product_name: string;
    product_code: string | null;
    description: string | null;
    unit: string | null;
    on_hand: number; // Usable unexpired on-hand
    expired_quantity: number;
    total_physical_on_hand: number;
    maintaining_quantity: number;
    near_expiry_batches: NearExpiryBatch[];
}

interface ApiResponse {
    items?: LowStockItem[];
    expiry_batches?: NearExpiryBatch[];
    authenticated?: boolean;
    message?: string;
    error?: string;
}

const SESSION_KEY = "low_stock_alert_shown";

function isAlertDismissed(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return !!(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY));
    } catch {
        return false;
    }
}

function markAlertDismissed(): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(SESSION_KEY, "1");
        localStorage.setItem(SESSION_KEY, "1");
    } catch {
        // ignore
    }
}

function clearAlertDismissed(): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
    } catch {
        // ignore
    }
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

const overlayVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.25 } },
    exit: { opacity: 0, transition: { duration: 0.2 } },
};

const modalVariants: Variants = {
    hidden: { opacity: 0, y: -20, scale: 0.98 },
    show: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring", stiffness: 360, damping: 30, delay: 0.05 } as const,
    },
    exit: {
        opacity: 0,
        y: -16,
        scale: 0.98,
        transition: { duration: 0.18 },
    },
};

const rowVariants = {
    hidden: { opacity: 0, y: 6 },
    show: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: Math.min(i * 0.02 + 0.05, 0.3), duration: 0.18 },
    }),
};

function StockStatusBadge({
    onHand,
    maintaining,
}: {
    onHand: number;
    maintaining: number;
}) {
    if (onHand === 0) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-red-600 ring-1 ring-red-500/20 dark:text-red-400 whitespace-nowrap">
                <PackageX className="h-3 w-3 shrink-0" />
                Out of Stock
            </span>
        );
    }
    if (onHand <= maintaining) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400 whitespace-nowrap">
                <Package className="h-3 w-3 shrink-0" />
                Low Stock
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400 whitespace-nowrap">
            Adequate
        </span>
    );
}

function ExpiryStatusBadge({ status }: { status: NearExpiryBatch["status"] }) {
    if (status === "CRITICAL") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-rose-600 ring-1 ring-rose-500/25 dark:text-rose-400 whitespace-nowrap">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Critical
            </span>
        );
    }
    if (status === "WARNING") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-orange-600 ring-1 ring-orange-500/25 dark:text-orange-400 whitespace-nowrap">
                <Clock className="h-3 w-3 shrink-0" />
                Warning
            </span>
        );
    }
    if (status === "EXPIRED") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-red-700 ring-1 ring-red-600/30 dark:text-red-400 whitespace-nowrap">
                <PackageX className="h-3 w-3 shrink-0" />
                Expired
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400 whitespace-nowrap">
            <Clock className="h-3 w-3 shrink-0" />
            Upcoming
        </span>
    );
}

function StockProgressBar({ onHand, maintaining }: { onHand: number; maintaining: number }) {
    const percent = maintaining > 0 ? Math.min(100, Math.round((onHand / maintaining) * 100)) : 0;
    const isOut = onHand === 0;

    return (
        <div className="flex items-center gap-2.5 min-w-[120px] whitespace-nowrap">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted/60 dark:bg-muted/40">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${isOut ? "bg-red-500" : "bg-amber-500"}`}
                    style={{ width: `${Math.max(percent, isOut ? 0 : 8)}%` }}
                />
            </div>
            <span
                className={`text-[11px] font-mono tabular-nums font-semibold ${
                    isOut ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                }`}
            >
                {percent}%
            </span>
        </div>
    );
}

export function LowStockAlertModal() {
    const pathname = usePathname();
    const [items, setItems] = React.useState<LowStockItem[]>([]);
    const [expiryBatches, setExpiryBatches] = React.useState<NearExpiryBatch[]>([]);
    const [activeTab, setActiveTab] = React.useState<"stock" | "expiry">("stock");
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const isFetchingRef = React.useRef(false);

    React.useEffect(() => {
        // If explicitly on login or auth routes, reset session flags so next login displays the alert
        const AUTH_PAGES = ["/login", "/forgot-password", "/reset-password"];
        if (pathname && AUTH_PAGES.some((p) => pathname.startsWith(p))) {
            clearAlertDismissed();
            return;
        }

        // Only run for authenticated application paths (skip empty/null transitions and root)
        if (!pathname || pathname === "/") {
            return;
        }

        // Session guard — strictly show once per login session across all browser tabs & modules
        if (isAlertDismissed()) {
            return;
        }

        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        let cancelled = false;

        async function fetchLowStock() {
            setLoading(true);
            try {
                const res = await fetch("/api/manufacturing/inventory-warehousing/low-stock-alert", {
                    cache: "no-store",
                });
                if (!res.ok) {
                    return;
                }
                const data = (await res.json()) as ApiResponse;

                if (data.authenticated === false) {
                    // User session not ready yet; do not lock session
                    return;
                }

                // UNCONDITIONALLY mark as checked so opening modules in new tabs/windows never re-triggers
                markAlertDismissed();

                if (!cancelled) {
                    const fetchedItems = data.items || [];
                    const fetchedBatches = data.expiry_batches || [];
                    if (fetchedItems.length > 0 || fetchedBatches.length > 0) {
                        setItems(fetchedItems);
                        setExpiryBatches(fetchedBatches);
                        setOpen(true);
                    }
                }
            } catch {
                // Silently ignore network aborts during route navigation
            } finally {
                isFetchingRef.current = false;
                if (!cancelled) setLoading(false);
            }
        }

        fetchLowStock();
        return () => {
            cancelled = true;
        };
    }, [pathname]);

    function handleClose() {
        markAlertDismissed();
        setOpen(false);
    }

    // Stock tab items: products with actual deficit (on_hand <= maintaining_quantity)
    const stockItems = React.useMemo(() => {
        return items.filter((item) => item.on_hand <= item.maintaining_quantity);
    }, [items]);

    const outOfStockCount = React.useMemo(
        () => stockItems.filter((i) => i.on_hand === 0).length,
        [stockItems]
    );
    const lowStockCount = React.useMemo(
        () => stockItems.filter((i) => i.on_hand > 0 && i.on_hand <= i.maintaining_quantity).length,
        [stockItems]
    );
    const totalNearExpiryBatches = expiryBatches.length;

    // Filtered lists based on search
    const filteredStockItems = React.useMemo(() => {
        if (!searchQuery.trim()) return stockItems;
        const q = searchQuery.toLowerCase();
        return stockItems.filter(
            (item) =>
                item.product_name.toLowerCase().includes(q) ||
                (item.description && item.description.toLowerCase().includes(q)) ||
                (item.product_code && item.product_code.toLowerCase().includes(q))
        );
    }, [stockItems, searchQuery]);

    const filteredExpiryBatches = React.useMemo(() => {
        if (!searchQuery.trim()) return expiryBatches;
        const q = searchQuery.toLowerCase();
        return expiryBatches.filter(
            (batch) =>
                batch.batch_no.toLowerCase().includes(q) ||
                (batch.lot_name && batch.lot_name.toLowerCase().includes(q)) ||
                batch.product_name.toLowerCase().includes(q) ||
                (batch.product_description && batch.product_description.toLowerCase().includes(q)) ||
                (batch.product_code && batch.product_code.toLowerCase().includes(q)) ||
                batch.branch_name.toLowerCase().includes(q) ||
                batch.branch_code.toLowerCase().includes(q)
        );
    }, [expiryBatches, searchQuery]);

    // Suppress rendering entirely when there's nothing to show and not loading
    if (!loading && items.length === 0 && expiryBatches.length === 0) return null;

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="low-stock-overlay"
                        variants={overlayVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm"
                        onClick={handleClose}
                        aria-hidden="true"
                    />

                    {/* Modal panel - Extra wide container so values never wrap into two lines */}
                    <motion.div
                        key="low-stock-modal"
                        variants={modalVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="low-stock-title"
                        className="fixed inset-x-3 top-[3vh] z-[201] mx-auto w-[96vw] max-w-6xl 2xl:max-w-7xl rounded-2xl border border-amber-500/25 bg-background/98 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.35)] backdrop-blur-2xl overflow-hidden flex flex-col h-[94vh]"
                    >
                        {/* Top gradient accent line */}
                        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 shrink-0" />

                        {/* Header */}
                        <div className="flex flex-col gap-3 border-b border-border/50 bg-amber-500/[0.03] px-6 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/25 shadow-sm">
                                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <h2
                                                id="low-stock-title"
                                                className="text-base font-black tracking-wide text-foreground"
                                            >
                                                Inventory Alert
                                            </h2>
                                            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30">
                                                {stockItems.length} {stockItems.length === 1 ? "Stock Deficit" : "Stock Deficits"} &bull; {totalNearExpiryBatches} Near Expiry
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            Live on-hand deficit and near-expiry raw materials monitoring across active good branches (FEFO priority).
                                        </p>
                                    </div>
                                </div>

                                <button
                                    id="low-stock-close-btn"
                                    onClick={handleClose}
                                    className="shrink-0 rounded-xl p-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    aria-label="Close alert"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            {/* Summary Chips & Search Input */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    {outOfStockCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab("stock")}
                                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 transition-all ${
                                                activeTab === "stock"
                                                    ? "bg-red-500/15 text-red-600 ring-red-500/30 shadow-xs dark:text-red-400"
                                                    : "bg-red-500/5 text-red-600/80 ring-red-500/20 hover:bg-red-500/10 dark:text-red-400/80"
                                            }`}
                                        >
                                            <PackageX className="h-3.5 w-3.5 shrink-0" />
                                            <span>{outOfStockCount} Out of Stock</span>
                                        </button>
                                    )}
                                    {lowStockCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab("stock")}
                                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 transition-all ${
                                                activeTab === "stock"
                                                    ? "bg-amber-500/15 text-amber-600 ring-amber-500/30 shadow-xs dark:text-amber-400"
                                                    : "bg-amber-500/5 text-amber-600/80 ring-amber-500/20 hover:bg-amber-500/10 dark:text-amber-400/80"
                                            }`}
                                        >
                                            <Package className="h-3.5 w-3.5 shrink-0" />
                                            <span>{lowStockCount} Low Stock</span>
                                        </button>
                                    )}
                                    {totalNearExpiryBatches > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab("expiry")}
                                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 transition-all ${
                                                activeTab === "expiry"
                                                    ? "bg-orange-500/15 text-orange-600 ring-orange-500/30 shadow-xs dark:text-orange-400"
                                                    : "bg-orange-500/5 text-orange-600/80 ring-orange-500/20 hover:bg-orange-500/10 dark:text-orange-400/80"
                                            }`}
                                        >
                                            <Clock className="h-3.5 w-3.5 shrink-0" />
                                            <span>
                                                {totalNearExpiryBatches} Near Expiry {totalNearExpiryBatches === 1 ? "Batch" : "Batches"}
                                            </span>
                                        </button>
                                    )}
                                </div>

                                <div className="relative w-72">
                                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder={
                                            activeTab === "stock"
                                                ? "Search product or code..."
                                                : "Search batch, lot, or product..."
                                        }
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="h-8 w-full rounded-lg border border-border/60 bg-background/80 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery("")}
                                            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                                            aria-label="Clear search"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="flex items-center gap-1 border-b border-border/50 bg-muted/15 px-6 pt-2 shrink-0">
                            <button
                                id="stock-tab-btn"
                                type="button"
                                onClick={() => setActiveTab("stock")}
                                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-[1px] ${
                                    activeTab === "stock"
                                        ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-background rounded-t-lg shadow-xs"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/60"
                                }`}
                            >
                                <Layers className="h-3.5 w-3.5 shrink-0" />
                                <span>Stock Tab</span>
                                <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                                        activeTab === "stock"
                                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    {stockItems.length}
                                </span>
                            </button>

                            <button
                                id="expiry-tab-btn"
                                type="button"
                                onClick={() => setActiveTab("expiry")}
                                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-[1px] ${
                                    activeTab === "expiry"
                                        ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-background rounded-t-lg shadow-xs"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/60"
                                }`}
                            >
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <span>Batch Expiry Tab</span>
                                <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                                        activeTab === "expiry"
                                            ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    {totalNearExpiryBatches}
                                </span>
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 overflow-y-auto overflow-x-auto overscroll-contain">
                            {activeTab === "stock" ? (
                                /* STOCK TAB TABLE */
                                <table className="w-full text-xs min-w-[960px] border-collapse">
                                    <thead className="sticky top-0 z-10 border-b border-border/60 bg-muted/75 backdrop-blur-md">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-12">
                                                #
                                            </th>
                                            <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[320px]">
                                                Product Name
                                            </th>
                                            <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[140px]">
                                                Stock Level
                                            </th>
                                            <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[130px]">
                                                Usable on Hand
                                            </th>
                                            <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[120px]">
                                                Target Qty
                                            </th>
                                            <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[130px]">
                                                Status
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/30">
                                        {filteredStockItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                                    No stock deficits found. All active monitored products meet maintaining inventory targets.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredStockItems.map((item, i) => {
                                                const displayName = item.description || item.product_name;

                                                return (
                                                    <motion.tr
                                                        key={item.product_id}
                                                        custom={i}
                                                        variants={rowVariants}
                                                        initial="hidden"
                                                        animate="show"
                                                        className="hover:bg-amber-500/[0.03] transition-colors"
                                                    >
                                                        {/* # */}
                                                        <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground/50 whitespace-nowrap align-middle">
                                                            {i + 1}
                                                        </td>

                                                        {/* Product Name (shows product.description and under product code) */}
                                                        <td className="px-4 py-3.5 align-middle">
                                                            <div className="font-semibold text-foreground whitespace-nowrap text-xs">
                                                                {displayName}
                                                            </div>
                                                            <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap">
                                                                <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted/70 text-muted-foreground border border-border/40 whitespace-nowrap inline-block">
                                                                    {item.product_code ?? "-"}
                                                                </span>
                                                                {item.description && item.description !== item.product_name && (
                                                                    <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                                                                        ({item.product_name})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Stock Level */}
                                                        <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                                                            <StockProgressBar
                                                                onHand={item.on_hand}
                                                                maintaining={item.maintaining_quantity}
                                                            />
                                                        </td>

                                                        {/* Usable on Hand */}
                                                        <td className="px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap align-middle">
                                                            <div>
                                                                <span
                                                                    className={
                                                                        item.on_hand === 0
                                                                            ? "text-red-600 dark:text-red-400 font-extrabold text-xs"
                                                                            : "text-amber-600 dark:text-amber-400 text-xs"
                                                                    }
                                                                >
                                                                    {item.on_hand.toLocaleString(undefined, {
                                                                        minimumFractionDigits: 0,
                                                                    })}
                                                                </span>
                                                                {item.unit && (
                                                                    <span className="ml-1.5 text-[10px] text-muted-foreground/70 font-normal">
                                                                        {item.unit}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {item.expired_quantity > 0 && (
                                                                <div
                                                                    className="text-[10px] text-muted-foreground/60 font-normal mt-0.5 whitespace-nowrap"
                                                                    title="Expired stock excluded from usable inventory under FEFO"
                                                                >
                                                                    +{item.expired_quantity.toLocaleString()} expired
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Target Qty */}
                                                        <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-muted-foreground whitespace-nowrap align-middle">
                                                            <span className="text-xs">
                                                                {item.maintaining_quantity.toLocaleString(undefined, {
                                                                    minimumFractionDigits: 0,
                                                                })}
                                                            </span>
                                                            {item.unit && (
                                                                <span className="ml-1.5 text-[10px] text-muted-foreground/70 font-normal">
                                                                    {item.unit}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Status */}
                                                        <td className="px-4 py-3.5 text-center whitespace-nowrap align-middle">
                                                            <StockStatusBadge
                                                                onHand={item.on_hand}
                                                                maintaining={item.maintaining_quantity}
                                                            />
                                                        </td>
                                                    </motion.tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            ) : (
                                /* BATCH EXPIRY TAB TABLE */
                                <table className="w-full text-xs min-w-[960px] border-collapse">
                                    <thead className="sticky top-0 z-10 border-b border-border/60 bg-muted/75 backdrop-blur-md">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-12">
                                                #
                                            </th>
                                            <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[120px]">
                                                Status
                                            </th>
                                            <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[320px]">
                                                Lot & Batches
                                            </th>
                                            <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[140px]">
                                                Days Left
                                            </th>
                                            <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[150px]">
                                                Branch
                                            </th>
                                            <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[120px]">
                                                Qty
                                            </th>
                                            <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[130px]">
                                                Unit Cost
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/30">
                                        {filteredExpiryBatches.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                                                    No near-expiry batches detected. Raw materials are strictly monitored within a 180-day (6-month) FEFO shelf-life threshold.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredExpiryBatches.map((batch, i) => {
                                                const days = batch.days_remaining ?? 0;
                                                const isCritical = days <= 14;
                                                const isUrgent = days <= 30;

                                                return (
                                                    <motion.tr
                                                        key={`${batch.product_id}-${batch.batch_no}-${batch.branch_id}-${i}`}
                                                        custom={i}
                                                        variants={rowVariants}
                                                        initial="hidden"
                                                        animate="show"
                                                        className="hover:bg-orange-500/[0.03] transition-colors"
                                                    >
                                                        {/* # */}
                                                        <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground/50 whitespace-nowrap align-middle">
                                                            {i + 1}
                                                        </td>

                                                        {/* Status */}
                                                        <td className="px-4 py-3.5 text-center whitespace-nowrap align-middle">
                                                            <ExpiryStatusBadge status={batch.status} />
                                                        </td>

                                                        {/* Lot & Batches (value Batches then under Lot) */}
                                                        <td className="px-4 py-3.5 align-middle">
                                                            <div className="flex items-center gap-2 whitespace-nowrap">
                                                                <span className="font-bold text-foreground font-mono text-xs">
                                                                    {batch.batch_no}
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground/75 font-normal">
                                                                    &bull; {batch.product_description || batch.product_name}
                                                                </span>
                                                            </div>
                                                            <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
                                                                <Boxes className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                                                    Lot:
                                                                </span>
                                                                <span className="font-mono text-foreground/85 font-medium">
                                                                    {batch.lot_name || "-"}
                                                                </span>
                                                                {batch.product_code && (
                                                                    <span className="font-mono text-[10px] text-muted-foreground/50 ml-1">
                                                                        [{batch.product_code}]
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Days Left */}
                                                        <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                                                            <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                                                <Clock
                                                                    className={`h-3.5 w-3.5 shrink-0 ${
                                                                        isCritical
                                                                            ? "text-red-500"
                                                                            : isUrgent
                                                                            ? "text-orange-500"
                                                                            : "text-amber-500"
                                                                    }`}
                                                                />
                                                                <span
                                                                    className={`tabular-nums text-xs ${
                                                                        isCritical
                                                                            ? "text-red-600 dark:text-red-400 font-bold"
                                                                            : isUrgent
                                                                            ? "text-orange-600 dark:text-orange-400 font-bold"
                                                                            : "text-foreground font-medium"
                                                                    }`}
                                                                >
                                                                    {batch.days_remaining !== null
                                                                        ? `${batch.days_remaining} ${
                                                                              batch.days_remaining === 1 ? "day" : "days"
                                                                          } left`
                                                                        : "-"}
                                                                </span>
                                                            </div>
                                                            {batch.expiration_date && (
                                                                <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 whitespace-nowrap">
                                                                    Exp: {batch.expiration_date}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Branch */}
                                                        <td className="px-4 py-3.5 whitespace-nowrap align-middle font-medium text-foreground">
                                                            <div className="text-xs">{batch.branch_name || "-"}</div>
                                                            {batch.branch_code && batch.branch_code !== batch.branch_name && (
                                                                <div className="text-[10px] font-mono text-muted-foreground/60">
                                                                    {batch.branch_code}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Qty */}
                                                        <td className="px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap align-middle">
                                                            <span className="text-foreground text-xs">
                                                                {batch.quantity.toLocaleString(undefined, {
                                                                    minimumFractionDigits: 0,
                                                                })}
                                                            </span>
                                                            {batch.unit && (
                                                                <span className="ml-1 text-[10px] text-muted-foreground/70 font-normal">
                                                                    {batch.unit}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Unit Cost */}
                                                        <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-foreground whitespace-nowrap align-middle">
                                                            <span className="text-xs">
                                                                {batch.unit_cost > 0 ? formatCurrency(batch.unit_cost) : "-"}
                                                            </span>
                                                        </td>
                                                    </motion.tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-6 py-3.5 shrink-0">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>Quantities reflect active good branches only (expired stock & bad warehouses excluded)</span>
                            </div>
                            <button
                                id="low-stock-acknowledge-btn"
                                onClick={handleClose}
                                className="rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs uppercase tracking-wider px-5 py-2 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
                            >
                                Acknowledge
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
