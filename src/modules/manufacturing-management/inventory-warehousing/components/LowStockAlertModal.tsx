"use client";

import * as React from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
    AlertTriangle,
    X,
    PackageX,
    Search,
    ShieldCheck,
    Clock,
    Boxes,
    ChevronDown,
    ChevronRight,
    ArrowRight,
    ArrowLeft,
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
    parent_id?: number | null;
    product_name: string;
    product_code: string | null;
    description: string | null;
    unit: string | null;
    unit_multiplier: number;
    is_child: boolean;
    family_root_id: number;
    family_members_count: number;
    physical_on_hand: number; // Actual physical on-hand in this SKU's UOM
    family_equivalent_on_hand: number; // Converted total family stock in this SKU's UOM
    family_total_base_pieces: number; // Total physical pieces pooled across all family variants
    base_unit_name: string; // e.g. "PCS"
    on_hand: number; // Backwards-compatible alias for physical_on_hand
    expired_quantity: number;
    total_physical_on_hand: number;
    maintaining_quantity: number;
    stock_status: "CRITICAL_DEFICIT" | "PACKAGING_DEFICIT" | "SAFE";
    near_expiry_batches: NearExpiryBatch[];
}

export interface ProductFamilyGroup {
    family_root_id: number;
    family_name: string;
    family_code?: string | null;
    base_unit_name: string;
    family_total_base_pieces: number;
    family_equivalent_on_hand: number;
    maintaining_quantity: number;
    stock_status: "CRITICAL_DEFICIT" | "PACKAGING_DEFICIT" | "SAFE";
    has_variants: boolean;
    total_expired_pieces: number;
    items: LowStockItem[];
}

export type AlertTab = "critical" | "packaging" | "expired" | "near_expiry";

function groupItemsByFamily(itemsList: LowStockItem[]): ProductFamilyGroup[] {
    const map = new Map<number, LowStockItem[]>();
    for (const item of itemsList) {
        const rootId = item.family_root_id || item.product_id;
        const list = map.get(rootId) || [];
        list.push(item);
        map.set(rootId, list);
    }

    const groups: ProductFamilyGroup[] = [];
    for (const [rootId, familyItems] of map.entries()) {
        const rootItem = familyItems.find((i) => i.product_id === rootId) || familyItems[0];

        let status: "CRITICAL_DEFICIT" | "PACKAGING_DEFICIT" | "SAFE" = "SAFE";
        if (familyItems.some((i) => i.stock_status === "CRITICAL_DEFICIT")) {
            status = "CRITICAL_DEFICIT";
        } else if (familyItems.some((i) => i.stock_status === "PACKAGING_DEFICIT")) {
            status = "PACKAGING_DEFICIT";
        }

        const hasVariants = familyItems.length > 1 || rootItem.family_members_count > 1;
        const familyName = rootItem.product_name || rootItem.description || `Product #${rootId}`;
        const totalExpired = familyItems.reduce((acc, curr) => acc + (curr.expired_quantity || 0), 0);

        const sortedItems = [...familyItems].sort(
            (a, b) => (a.unit_multiplier || 1) - (b.unit_multiplier || 1)
        );

        groups.push({
            family_root_id: rootId,
            family_name: familyName,
            family_code: rootItem.product_code || null,
            base_unit_name: rootItem.base_unit_name || "PCS",
            family_total_base_pieces: rootItem.family_total_base_pieces,
            family_equivalent_on_hand: rootItem.family_equivalent_on_hand,
            maintaining_quantity: rootItem.maintaining_quantity,
            stock_status: status,
            has_variants: hasVariants,
            total_expired_pieces: totalExpired,
            items: sortedItems,
        });
    }

    groups.sort((a, b) => {
        if (a.stock_status !== b.stock_status) {
            if (a.stock_status === "CRITICAL_DEFICIT") return -1;
            if (b.stock_status === "CRITICAL_DEFICIT") return 1;
            if (a.stock_status === "PACKAGING_DEFICIT") return -1;
            if (b.stock_status === "PACKAGING_DEFICIT") return 1;
        }
        return a.family_name.localeCompare(b.family_name);
    });

    return groups;
}

interface ApiResponse {
    items?: LowStockItem[];
    expiry_batches?: NearExpiryBatch[];
    authenticated?: boolean;
    message?: string;
    error?: string;
}

const SESSION_KEY = "low_stock_alert_shown";

