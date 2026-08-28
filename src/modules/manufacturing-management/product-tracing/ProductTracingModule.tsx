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
    fetchMovements
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
    RotateCcw,
    Terminal,
    ChevronDown,
    ChevronUp,
    Copy,
    Check,
    CheckCircle2,
    Server
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DebugFetchInfo {
    timestamp: string;
    proxyUrl: string;
    targetSpringBootUrl: string;
    filterParams: Record<string, string>;
    status: number | "error" | "loading";
    statusText: string;
    recordsCount: number;
    samplePayload?: MMInventoryMovement;
    durationMs?: number;
}

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

    const [movements, setMovements] = React.useState<MMInventoryMovement[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [hasLoadedInitial, setHasLoadedInitial] = React.useState(false);

    // Debug Inspector State
    const [showDebugPanel, setShowDebugPanel] = React.useState(false);
    const [debugInfo, setDebugInfo] = React.useState<DebugFetchInfo | null>(null);
    const [copiedDebug, setCopiedDebug] = React.useState(false);

    // Load lookup data on mount
    React.useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [b, pt, pr, l] = await Promise.all([
                    fetchBranches(),
                    fetchProductTypes(),
                    fetchProducts(),
                    fetchLots()
                ]);
                setBranches(b || []);
                setProductTypes(pt || []);
                setProducts(pr || []);
                setLots(l || []);
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
        const startTime = Date.now();

        const queryParams: Record<string, string> = {};
        if (activeFilters.branch_id) queryParams["branch"] = String(activeFilters.branch_id);
        if (activeFilters.product_type_id) queryParams["productType"] = String(activeFilters.product_type_id);
        if (activeFilters.product_id) queryParams["productId"] = String(activeFilters.product_id);
        if (activeFilters.lot_id) queryParams["lotId"] = String(activeFilters.lot_id);
        if (activeFilters.batch_no) queryParams["batchNo"] = activeFilters.batch_no;
        if (activeFilters.transaction_type && activeFilters.transaction_type !== "ALL") queryParams["transactionType"] = activeFilters.transaction_type;
        if (activeFilters.movement_direction && activeFilters.movement_direction !== "ALL") queryParams["direction"] = activeFilters.movement_direction;
        if (activeFilters.search_query) queryParams["referenceNo"] = activeFilters.search_query;

        const proxySearch = new URLSearchParams(queryParams).toString();
        const proxyUrl = `/api/manufacturing/inventory-movements${proxySearch ? `?${proxySearch}` : ""}`;

        // Construct target Spring Boot URL for debug visibility
        const springQuery = new URLSearchParams();
        if (activeFilters.branch_id) springQuery.set("branch", String(activeFilters.branch_id));
        if (activeFilters.product_type_id) springQuery.set("productType", String(activeFilters.product_type_id));
        const targetSpringBootUrl = springQuery.toString()
            ? `http://100.95.246.18:8188/api/mm-inventory-movements/filter?${springQuery.toString()}`
            : `http://100.95.246.18:8188/api/mm-inventory-movements/all`;

        try {
            const rawMovements = await fetchMovements(activeFilters);
            const enriched = computeRunningBalances(rawMovements);
            setMovements(enriched);
            setHasLoadedInitial(true);

            setDebugInfo({
                timestamp: new Date().toLocaleTimeString(),
                proxyUrl,
                targetSpringBootUrl,
                filterParams: queryParams,
                status: 200,
                statusText: "OK",
                recordsCount: enriched.length,
                samplePayload: enriched.length > 0 ? enriched[0] : undefined,
                durationMs: Date.now() - startTime
            });
        } catch (err) {
            const message = (err as Error).message || "Failed to fetch inventory movements from Spring Boot API";
            setError(message);
            setMovements([]);
            toast.error(message, {
                description: "Ensure the Spring Boot backend service is running and accessible.",
                duration: 5000
            });

            setDebugInfo({
                timestamp: new Date().toLocaleTimeString(),
                proxyUrl,
                targetSpringBootUrl,
                filterParams: queryParams,
                status: "error",
                statusText: message,
                recordsCount: 0,
                durationMs: Date.now() - startTime
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

    const copyDebugJson = () => {
        if (!debugInfo) return;
        navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
        setCopiedDebug(true);
        toast.success("Copied API debug information to clipboard!");
        setTimeout(() => setCopiedDebug(false), 2000);
    };

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
                        className={cn(
                            "h-9 rounded-xl px-3.5 text-xs font-bold gap-1.5 transition-colors",
                            showDebugPanel ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setShowDebugPanel(!showDebugPanel)}
                    >
                        <Terminal className="h-3.5 w-3.5" />
                        <span>Inspect Fetch Debug</span>
                        {showDebugPanel ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
                    </Button>

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

            {/* Live API Debug Inspector Panel */}
            {showDebugPanel && (
                <div className="p-5 rounded-2xl border bg-slate-950 text-slate-100 shadow-xl space-y-4 font-mono text-xs animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                            <Server className="h-4 w-4 text-emerald-400" />
                            <span className="font-bold text-sm text-slate-100 font-sans">
                                MM-Inventory-Movements API Fetch Inspector
                            </span>
                            <Badge className={cn(
                                "text-[10px] font-mono font-bold px-2 py-0.5",
                                debugInfo?.status === 200 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                                debugInfo?.status === "loading" ? "bg-blue-500/20 text-blue-300" :
                                "bg-rose-500/20 text-rose-300 border-rose-500/30"
                            )}>
                                Status: {debugInfo?.status === 200 ? "200 OK" : debugInfo?.status || "PENDING"}
                            </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                            {debugInfo?.durationMs !== undefined && (
                                <span className="text-[11px] text-slate-400">
                                    Latency: <strong className="text-slate-200">{debugInfo.durationMs}ms</strong>
                                </span>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg gap-1"
                                onClick={copyDebugJson}
                            >
                                {copiedDebug ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                Copy Debug Info
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block font-sans">
                                Next.js BFF Proxy Endpoint:
                            </span>
                            <p className="text-emerald-400 break-all font-mono font-semibold">
                                {debugInfo?.proxyUrl || "None"}
                            </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block font-sans">
                                Target Spring Boot Endpoint:
                            </span>
                            <p className="text-cyan-400 break-all font-mono font-semibold">
                                {debugInfo?.targetSpringBootUrl || "None"}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                            <span>Fetched: <strong className="text-slate-200">{debugInfo?.recordsCount ?? 0} records</strong></span>
                            <span>Last fetched at: <strong className="text-slate-200">{debugInfo?.timestamp || "N/A"}</strong></span>
                        </div>

                        {debugInfo?.samplePayload && (
                            <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block font-sans">
                                    Sample Item #1 Payload Preview:
                                </span>
                                <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto max-h-48">
                                    {JSON.stringify(debugInfo.samplePayload, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}

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
                />
            </div>
        </div>
    );
});

ProductTracingModule.displayName = "ProductTracingModule";
