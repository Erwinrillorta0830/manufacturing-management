import React, { useState, useRef, useEffect } from "react";
import {
    Plus,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Folder, Loader2, ArrowRight, TrendingUp, TrendingDown, Layers, Clock, Search, ChevronLeft, ChevronRight, X, Printer
} from "lucide-react";
import { toast } from "sonner";
import { QuotationHeader, QuotationSnapshotNode, Customer, Project } from "../types";
import { generateComparativePDF } from "../utils/exportComparativePDF";

interface ProjectPortfolioItem {
    projectId: number;
    projectName: string;
    customerId: number;
    customerName: string;
    quoteCount: number;
    latest: QuotationHeader;
    history: QuotationHeader[];
}

interface QuotationListProps {
    quotes: QuotationHeader[];
    loadingQuotes: boolean;
    loadQuotes: () => void;
    viewQuoteDetails: (quote: QuotationHeader) => void;
    allProjects: ProjectPortfolioItem[];
    startCreateQuoteForProject: (projName: string, customerId: number, projectId?: number) => void;
}

export function QuotationList({
    quotes,
    loadingQuotes,
    loadQuotes,
    viewQuoteDetails,
    allProjects,
    startCreateQuoteForProject
}: QuotationListProps) {
    const [subTab, setSubTab] = useState<"all" | "active" | "approved" | "rejected">("all");
    const [listSearchQuery, setListSearchQuery] = useState("");
    const [listPage, setListPage] = useState(1);
    const [listItemsPerPage, setListItemsPerPage] = useState(10);



    React.useEffect(() => {
        setListPage(1);
    }, [subTab, listSearchQuery]);

    // SKU History Modal States
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyProjectName, setHistoryProjectName] = useState("");
    const [historyQuotes, setHistoryQuotes] = useState<QuotationHeader[]>([]);
    const [projectSnapshots, setProjectSnapshots] = useState<Record<number, QuotationSnapshotNode[]>>({});

    // Grouping helper: finds the latest quote sheet per project name
    const projectGroups = React.useMemo(() => {
        const groups: Record<string, { latest: QuotationHeader; history: QuotationHeader[] }> = {};

        quotes.forEach(q => {
            const projObj = q.project_id && typeof q.project_id === "object" ? q.project_id as Project : null;
            const key = projObj?.project_name || `No Project Name (Quote: ${q.quote_number})`;
            if (!groups[key]) {
                groups[key] = { latest: q, history: [q] };
            } else {
                groups[key].history.push(q);
                // Compare dates or revision suffixes to find the latest
                const currLatest = groups[key].latest;
                const currTime = currLatest.quote_date ? new Date(currLatest.quote_date).getTime() : 0;
                const checkTime = q.quote_date ? new Date(q.quote_date).getTime() : 0;
                if (checkTime > currTime) {
                    groups[key].latest = q;
                }
            }
        });

        // Also add database projects that don't have quotes yet into the pipeline!
        allProjects.forEach(proj => {
            if (proj.quoteCount === 0) {
                const key = proj.projectName;
                if (!groups[key]) {
                    groups[key] = {
                        latest: proj.latest,
                        history: []
                    };
                }
            }
        });

        return groups;
    }, [quotes, allProjects]);

    const allProjectsList = React.useMemo(() => {
        return Object.entries(projectGroups)
            .map(([name, group]) => ({ projectName: name, ...group }))
            .sort((a, b) => {
                const tA = a.latest.quote_date ? new Date(a.latest.quote_date).getTime() : 0;
                const tB = b.latest.quote_date ? new Date(b.latest.quote_date).getTime() : 0;
                return tB - tA; // descending
            });
    }, [projectGroups]);

    const filteredProjects = React.useMemo(() => {
        let filtered = allProjectsList;

        // Status filter
        if (subTab === "active") {
            filtered = filtered.filter(p => p.latest.status !== "Rejected" && p.latest.status !== "Converted to SO");
        } else if (subTab === "approved") {
            filtered = filtered.filter(p => p.latest.status === "Converted to SO");
        } else if (subTab === "rejected") {
            filtered = filtered.filter(p => p.latest.status === "Rejected");
        }

        // Search filter
        if (listSearchQuery.trim()) {
            const query = listSearchQuery.toLowerCase().trim();
            filtered = filtered.filter(p => {
                const matchProjectName = p.projectName.toLowerCase().includes(query);
                const matchQuoteNo = p.latest.quote_number.toLowerCase().includes(query);
                const customerName = p.latest.customer_id && typeof p.latest.customer_id === "object"
                    ? (p.latest.customer_id as Customer).customer_name
                    : "";
                const matchCustomer = customerName.toLowerCase().includes(query);
                return matchProjectName || matchQuoteNo || matchCustomer;
            });
        }
        return filtered;
    }, [allProjectsList, subTab, listSearchQuery]);


    // Paginated slice
    const paginatedProjects = React.useMemo(() => {
        const start = (listPage - 1) * listItemsPerPage;
        return filteredProjects.slice(start, start + listItemsPerPage);
    }, [filteredProjects, listPage, listItemsPerPage]);

    const currentTotalPagesCount = Math.ceil(filteredProjects.length / listItemsPerPage) || 1;

    const handleViewSkuHistory = async (projName: string, historyList: QuotationHeader[]) => {
        setHistoryProjectName(projName);
        setHistoryQuotes(historyList);
        setHistoryModalOpen(true);
        setHistoryLoading(true);
        try {
            const fetched: Record<number, QuotationSnapshotNode[]> = {};
            await Promise.all(historyList.map(async (q) => {
                const res = await fetch(`/api/manufacturing/finished-goods/quotes/snapshots?quoteId=${q.id}`);
                if (res.ok) {
                    const data = await res.json();
                    fetched[q.id] = data;
                }
            }));
            setProjectSnapshots(fetched);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
            toast.error("Failed to load historical snapshots.");
        } finally {
            setHistoryLoading(false);
        }
    };

    // Sorted list of quotation headers in the active project history for column headers
    const sortedHistoryQuotes = React.useMemo(() => {
        return [...historyQuotes].sort((a, b) => {
            const tA = a.quote_date ? new Date(a.quote_date).getTime() : 0;
            const tB = b.quote_date ? new Date(b.quote_date).getTime() : 0;
            return tB - tA; // Sort descending
        }).slice(0, 5).reverse(); // Keep only latest 5, reverse back to ascending for left-to-right rendering
    }, [historyQuotes]);

    // Calculate SKU history structures inside the modal
    const skuHistoryList = React.useMemo(() => {
        if (!sortedHistoryQuotes.length) return [];

        const skuMap: Record<number, {
            productName: string;
            versions: Record<string, { price: number; cost: number }>;
            rawVersionsList: { price: number; cost: number }[];
        }> = {};

        sortedHistoryQuotes.forEach(q => {
            const snaps = projectSnapshots[q.id] || [];
            snaps.forEach(item => {
                if (item.node_type === "product_quota") {
                    const pId = item.product_id;
                    if (!skuMap[pId]) {
                        skuMap[pId] = {
                            productName: item.node_name,
                            versions: {},
                            rawVersionsList: []
                        };
                    }
                    const verData = {
                        price: Number(item.frozen_total_cost_php || 0),
                        cost: Number(item.frozen_unit_cost_php || 0)
                    };
                    skuMap[pId].versions[q.quote_number] = verData;
                    skuMap[pId].rawVersionsList.push(verData);
                }
            });
        });

        return Object.entries(skuMap).map(([pId, val]) => ({
            productId: Number(pId),
            ...val
        }));
    }, [sortedHistoryQuotes, projectSnapshots]);

    return (
        <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
                <div>
                    <h3 className="text-base font-bold text-foreground">Project Quotations & Pipeline</h3>
                    <p className="text-xs text-muted-foreground">Approve won proposals to generate Sales Orders, reject lost projects, and manage pricing sheet revision histories.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => startCreateQuoteForProject("", 0)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-md cursor-pointer"
                    >
                        <Plus className="h-4 w-4" /> Create Customer Quote
                    </button>
                    <button
                        onClick={loadQuotes}
                        className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted text-muted-foreground transition-all"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-start gap-4 mb-4">
                <div className="relative w-full sm:max-w-xs shrink-0">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search project, quote, customer..."
                        className="pl-9 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-semibold shadow-sm"
                        value={listSearchQuery}
                        onChange={(e) => setListSearchQuery(e.target.value)}
                    />
                </div>

                <div className="relative w-full sm:w-auto min-w-[200px]">
                    <select
                        value={subTab}
                        onChange={(e) => setSubTab(e.target.value as "all" | "active" | "approved" | "rejected")}
                        className="w-full appearance-none bg-background border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 pr-10 text-xs font-bold text-foreground outline-none focus:ring-1 focus:ring-primary shadow-sm cursor-pointer"
                    >
                        <option value="all">All</option>
                        <option value="active">Active</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
            </div>

            {loadingQuotes ? (
                <div className="flex flex-col items-center justify-center p-20 gap-2 text-muted-foreground">
                    <span className="text-xs">Loading quotations...</span>
                </div>
            ) : (
                <div className="overflow-hidden border rounded-xl bg-card shadow-sm">
                    {filteredProjects.length === 0 ? (
                        <div className="text-center p-20 max-w-md mx-auto">
                            <Folder className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                            <h4 className="text-sm font-bold text-foreground mb-1">No Projects Found</h4>
                            <p className="text-xs text-muted-foreground">Adjust your search or filter settings to find what you&apos;re looking for.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th className="p-3 font-semibold text-muted-foreground uppercase">Project Name</th>
                                        <th className="p-3 font-semibold text-muted-foreground uppercase">Customer</th>
                                        <th className="p-3 font-semibold text-muted-foreground uppercase">Latest Quotation</th>
                                        <th className="p-3 font-semibold text-muted-foreground uppercase text-right">Agreed Price</th>
                                        <th className="p-3 font-semibold text-muted-foreground uppercase text-center">Revisions</th>
                                        <th className="p-3 font-semibold text-muted-foreground uppercase text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {paginatedProjects.map(proj => {
                                        const q = proj.latest;
                                        const custName = (q.customer_id && typeof q.customer_id === "object")
                                            ? `${(q.customer_id as Customer).customer_name} (${(q.customer_id as Customer).customer_code})`
                                            : "Customer Deleted";
                                        const sellingPrice = Number(q.total_selling_price || 0);

                                        return (
                                            <tr
                                                key={proj.projectName}
                                                onClick={() => viewQuoteDetails(q)}
                                                className="hover:bg-muted/50 transition-colors cursor-pointer group"
                                            >
                                                <td className="p-3 font-bold text-primary group-hover:text-primary/80 transition-colors">
                                                    {proj.projectName}
                                                </td>
                                                <td className="p-3 font-medium text-foreground">{custName}</td>
                                                <td className="p-3 font-mono text-muted-foreground font-bold">{q.quote_number || "No Quotes Yet"}</td>
                                                <td className="p-3 text-right font-extrabold text-foreground">₱{sellingPrice.toFixed(2)}</td>
                                                <td className="p-3 text-center text-muted-foreground font-semibold">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleViewSkuHistory(proj.projectName, proj.history);
                                                        }}
                                                        className="hover:underline text-primary font-bold inline-flex items-center gap-1"
                                                    >
                                                        <Clock className="h-3 w-3" />
                                                        {proj.history.length} sheet(s)
                                                    </button>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${q.status === "Converted to SO"
                                                        ? "bg-teal-500/10 text-teal-600 border-teal-500/20"
                                                        : q.status === "Rejected"
                                                            ? "bg-destructive/10 text-destructive border-destructive/20"
                                                            : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                                        }`}>
                                                        {q.status === "Converted to SO" ? "Approved" : (q.status || "Draft")}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 select-none">
                        <div className="flex items-center gap-4">
                            <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-2">
                                <span>Rows per page:</span>
                                <select
                                    value={listItemsPerPage}
                                    onChange={(e) => {
                                        setListItemsPerPage(Number(e.target.value));
                                        setListPage(1);
                                    }}
                                    className="bg-transparent border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                            <div className="text-[10px] text-muted-foreground font-semibold">
                                Showing page <span className="text-foreground font-bold">{listPage}</span> of <span className="text-foreground font-bold">{currentTotalPagesCount}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                disabled={listPage <= 1}
                                onClick={() => setListPage(prev => Math.max(1, prev - 1))}
                                className="p-1 rounded-lg border bg-background text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:hover:bg-background transition-colors cursor-pointer"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                disabled={listPage >= currentTotalPagesCount}
                                onClick={() => setListPage(prev => Math.min(currentTotalPagesCount, prev + 1))}
                                className="p-1 rounded-lg border bg-background text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:hover:bg-background transition-colors cursor-pointer"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Project SKU Pricing Revision History (Excel Grid Format) */}
            {historyModalOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-card border rounded-xl shadow-xl w-full max-w-[90vw] h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/10">
                            <div>
                                <h3 className="text-base font-bold text-foreground">Project SKU Comparative Pricing Sheet (Excel View)</h3>
                                <p className="text-xs text-muted-foreground">Project Name: <strong className="text-foreground">{historyProjectName}</strong> | Tracked over historical revision periods</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        generateComparativePDF({
                                            projectName: historyProjectName,
                                            historyQuotes,
                                            skuHistoryList
                                        });
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors shadow-xs flex items-center gap-1.5"
                                >
                                    Export to PDF
                                </button>
                                <button
                                    onClick={() => setHistoryModalOpen(false)}
                                    className="text-muted-foreground hover:text-foreground text-xs font-semibold rounded-lg border px-3 py-1.5 hover:bg-muted"
                                >
                                    Close Grid
                                </button>
                            </div>
                        </div>

                        {/* Excel Spreadsheet Content */}
                        <div className="flex-1 overflow-auto p-6">
                            {historyLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground text-xs">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    <span>Compiling revision matrix columns...</span>
                                </div>
                            ) : skuHistoryList.length === 0 ? (
                                <div className="text-center py-20 text-xs text-muted-foreground">
                                    No raw material or finished SKU snapshots locked.
                                </div>
                            ) : (
                                <div className="overflow-x-auto border rounded-xl shadow-xs">
                                    <table className="w-full border-collapse text-left text-xs bg-card">
                                        <thead className="bg-muted/70 text-foreground border-b select-none">
                                            {/* Column headers row 1 */}
                                            <tr>
                                                <th rowSpan={2} className="p-3 font-bold border-r uppercase tracking-wider text-[10px] bg-muted/90 sticky left-0 z-20 min-w-[200px]">
                                                    Finished Good SKU
                                                </th>
                                                {sortedHistoryQuotes.map((q) => (
                                                    <th key={q.id} colSpan={2} className="p-2 font-bold text-left border-r border-b font-mono tracking-wider text-[10px]">
                                                        {q.quote_number}
                                                    </th>
                                                ))}
                                                <th colSpan={2} className="p-2 font-bold text-center bg-primary/5 text-primary border-b uppercase tracking-wider text-[10px]">
                                                    Cumulative Delta
                                                </th>
                                            </tr>
                                            {/* Column headers row 2 */}
                                            <tr className="bg-muted/40">
                                                {sortedHistoryQuotes.map((q) => (
                                                    <React.Fragment key={`sub-${q.id}`}>
                                                        <th className="p-2 text-right font-semibold border-r border-b text-[9px] uppercase tracking-wider text-muted-foreground">Price</th>
                                                        <th className="p-2 text-right font-semibold border-r border-b text-[9px] uppercase tracking-wider text-muted-foreground">Cost</th>
                                                    </React.Fragment>
                                                ))}
                                                <th className="p-2 text-right font-bold bg-primary/5 text-primary border-r border-b text-[9px] uppercase tracking-wider">Price Δ</th>
                                                <th className="p-2 text-right font-bold bg-primary/5 text-primary border-b text-[9px] uppercase tracking-wider">Cost Δ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {skuHistoryList.map((sku) => {
                                                // Calculate deltas from first revision to the latest version
                                                const firstVer = sku.rawVersionsList[0];
                                                const latestVer = sku.rawVersionsList[sku.rawVersionsList.length - 1];

                                                const priceDiff = latestVer.price - firstVer.price;
                                                const costDiff = latestVer.cost - firstVer.cost;

                                                return (
                                                    <tr key={sku.productId} className="hover:bg-muted/20 transition-colors">
                                                        <td className="p-3 font-bold text-foreground border-r bg-card sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                                            {sku.productName}
                                                        </td>
                                                        {sortedHistoryQuotes.map((q) => {
                                                            const verInfo = sku.versions[q.quote_number];
                                                            return verInfo ? (
                                                                <React.Fragment key={`cell-${sku.productId}-${q.id}`}>
                                                                    <td className="p-2 text-right font-bold text-foreground border-r font-mono">
                                                                        ₱{verInfo.price.toFixed(2)}
                                                                    </td>
                                                                    <td className="p-2 text-right text-muted-foreground border-r font-mono">
                                                                        ₱{verInfo.cost.toFixed(2)}
                                                                    </td>
                                                                </React.Fragment>
                                                            ) : (
                                                                <React.Fragment key={`cell-${sku.productId}-${q.id}`}>
                                                                    <td className="p-2 text-center text-muted-foreground/30 border-r font-semibold">—</td>
                                                                    <td className="p-2 text-center text-muted-foreground/30 border-r font-semibold">—</td>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        {/* Price delta */}
                                                        <td className={`p-2 text-right font-extrabold border-r font-mono bg-primary/5 ${priceDiff > 0 ? "text-emerald-600" : priceDiff < 0 ? "text-destructive" : "text-muted-foreground"
                                                            }`}>
                                                            {priceDiff > 0 ? "+" : ""}{priceDiff.toFixed(2)}
                                                        </td>
                                                        {/* Cost delta */}
                                                        <td className={`p-2 text-right font-extrabold font-mono bg-primary/5 ${costDiff > 0 ? "text-amber-600" : costDiff < 0 ? "text-emerald-600" : "text-muted-foreground"
                                                            }`}>
                                                            {costDiff > 0 ? "+" : ""}{costDiff.toFixed(2)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}


        </>
    );
}