function getTodayDateString(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isAlertDismissed(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const today = getTodayDateString();
        const sessionVal = sessionStorage.getItem(SESSION_KEY);
        const localVal = localStorage.getItem(SESSION_KEY);
        // Only consider dismissed if it was already marked for TODAY's date
        return sessionVal === today || localVal === today;
    } catch {
        return false;
    }
}

function markAlertDismissed(): void {
    if (typeof window === "undefined") return;
    try {
        const today = getTodayDateString();
        sessionStorage.setItem(SESSION_KEY, today);
        localStorage.setItem(SESSION_KEY, today);
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

const tabContentVariants: Variants = {
    enter: (direction: number) => ({
        x: direction > 0 ? 24 : -24,
        opacity: 0,
    }),
    center: {
        x: 0,
        opacity: 1,
        transition: {
            x: { type: "spring", stiffness: 380, damping: 32 },
            opacity: { duration: 0.18 },
        },
    },
    exit: (direction: number) => ({
        x: direction > 0 ? -24 : 24,
        opacity: 0,
        transition: {
            duration: 0.12,
        },
    }),
};

function StockStatusBadge({
    status,
    physicalOnHand,
    equivalentOnHand,
    maintaining,
}: {
    status?: "CRITICAL_DEFICIT" | "PACKAGING_DEFICIT" | "SAFE";
    physicalOnHand: number;
    equivalentOnHand: number;
    maintaining: number;
}) {
    if (status === "CRITICAL_DEFICIT" || (physicalOnHand === 0 && equivalentOnHand === 0)) {
        if (physicalOnHand === 0 && equivalentOnHand === 0) {
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-red-600 ring-1 ring-red-500/20 dark:text-red-400 whitespace-nowrap">
                    <PackageX className="h-3 w-3 shrink-0" />
                    Out of Stock
                </span>
            );
        }
        return (
            <span
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-rose-600 ring-1 ring-rose-500/25 dark:text-rose-400 whitespace-nowrap"
                title="Overall warehouse inventory across all variants is below maintaining target"
            >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Critical Deficit
            </span>
        );
    }
    if (status === "PACKAGING_DEFICIT" || (physicalOnHand <= maintaining && equivalentOnHand >= maintaining)) {
        return (
            <span
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400 whitespace-nowrap"
                title="Low in this specific packaging, but stock exists in other variants (can unbox/repack)"
            >
                <Boxes className="h-3 w-3 shrink-0" />
                Packaging Shortage
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400 whitespace-nowrap">
            <ShieldCheck className="h-3 w-3 shrink-0" />
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

function StockProgressBar({
    equivalentOnHand,
    maintaining,
    isCritical,
}: {
    equivalentOnHand: number;
    maintaining: number;
    isCritical?: boolean;
}) {
    const percent = maintaining > 0 ? Math.min(100, Math.round((equivalentOnHand / maintaining) * 100)) : 0;
    const isOut = equivalentOnHand === 0;

    return (
        <div className="flex items-center gap-2.5 min-w-[120px] whitespace-nowrap">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted/60 dark:bg-muted/40">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${
                        isOut || isCritical ? "bg-rose-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.max(percent, isOut ? 0 : 8)}%` }}
                />
            </div>
            <span
                className={`text-[11px] font-mono tabular-nums font-semibold ${
                    isOut || isCritical ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
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
    const [activeTab, setActiveTab] = React.useState<AlertTab>("critical");
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [expandedFamilies, setExpandedFamilies] = React.useState<Set<number>>(new Set());
    const isFetchingRef = React.useRef(false);
    const [direction, setDirection] = React.useState<number>(1);
    const contentScrollRef = React.useRef<HTMLDivElement>(null);

    // Prevent ESC key from closing the alert modal without explicit acknowledgment
    React.useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open]);

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

                        const critCount = fetchedItems.filter(
                            (i) =>
                                i.stock_status === "CRITICAL_DEFICIT" ||
                                (i.maintaining_quantity > 0 &&
                                    i.family_equivalent_on_hand < i.maintaining_quantity)
                        ).length;
                        const packCount = fetchedItems.filter(
                            (i) =>
                                i.stock_status === "PACKAGING_DEFICIT" ||
                                (i.maintaining_quantity > 0 &&
                                    i.physical_on_hand <= i.maintaining_quantity &&
                                    i.family_equivalent_on_hand >= i.maintaining_quantity)
                        ).length;
                        const expCount = fetchedBatches.filter(
                            (b) =>
                                b.status === "EXPIRED" ||
                                (b.days_remaining !== null && b.days_remaining <= 0)
                        ).length;
                        const nearCount = fetchedBatches.filter(
                            (b) =>
                                b.status !== "EXPIRED" &&
                                (b.days_remaining === null || b.days_remaining > 0)
                        ).length;

                        // Default to the first non-empty tab
                        if (critCount > 0) setActiveTab("critical");
                        else if (packCount > 0) setActiveTab("packaging");
                        else if (expCount > 0) setActiveTab("expired");
                        else if (nearCount > 0) setActiveTab("near_expiry");

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

    const goToTab = React.useCallback((nextTab: AlertTab, dir: number) => {
        setDirection(dir);
        setActiveTab(nextTab);
        if (contentScrollRef.current) {
            contentScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, []);

    const toggleFamily = (rootId: number) => {
        setExpandedFamilies((prev) => {
            const next = new Set(prev);
            if (next.has(rootId)) {
                next.delete(rootId);
            } else {
                next.add(rootId);
            }
            return next;
        });
    };

    // Stock tab items: products with actual deficit (critical deficit or packaging shortage)
    const stockItems = React.useMemo(() => {
        return items.filter(
            (item) =>
                item.stock_status === "CRITICAL_DEFICIT" ||
                item.stock_status === "PACKAGING_DEFICIT" ||
                (item.maintaining_quantity > 0 && item.physical_on_hand <= item.maintaining_quantity)
        );
    }, [items]);

    const criticalDeficitCount = React.useMemo(
        () =>
            stockItems.filter(
                (i) =>
                    i.stock_status === "CRITICAL_DEFICIT" ||
                    (i.maintaining_quantity > 0 && i.family_equivalent_on_hand < i.maintaining_quantity)
            ).length,
        [stockItems]
    );

    const packagingShortageCount = React.useMemo(
        () =>
            stockItems.filter(
                (i) =>
                    i.stock_status === "PACKAGING_DEFICIT" ||
                    (i.maintaining_quantity > 0 &&
                        i.physical_on_hand <= i.maintaining_quantity &&
                        i.family_equivalent_on_hand >= i.maintaining_quantity)
            ).length,
        [stockItems]
    );

    const totalExpiryBatches = expiryBatches.length;

    const expiredBatchesCount = React.useMemo(
        () =>
            expiryBatches.filter(
                (b) => b.status === "EXPIRED" || (b.days_remaining !== null && b.days_remaining <= 0)
            ).length,
        [expiryBatches]
    );

    const nearExpiryBatchesCount = React.useMemo(
        () =>
            expiryBatches.filter(
                (b) => b.status !== "EXPIRED" && (b.days_remaining === null || b.days_remaining > 0)
            ).length,
        [expiryBatches]
    );

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

    // Group items for Tab 1: Critical Deficits
    const criticalStockFamilies = React.useMemo(() => {
        const list = filteredStockItems.filter(
            (i) =>
                i.stock_status === "CRITICAL_DEFICIT" ||
                (i.maintaining_quantity > 0 && i.family_equivalent_on_hand < i.maintaining_quantity)
        );
        return groupItemsByFamily(list);
    }, [filteredStockItems]);

    // Group items for Tab 2: Packaging Shortages
    const packagingStockFamilies = React.useMemo(() => {
        const list = filteredStockItems.filter(
            (i) =>
                i.stock_status === "PACKAGING_DEFICIT" ||
                (i.maintaining_quantity > 0 &&
                    i.physical_on_hand <= i.maintaining_quantity &&
                    i.family_equivalent_on_hand >= i.maintaining_quantity)
        );
        return groupItemsByFamily(list);
    }, [filteredStockItems]);

    // Batches for Tab 3: Expired Batches
    const filteredExpiredBatches = React.useMemo(() => {
        const list = expiryBatches.filter(
            (b) => b.status === "EXPIRED" || (b.days_remaining !== null && b.days_remaining <= 0)
        );
        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(
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

    // Batches for Tab 4: Near Expiry Batches
    const filteredNearExpiryBatches = React.useMemo(() => {
        const list = expiryBatches.filter(
            (b) => b.status !== "EXPIRED" && (b.days_remaining === null || b.days_remaining > 0)
        );
        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(
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

    // Automatically expand families that match search query
    React.useEffect(() => {
        if (searchQuery.trim()) {
            const allMatching = new Set<number>();
            for (const group of [...criticalStockFamilies, ...packagingStockFamilies]) {
                allMatching.add(group.family_root_id);
            }
            setExpandedFamilies(allMatching);
        }
    }, [searchQuery, criticalStockFamilies, packagingStockFamilies]);

    // Sequential navigation flow
    const TAB_SEQUENCE: { key: AlertTab; label: string }[] = [
        { key: "critical", label: "Critical Deficits" },
        { key: "packaging", label: "Packaging Shortages" },
        { key: "expired", label: "Expired Batches" },
        { key: "near_expiry", label: "Near Expiry Batches" },
    ];

    const currentIndex = TAB_SEQUENCE.findIndex((t) => t.key === activeTab);
    const nextTabConfig =
        TAB_SEQUENCE.slice(currentIndex + 1).find((t) => {
            if (t.key === "critical") return criticalDeficitCount > 0;
            if (t.key === "packaging") return packagingShortageCount > 0;
            if (t.key === "expired") return expiredBatchesCount > 0;
            if (t.key === "near_expiry") return nearExpiryBatchesCount > 0;
            return false;
        }) || null;

    const prevTabConfig =
        TAB_SEQUENCE.slice(0, currentIndex)
            .reverse()
            .find((t) => {
                if (t.key === "critical") return criticalDeficitCount > 0;
                if (t.key === "packaging") return packagingShortageCount > 0;
                if (t.key === "expired") return expiredBatchesCount > 0;
                if (t.key === "near_expiry") return nearExpiryBatchesCount > 0;
                return false;
            }) || null;

    // Suppress rendering entirely when there's nothing to show and not loading
    if (!loading && items.length === 0 && expiryBatches.length === 0) return null;

    const renderStockTable = (families: ProductFamilyGroup[], emptyMessage: string) => (
        <table className="w-full text-xs min-w-[1040px] border-collapse">
            <thead className="sticky top-0 z-10 border-b border-border/60 bg-muted/75 backdrop-blur-md">
                <tr>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-12">
                        #
                    </th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[280px]">
                        Product & Packaging
                    </th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[130px]">
                        Physical Stock
                    </th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[180px]">
                        Family-Equivalent Stock
                    </th>
                    <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[110px]">
                        Target Qty
                    </th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[130px]">
                        Stock Level
                    </th>
                    <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[160px]">
                        Status & Insight
                    </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
                {families.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                            {emptyMessage}
                        </td>
                    </tr>
                ) : (
                    families.map((family, i) => {
                        const isExpanded = expandedFamilies.has(family.family_root_id);

                        if (family.has_variants) {
                            return (
                                <React.Fragment key={`family-${family.family_root_id}`}>
                                    {/* Consolidated Parent Row */}
                                    <motion.tr
                                        custom={i}
                                        variants={rowVariants}
                                        initial="hidden"
                                        animate="show"
                                        onClick={() => toggleFamily(family.family_root_id)}
                                        className="hover:bg-amber-500/[0.04] transition-colors cursor-pointer select-none group border-b border-border/30"
                                    >
                                        <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground/50 whitespace-nowrap align-middle">
                                            {i + 1}
                                        </td>
                                        <td className="px-4 py-3.5 align-middle">
                                            <div className="flex items-center gap-2.5">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleFamily(family.family_root_id);
                                                    }}
                                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-muted-foreground group-hover:text-foreground group-hover:border-amber-500/40 transition-all"
                                                    aria-label={isExpanded ? "Collapse variants" : "Expand variants"}
                                                >
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-3.5 w-3.5 text-amber-500" />
                                                    ) : (
                                                        <ChevronRight className="h-3.5 w-3.5" />
                                                    )}
                                                </button>
                                                <div>
                                                    <div className="font-bold text-foreground text-xs flex items-center gap-2">
                                                        <span>{family.family_name}</span>
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                                                        {family.family_code && (
                                                            <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-background text-foreground border border-border/60 shadow-xs whitespace-nowrap">
                                                                {family.family_code}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/15 border border-primary/25 px-2 py-0.5 rounded whitespace-nowrap">
                                                            {family.items.length} {family.items.length === 1 ? "SKU Variant" : "SKU Variants"}
                                                        </span>
                                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium ml-1">
                                                            {isExpanded ? "Click to collapse" : "Click to view breakdown"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap align-middle">
                                            <div>
                                                <span className="text-foreground text-xs font-bold">
                                                    {family.family_total_base_pieces.toLocaleString()}
                                                </span>
                                                <span className="ml-1 text-[10px] text-muted-foreground/70 font-normal">
                                                    {family.base_unit_name}
                                                </span>
                                            </div>
                                            {family.total_expired_pieces > 0 && (
                                                <div
                                                    className="text-[10px] text-rose-500/70 font-normal mt-0.5 whitespace-nowrap"
                                                    title="Expired stock excluded from usable inventory under FEFO"
                                                >
                                                    +{family.total_expired_pieces.toLocaleString()} expired
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap align-middle">
                                            <div>
                                                <span
                                                    className={
                                                        family.family_total_base_pieces < family.maintaining_quantity
                                                            ? "text-rose-600 dark:text-rose-400 font-extrabold text-xs"
                                                            : "text-foreground font-bold text-xs"
                                                    }
                                                >
                                                    {family.family_total_base_pieces.toLocaleString()}
                                                </span>
                                                <span className="ml-1 text-[10px] text-muted-foreground font-semibold">
                                                    {family.base_unit_name}
                                                </span>
                                            </div>
                                            <div
                                                className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 whitespace-nowrap"
                                                title="Total usable pieces pooled across all related packaging variants in the warehouse"
                                            >
                                                Pooled across {family.items.length} variants
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-muted-foreground whitespace-nowrap align-middle">
                                            <span className="text-xs">
                                                {family.maintaining_quantity > 0
                                                    ? family.maintaining_quantity.toLocaleString()
                                                    : "-"}
                                            </span>
                                            {family.maintaining_quantity > 0 && (
                                                <span className="ml-1.5 text-[10px] text-muted-foreground/70 font-normal">
                                                    {family.base_unit_name}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                                            <StockProgressBar
                                                equivalentOnHand={family.family_total_base_pieces}
                                                maintaining={family.maintaining_quantity}
                                                isCritical={family.stock_status === "CRITICAL_DEFICIT"}
                                            />
                                        </td>
                                        <td className="px-4 py-3.5 text-center whitespace-nowrap align-middle">
                                            <StockStatusBadge
                                                status={family.stock_status}
                                                physicalOnHand={family.family_total_base_pieces}
                                                equivalentOnHand={family.family_total_base_pieces}
                                                maintaining={family.maintaining_quantity}
                                            />
                                        </td>
                                    </motion.tr>

                                    {/* Expandable Child SKU Rows */}
                                    {isExpanded &&
                                        family.items.map((item) => (
                                            <tr
                                                key={`child-${item.product_id}`}
                                                className="bg-muted/30 border-b border-border/20 hover:bg-muted/40 transition-colors"
                                            >
                                                <td className="px-4 py-2.5 text-center font-mono text-[10px] text-muted-foreground/40 whitespace-nowrap align-middle">
                                                    └─
                                                </td>
                                                <td className="px-4 py-2.5 align-middle pl-10">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="text-xs font-semibold text-foreground">
                                                            {item.description || item.product_name}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                                                            <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-background text-foreground border border-border/60 shadow-xs whitespace-nowrap">
                                                                {item.product_code ?? "-"}
                                                            </span>
                                                            {item.unit_multiplier > 1 ? (
                                                                <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 rounded whitespace-nowrap">
                                                                    1:{item.unit_multiplier} {item.base_unit_name || "PCS"}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground bg-muted border border-border/40 px-1.5 py-0.5 rounded whitespace-nowrap">
                                                                    Base Unit ({item.unit || item.base_unit_name || "PCS"})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap align-middle">
                                                    <div>
                                                        <span
                                                            className={
                                                                item.physical_on_hand === 0
                                                                    ? "text-rose-600 dark:text-rose-400 font-extrabold text-xs"
                                                                    : "text-foreground text-xs font-bold"
                                                            }
                                                        >
                                                            {item.physical_on_hand.toLocaleString(undefined, {
                                                                minimumFractionDigits: 0,
                                                                maximumFractionDigits: 2,
                                                            })}
                                                        </span>
                                                        {item.unit && (
                                                            <span className="ml-1 text-[10px] text-muted-foreground/70 font-normal">
                                                                {item.unit}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {item.expired_quantity > 0 && (
                                                        <div className="text-[9px] text-rose-500/70 font-normal mt-0.5 whitespace-nowrap">
                                                            +{item.expired_quantity.toLocaleString()} expired
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap align-middle">
                                                    <div>
                                                        <span
                                                            className={
                                                                item.family_equivalent_on_hand < item.maintaining_quantity
                                                                    ? "text-rose-600 dark:text-rose-400 font-extrabold text-xs"
                                                                    : "text-foreground font-bold text-xs"
                                                            }
                                                        >
                                                            {item.family_equivalent_on_hand.toLocaleString(undefined, {
                                                                minimumFractionDigits: 0,
                                                                maximumFractionDigits: 2,
                                                            })}
                                                        </span>
                                                        {item.unit && (
                                                            <span className="ml-1 text-[10px] text-muted-foreground font-semibold">
                                                                {item.unit} eq.
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-muted-foreground whitespace-nowrap align-middle">
                                                    <span className="text-xs">
                                                        {item.maintaining_quantity > 0
                                                            ? item.maintaining_quantity.toLocaleString()
                                                            : "-"}
                                                    </span>
                                                    {item.unit && item.maintaining_quantity > 0 && (
                                                        <span className="ml-1.5 text-[10px] text-muted-foreground/70 font-normal">
                                                            {item.unit}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 whitespace-nowrap align-middle">
                                                    <StockProgressBar
                                                        equivalentOnHand={item.family_equivalent_on_hand}
                                                        maintaining={item.maintaining_quantity}
                                                        isCritical={item.stock_status === "CRITICAL_DEFICIT"}
                                                    />
                                                </td>
                                                <td className="px-4 py-2.5 text-center whitespace-nowrap align-middle">
                                                    <StockStatusBadge
                                                        status={item.stock_status}
                                                        physicalOnHand={item.physical_on_hand}
                                                        equivalentOnHand={item.family_equivalent_on_hand}
                                                        maintaining={item.maintaining_quantity}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                </React.Fragment>
                            );
                        }

                        // Single standalone item (no variants)
                        const singleItem = family.items[0];
                        const displayName = singleItem.description || singleItem.product_name;

                        return (
                            <motion.tr
                                key={singleItem.product_id}
                                custom={i}
                                variants={rowVariants}
                                initial="hidden"
                                animate="show"
                                className="hover:bg-amber-500/[0.03] transition-colors border-b border-border/30"
                            >
                                <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground/50 whitespace-nowrap align-middle">
                                    {i + 1}
                                </td>
                                <td className="px-4 py-3.5 align-middle">
                                    <div className="font-semibold text-foreground whitespace-nowrap text-xs">
                                        {displayName}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                                        <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted/70 text-muted-foreground border border-border/40 whitespace-nowrap inline-block">
                                            {singleItem.product_code ?? "-"}
                                        </span>
                                        {singleItem.unit && (
                                            <span className="text-[10px] font-mono text-muted-foreground">
                                                ({singleItem.unit})
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap align-middle">
                                    <div>
                                        <span
                                            className={
                                                singleItem.physical_on_hand === 0
                                                    ? "text-rose-600 dark:text-rose-400 font-extrabold text-xs"
                                                    : "text-foreground text-xs font-bold"
                                            }
                                        >
                                            {singleItem.physical_on_hand.toLocaleString(undefined, {
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 2,
                                            })}
                                        </span>
                                        {singleItem.unit && (
                                            <span className="ml-1 text-[10px] text-muted-foreground/70 font-normal">
                                                {singleItem.unit}
                                            </span>
                                        )}
                                    </div>
                                    {singleItem.expired_quantity > 0 && (
                                        <div
                                            className="text-[10px] text-rose-500/70 font-normal mt-0.5 whitespace-nowrap"
                                            title="Expired stock excluded from usable inventory under FEFO"
                                        >
                                            +{singleItem.expired_quantity.toLocaleString()} expired
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap align-middle">
                                    <div>
                                        <span
                                            className={
                                                singleItem.family_equivalent_on_hand < singleItem.maintaining_quantity
                                                    ? "text-rose-600 dark:text-rose-400 font-extrabold text-xs"
                                                    : "text-foreground font-bold text-xs"
                                            }
                                        >
                                            {singleItem.family_equivalent_on_hand.toLocaleString(undefined, {
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 2,
                                            })}
                                        </span>
                                        {singleItem.unit && (
                                            <span className="ml-1 text-[10px] text-muted-foreground font-semibold">
                                                {singleItem.unit} eq.
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-muted-foreground whitespace-nowrap align-middle">
                                    <span className="text-xs">
                                        {singleItem.maintaining_quantity > 0
                                            ? singleItem.maintaining_quantity.toLocaleString()
                                            : "-"}
                                    </span>
                                    {singleItem.unit && (
                                        <span className="ml-1.5 text-[10px] text-muted-foreground/70 font-normal">
                                            {singleItem.unit}
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                                    <StockProgressBar
                                        equivalentOnHand={singleItem.family_equivalent_on_hand}
                                        maintaining={singleItem.maintaining_quantity}
                                        isCritical={singleItem.stock_status === "CRITICAL_DEFICIT"}
                                    />
                                </td>
                                <td className="px-4 py-3.5 text-center whitespace-nowrap align-middle">
                                    <StockStatusBadge
                                        status={singleItem.stock_status}
                                        physicalOnHand={singleItem.physical_on_hand}
                                        equivalentOnHand={singleItem.family_equivalent_on_hand}
                                        maintaining={singleItem.maintaining_quantity}
                                    />
                                </td>
                            </motion.tr>
                        );
                    })
                )}
            </tbody>
        </table>
    );

    const renderBatchTable = (batches: NearExpiryBatch[], emptyMessage: string) => (
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
                {batches.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                            {emptyMessage}
                        </td>
                    </tr>
                ) : (
                    batches.map((batch, i) => {
                        const days = batch.days_remaining ?? 0;
                        const isExpired = batch.status === "EXPIRED" || days <= 0;
                        const isCritical = !isExpired && days <= 14;
                        const isUrgent = !isExpired && days <= 30;

                        return (
                            <motion.tr
                                key={`${batch.product_id}-${batch.batch_no}-${batch.branch_id}-${i}`}
                                custom={i}
                                variants={rowVariants}
                                initial="hidden"
                                animate="show"
                                className="hover:bg-orange-500/[0.03] transition-colors"
                            >
                                <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground/50 whitespace-nowrap align-middle">
                                    {i + 1}
                                </td>
                                <td className="px-4 py-3.5 text-center whitespace-nowrap align-middle">
                                    <ExpiryStatusBadge status={batch.status} />
                                </td>
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
                                <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                        <Clock
                                            className={`h-3.5 w-3.5 shrink-0 ${
                                                isExpired
                                                    ? "text-red-600"
                                                    : isCritical
                                                    ? "text-red-500"
                                                    : isUrgent
                                                    ? "text-orange-500"
                                                    : "text-amber-500"
                                            }`}
                                        />
                                        <span
                                            className={`tabular-nums text-xs ${
                                                isExpired
                                                    ? "text-red-600 dark:text-red-400 font-extrabold"
                                                    : isCritical
                                                    ? "text-red-600 dark:text-red-400 font-bold"
                                                    : isUrgent
                                                    ? "text-orange-600 dark:text-orange-400 font-bold"
                                                    : "text-foreground font-medium"
                                            }`}
                                        >
                                            {batch.days_remaining !== null
                                                ? batch.days_remaining < 0
                                                    ? `Expired ${Math.abs(batch.days_remaining)} ${
                                                          Math.abs(batch.days_remaining) === 1 ? "day" : "days"
                                                      } ago`
                                                    : batch.days_remaining === 0
                                                    ? "Expired today"
                                                    : `${batch.days_remaining} ${
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
                                <td className="px-4 py-3.5 whitespace-nowrap align-middle font-medium text-foreground">
                                    <div className="text-xs">{batch.branch_name || "-"}</div>
                                    {batch.branch_code && batch.branch_code !== batch.branch_name && (
                                        <div className="text-[10px] font-mono text-muted-foreground/60">
                                            {batch.branch_code}
                                        </div>
                                    )}
                                </td>
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
    );

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop without dismissal on outside click */}
                    <motion.div
                        key="low-stock-overlay"
                        variants={overlayVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm"
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/50 bg-amber-500/[0.03] px-6 py-4 gap-4">
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
                                            {stockItems.length} {stockItems.length === 1 ? "Stock Deficit" : "Stock Deficits"} &bull; {totalExpiryBatches} Expired & Near Expiry
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Live on-hand deficit, expired stock, and near-expiry raw materials monitoring across active good branches (FEFO priority).
                                    </p>
                                </div>
                            </div>

                            {/* Search Input */}
                            <div className="relative w-full sm:w-72 shrink-0">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder={
                                        activeTab === "critical" || activeTab === "packaging"
                                            ? "Search product, SKU, or packaging..."
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

                        {/* Navigation Tabs (4 Step Progress Indicators - Strict Lockstep with Smooth Glide) */}
                        <div
                            role="tablist"
                            aria-label="Alert Review Steps"
                            className="flex items-center gap-1 border-b border-border/50 bg-muted/15 px-6 pt-2 shrink-0 overflow-x-auto select-none pointer-events-none relative"
                        >
                            {[
                                {
                                    key: "critical" as const,
                                    label: "Critical Deficits",
                                    count: criticalDeficitCount,
                                    icon: PackageX,
                                    activeColorClass: "text-rose-600 dark:text-rose-400",
                                    activeBorderClass: "border-rose-500",
                                    badgeActiveClass: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                                },
                                {
                                    key: "packaging" as const,
                                    label: "Packaging Shortages",
                                    count: packagingShortageCount,
                                    icon: Boxes,
                                    activeColorClass: "text-amber-600 dark:text-amber-400",
                                    activeBorderClass: "border-amber-500",
                                    badgeActiveClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                },
                                {
                                    key: "expired" as const,
                                    label: "Expired Batches",
                                    count: expiredBatchesCount,
                                    icon: PackageX,
                                    activeColorClass: "text-red-600 dark:text-red-400",
                                    activeBorderClass: "border-red-600",
                                    badgeActiveClass: "bg-red-600/15 text-red-700 dark:text-red-300",
                                },
                                {
                                    key: "near_expiry" as const,
                                    label: "Near Expiry Batches",
                                    count: nearExpiryBatchesCount,
                                    icon: Clock,
                                    activeColorClass: "text-orange-600 dark:text-orange-400",
                                    activeBorderClass: "border-orange-500",
                                    badgeActiveClass: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
                                },
                            ].map((tab) => {
                                const isActive = activeTab === tab.key;
                                const IconComponent = tab.icon;

                                return (
                                    <div
                                        key={tab.key}
                                        id={`${tab.key}-tab-indicator`}
                                        role="tab"
                                        aria-selected={isActive}
                                        className={`relative flex items-center gap-2 px-4 py-2.5 text-xs font-bold -mb-[1px] whitespace-nowrap cursor-default transition-colors duration-200 ${
                                            isActive
                                                ? tab.activeColorClass
                                                : "text-muted-foreground/70"
                                        }`}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeAlertTabHighlight"
                                                className={`absolute inset-0 rounded-t-lg bg-background border-b-2 shadow-xs ${tab.activeBorderClass}`}
                                                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                                            />
                                        )}
                                        <div className="relative z-10 flex items-center gap-2">
                                            <IconComponent
                                                className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                                                    isActive ? "" : "text-muted-foreground/60"
                                                }`}
                                            />
                                            <span>{tab.label}</span>
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold transition-colors ${
                                                    isActive
                                                        ? tab.badgeActiveClass
                                                        : "bg-muted text-muted-foreground/70"
                                                }`}
                                            >
                                                {tab.count}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Content Body */}
                        <div
                            ref={contentScrollRef}
                            className="flex-1 overflow-y-auto overflow-x-auto overscroll-contain relative"
                        >
                            <AnimatePresence mode="wait" custom={direction} initial={false}>
                                <motion.div
                                    key={activeTab}
                                    custom={direction}
                                    variants={tabContentVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    className="w-full min-w-full"
                                >
                                    {activeTab === "critical" &&
                                        renderStockTable(
                                            criticalStockFamilies,
                                            "No critical deficits detected. All active monitored products meet warehouse maintaining targets."
                                        )}
                                    {activeTab === "packaging" &&
                                        renderStockTable(
                                            packagingStockFamilies,
                                            "No packaging shortages detected. All SKU packaging variants have sufficient stock."
                                        )}
                                    {activeTab === "expired" &&
                                        renderBatchTable(
                                            filteredExpiredBatches,
                                            "No expired batches detected across active good branches."
                                        )}
                                    {activeTab === "near_expiry" &&
                                        renderBatchTable(
                                            filteredNearExpiryBatches,
                                            "No near-expiry batches detected within the FEFO shelf-life monitoring window."
                                        )}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-6 py-3.5 shrink-0">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>Quantities reflect active good branches only (expired stock & bad warehouses excluded)</span>
                            </div>

                            {/* Sequential Review Flow Actions */}
                            <div className="flex items-center gap-3">
                                {prevTabConfig && (
                                    <button
                                        id="low-stock-back-btn"
                                        type="button"
                                        onClick={() => goToTab(prevTabConfig.key, -1)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-background hover:bg-muted text-foreground font-semibold text-xs px-4 py-2.5 transition-all cursor-pointer"
                                    >
                                        <ArrowLeft className="h-3.5 w-3.5" />
                                        <span>Back to {prevTabConfig.label}</span>
                                    </button>
                                )}

                                {nextTabConfig ? (
                                    <button
                                        id="low-stock-next-btn"
                                        type="button"
                                        onClick={() => goToTab(nextTabConfig.key, 1)}
                                        className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
                                    >
                                        <span>Next: {nextTabConfig.label}</span>
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                ) : (
                                    <button
                                        id="low-stock-acknowledge-btn"
                                        type="button"
                                        onClick={handleClose}
                                        className="rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
                                    >
                                        Acknowledge Alerts
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
