"use client";

import * as React from "react";
import { ProductTracingFilters } from "./components/ProductTracingFilters";
import { ProductTracingTable } from "./components/ProductTracingTable";
import { ProductTracingSummaryCards } from "./components/ProductTracingSummaryCards";
import {
    fetchBranches,
    fetchProductTypes,
    fetchProducts,
    fetchLots,
    fetchUsers,
    fetchMovements,
    UserLookup
} from "./providers/fetchProvider";
import { computeMovementSummary, computeRunningBalances } from "./service";
import {
    ProductTracingFiltersType,
    MMInventoryMovement,
    BranchLookup,
    ProductTypeLookup,
    ProductLookup,
    LotLookup,
    MovementSummaryStats
} from "./types";
import {
    History as HistoryIcon,
    RefreshCw,
    AlertTriangle,
    RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const ProductTracingModule = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => {
    const [filters, setFilters] = React.useState<ProductTracingFiltersType>({
        branch_id: null,
        product_type_id: null,
        product_id: null,
        lot_id: null,
        batch_no: "",
        transaction_type: "ALL",
        movement_direction: "ALL",
        inventory_condition: "ALL",
        search_query: "",
        startDate: null,
        endDate: null,
        datePreset: "all"
    });

    const [branches, setBranches] = React.useState<BranchLookup[]>([]);
    const [productTypes, setProductTypes] = React.useState<ProductTypeLookup[]>([]);
    const [products, setProducts] = React.useState<ProductLookup[]>([]);
    const [lots, setLots] = React.useState<LotLookup[]>([]);
    const [users, setUsers] = React.useState<UserLookup[]>([]);

    const [movements, setMovements] = React.useState<MMInventoryMovement[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Load lookup data on mount
    React.useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [b, pt, pr, l, u] = await Promise.all([
                    fetchBranches(),
                    fetchProductTypes(),
                    fetchProducts(),
                    fetchLots(),
                    fetchUsers()
                ]);
                setBranches(b || []);
                setProductTypes(pt || []);
                setProducts(pr || []);
                setLots(l || []);
                setUsers(u || []);
            } catch (err) {
                console.error("[ProductTracing] Failed to load initial lookup data:", err);
            }
        };
        loadInitialData();
    }, []);

    // Perform Movements Query
    const handleSearch = React.useCallback(async (overrideFilters?: ProductTracingFiltersType) => {
        const activeFilters = overrideFilters || filters;
        setIsLoading(true);
        setError(null);

        try {
            const rawMovements = await fetchMovements(activeFilters);
            const enriched = computeRunningBalances(rawMovements);
            setMovements(enriched);
        } catch (err) {
            const message = (err as Error).message || "Failed to fetch inventory movements from Spring Boot API";
            setError(message);
            setMovements([]);
            toast.error(message, {
                description: "Ensure the Spring Boot backend service is running and accessible.",
                duration: 5000
            });
            console.error("[ProductTracing] Spring Boot API Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [filters]);

    // Initial search on mount once
    React.useEffect(() => {
        handleSearch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFilterChange = (newFilters: Partial<ProductTracingFiltersType>) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    };

    const handleReset = () => {
        const resetState: ProductTracingFiltersType = {
            branch_id: null,
            product_type_id: null,
            product_id: null,
            lot_id: null,
            batch_no: "",
            transaction_type: "ALL",
            movement_direction: "ALL",
            inventory_condition: "ALL",
            search_query: "",
            startDate: null,
            endDate: null,
            datePreset: "all"
        };
        setFilters(resetState);
        handleSearch(resetState);
    };

    // Client-side date filtering & computed KPI summaries
    const filteredMovements = React.useMemo(() => {
        let list = movements;

        if (filters.startDate) {
            const start = new Date(filters.startDate).getTime();
            list = list.filter(m => {
                const itemTime = new Date(m.transactionDate || m.postedAt || 0).getTime();
                return itemTime >= start;
            });
        }

        if (filters.endDate) {
            const end = new Date(filters.endDate).getTime();
            list = list.filter(m => {
                const itemTime = new Date(m.transactionDate || m.postedAt || 0).getTime();
                return itemTime <= end;
            });
        }

        if (filters.inventory_condition && filters.inventory_condition !== "ALL") {
            const cond = filters.inventory_condition.toUpperCase();
            list = list.filter(m => (m.inventoryCondition || "GOOD").toUpperCase() === cond);
        }

        return list;
    }, [movements, filters.startDate, filters.endDate, filters.inventory_condition]);

    const stats: MovementSummaryStats = React.useMemo(() => {
        return computeMovementSummary(filteredMovements);
    }, [filteredMovements]);

    const activeBranchName = React.useMemo(() => {
        if (!filters.branch_id) return "All Branches";
        const found = branches.find(b => b.id === filters.branch_id);
        return found ? (found.branchName || found.branch_name) : `Branch #${filters.branch_id}`;
    }, [filters.branch_id, branches]);

    const activeProductTypeName = React.useMemo(() => {
        if (!filters.product_type_id) return "All Categories";
        const found = productTypes.find(pt => Number(pt.id) === filters.product_type_id);
        return found ? (found.name || found.type_name) : `Type #${filters.product_type_id}`;
    }, [filters.product_type_id, productTypes]);

    return (
        <div ref={ref} className={cn("space-y-6 max-w-[1600px] mx-auto pb-12", props.className)} {...props}>
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary shadow-xs">
                        <HistoryIcon className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-foreground">
                            Product Movement & Tracing
                        </h1>
                        <p className="text-muted-foreground text-xs mt-0.5">
                            Real-time audit trail, batch provenance, and inventory movements ledger.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl px-3.5 text-xs font-bold gap-2 text-muted-foreground hover:text-foreground"
                        onClick={() => handleSearch()}
                        disabled={isLoading}
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Error Banner when Spring Boot is down */}
            {error && (
                <div className="p-4 rounded-2xl border border-destructive/30 bg-destructive/5 text-destructive flex items-center justify-between gap-4 animate-in fade-in duration-300">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        <div>
                            <p className="text-xs font-bold">Spring Boot Inventory Movement API Error</p>
                            <p className="text-xs opacity-90">{error}</p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 rounded-xl px-4 text-xs font-bold shrink-0"
                        onClick={() => handleSearch()}
                    >
                        <RotateCcw className="h-3 w-3 mr-1.5" />
                        Retry
                    </Button>
                </div>
            )}

            {/* Top KPI Metrics Cards */}
            <ProductTracingSummaryCards stats={stats} />

            {/* Filters Toolbar */}
            <ProductTracingFilters
                filters={filters}
                branches={branches}
                productTypes={productTypes}
                products={products}
                lots={lots}
                onFilterChange={handleFilterChange}
                onReset={handleReset}
                onSearch={() => handleSearch()}
                isLoading={isLoading}
            />

            {/* Movement Ledger Table */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    <h2 className="text-base font-black tracking-tight text-foreground">
                        Movement Ledger
                    </h2>
                    <span className="text-xs text-muted-foreground px-2.5 py-1 bg-muted/60 rounded-full font-bold">
                        {filteredMovements.length} {filteredMovements.length === 1 ? "Record" : "Records"}
                    </span>
                </div>

                <ProductTracingTable
                    data={filteredMovements}
                    isLoading={isLoading}
                    branchName={activeBranchName}
                    productTypeName={activeProductTypeName}
                    startDate={filters.startDate}
                    endDate={filters.endDate}
                    branches={branches}
                    products={products}
                    lots={lots}
                    productTypes={productTypes}
                    users={users}
                />
            </div>
        </div>
    );
});

ProductTracingModule.displayName = "ProductTracingModule";
