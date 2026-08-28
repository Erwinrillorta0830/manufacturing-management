import React, { useState, useRef, useEffect } from "react";
import { 
    FileText, Plus, ShieldAlert,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    Folder, Loader2, ArrowRight, TrendingUp, TrendingDown, Layers, Clock, Search, ChevronLeft, ChevronRight, X
} from "lucide-react";
import { toast } from "sonner";
import { QuotationHeader, Customer, QuotationSnapshotNode, Project } from "../types";

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
    customers: Customer[];
    handleSearchCustomers: (search: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerNewProject: (name: string, customerId: number, customerName: string) => Promise<any>;
    startCreateQuoteForProject: (projName: string, customerId: number, projectId?: number) => void;
}

export function QuotationList({
    quotes,
    loadingQuotes,
    loadQuotes,
    viewQuoteDetails,
    allProjects,
    customers,
    handleSearchCustomers,
    registerNewProject,
    startCreateQuoteForProject
}: QuotationListProps) {
    const [subTab, setSubTab] = useState<"pipeline" | "sheets" | "rejected">("pipeline");
    const [listSearchQuery, setListSearchQuery] = useState("");
    const [listPage, setListPage] = useState(1);
    const [listItemsPerPage, setListItemsPerPage] = useState(10);

    // Project selector modal states
    const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);
    const [selectorTab, setSelectorTab] = useState<"select" | "register">("select");
    const [projectSearch, setProjectSearch] = useState("");
    const [projectDisplayLimit, setProjectDisplayLimit] = useState(10);

    const [newProjName, setNewProjName] = useState("");
    const [newProjCustSearch, setNewProjCustSearch] = useState("");
    const [selectedCustId, setSelectedCustId] = useState<number | null>(null);
    const [selectedCustName, setSelectedCustName] = useState("");
    const [custSearchFocused, setCustSearchFocused] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const [formErrors, setFormErrors] = useState<{ name?: string; cust?: string }>({});
    const custSearchContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (custSearchFocused && custSearchContainerRef.current) {
            const rect = custSearchContainerRef.current.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                zIndex: 9999
            });
        }
    }, [custSearchFocused, newProjCustSearch, customers]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (custSearchContainerRef.current && !custSearchContainerRef.current.contains(event.target as Node)) {
                setCustSearchFocused(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

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

    // Active project proposals pipeline: projects where latest version is NOT Rejected and NOT converted to SO
    const activeProjects = React.useMemo(() => {
        return Object.entries(projectGroups)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
            .filter(([_, group]) => group.latest.status !== "Rejected" && group.latest.status !== "Converted to SO")
            .map(([name, group]) => ({ projectName: name, ...group }));
    }, [projectGroups]);

    // Rejected projects list
    const rejectedProjects = React.useMemo(() => {
        return Object.entries(projectGroups)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
            .filter(([_, group]) => group.latest.status === "Rejected")
            .map(([name, group]) => ({ projectName: name, ...group }));
    }, [projectGroups]);

    // Filters based on search query
    const filteredActiveProjects = React.useMemo(() => {
        if (!listSearchQuery.trim()) return activeProjects;
        const query = listSearchQuery.toLowerCase().trim();
        return activeProjects.filter(p => {
            const matchProjectName = p.projectName.toLowerCase().includes(query);
            const matchQuoteNo = p.latest.quote_number.toLowerCase().includes(query);
            const customerName = p.latest.customer_id && typeof p.latest.customer_id === "object"
                ? (p.latest.customer_id as Customer).customer_name
                : "";
            const matchCustomer = customerName.toLowerCase().includes(query);
            return matchProjectName || matchQuoteNo || matchCustomer;
        });
    }, [activeProjects, listSearchQuery]);

    const filteredRejectedProjects = React.useMemo(() => {
        if (!listSearchQuery.trim()) return rejectedProjects;
        const query = listSearchQuery.toLowerCase().trim();
        return rejectedProjects.filter(p => {
            const matchProjectName = p.projectName.toLowerCase().includes(query);
            const matchQuoteNo = p.latest.quote_number.toLowerCase().includes(query);
            const customerName = p.latest.customer_id && typeof p.latest.customer_id === "object"
                ? (p.latest.customer_id as Customer).customer_name
                : "";
            const matchCustomer = customerName.toLowerCase().includes(query);
            return matchProjectName || matchQuoteNo || matchCustomer;
        });
    }, [rejectedProjects, listSearchQuery]);

    const filteredSelectorProjects = React.useMemo(() => {
        if (!projectSearch.trim()) return allProjects;
        const query = projectSearch.toLowerCase().trim();
        return allProjects.filter(p => 
            p.projectName.toLowerCase().includes(query) || 
            p.customerName.toLowerCase().includes(query)
        );
    }, [allProjects, projectSearch]);

    const filteredAllQuotes = React.useMemo(() => {
        if (!listSearchQuery.trim()) return quotes;
        const query = listSearchQuery.toLowerCase().trim();
        return quotes.filter(q => {
            const projObj = q.project_id && typeof q.project_id === "object" ? q.project_id as Project : null;
            const matchProjectName = (projObj?.project_name || "").toLowerCase().includes(query);
            const matchQuoteNo = q.quote_number.toLowerCase().includes(query);
            const customerName = q.customer_id && typeof q.customer_id === "object"
                ? (q.customer_id as Customer).customer_name
                : "";
            const matchCustomer = customerName.toLowerCase().includes(query);
            return matchProjectName || matchQuoteNo || matchCustomer;
        });
    }, [quotes, listSearchQuery]);

    // Paginated slices
    const paginatedActiveProjects = React.useMemo(() => {
        const start = (listPage - 1) * listItemsPerPage;
        return filteredActiveProjects.slice(start, start + listItemsPerPage);
    }, [filteredActiveProjects, listPage, listItemsPerPage]);

    const paginatedAllQuotes = React.useMemo(() => {
        const start = (listPage - 1) * listItemsPerPage;
        return filteredAllQuotes.slice(start, start + listItemsPerPage);
    }, [filteredAllQuotes, listPage, listItemsPerPage]);

    const paginatedRejectedProjects = React.useMemo(() => {
        const start = (listPage - 1) * listItemsPerPage;
        return filteredRejectedProjects.slice(start, start + listItemsPerPage);
    }, [filteredRejectedProjects, listPage, listItemsPerPage]);

    const activeTotalPages = Math.ceil(filteredActiveProjects.length / listItemsPerPage) || 1;
    const allQuotesTotalPages = Math.ceil(filteredAllQuotes.length / listItemsPerPage) || 1;
    const rejectedTotalPages = Math.ceil(filteredRejectedProjects.length / listItemsPerPage) || 1;

    const currentTotalPagesCount = subTab === "pipeline" 
        ? activeTotalPages 
        : subTab === "sheets" 
        ? allQuotesTotalPages 
        : rejectedTotalPages;

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
            return tA - tB;
        });
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
                        onClick={() => setProjectSelectorOpen(true)}
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

            {/* Sub-navigation tabs and search bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex border-b bg-muted/10 shrink-0 rounded-xl overflow-hidden border w-full max-w-lg">
                    <button
                        onClick={() => setSubTab("pipeline")}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all -mb-[1px] ${
                            subTab === "pipeline"
                                ? "border-primary text-primary bg-background"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        }`}
                    >
                        <Folder className="h-4 w-4" /> Active Projects ({activeProjects.length})
                    </button>
                    <button
                        onClick={() => setSubTab("sheets")}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all -mb-[1px] ${
                            subTab === "sheets"
                                ? "border-primary text-primary bg-background"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        }`}
                    >
                        <FileText className="h-4 w-4" /> All Quotation Sheets ({quotes.length})
                    </button>
                    <button
                        onClick={() => setSubTab("rejected")}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all -mb-[1px] ${
                            subTab === "rejected"
                                ? "border-primary text-primary bg-background"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        }`}
                    >
                        <ShieldAlert className="h-4 w-4" /> Rejected Projects ({rejectedProjects.length})
                    </button>
                </div>

                <div className="relative w-full max-w-xs shrink-0">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search project, quote, customer..."
                        className="pl-9 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-semibold"
                        value={listSearchQuery}
                        onChange={(e) => setListSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {loadingQuotes ? (
                <div className="flex flex-col items-center justify-center p-20 gap-2 text-muted-foreground">
                    <span className="text-xs">Loading quotations...</span>
                </div>
            ) : (
                <div className="overflow-hidden border rounded-xl bg-card shadow-sm">
                    {subTab === "pipeline" && (
                        filteredActiveProjects.length === 0 ? (
                            <div className="text-center p-20 max-w-md mx-auto">
                                <Folder className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                                <h4 className="text-sm font-bold text-foreground mb-1">No Active Project Proposals</h4>
                                <p className="text-xs text-muted-foreground">All draft quotes are approved (SO created) or rejected.</p>
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
                                        {paginatedActiveProjects.map(proj => {
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
                                                    <td className="p-3 font-bold text-primary group-hover:text-primary/80 transition-colors">{proj.projectName}</td>
                                                    <td className="p-3 font-medium text-foreground">{custName}</td>
                                                    <td className="p-3 font-mono text-muted-foreground font-bold">{q.quote_number}</td>
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
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                                            {q.status || "Draft Proposal"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}

                    {subTab === "rejected" && (
                        filteredRejectedProjects.length === 0 ? (
                            <div className="text-center p-20 max-w-md mx-auto">
                                <ShieldAlert className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                                <h4 className="text-sm font-bold text-foreground mb-1">No Rejected Projects</h4>
                                <p className="text-xs text-muted-foreground">Proposals you mark as Rejected will accumulate in this archival registry.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase">Project Name</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase">Customer</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase">Last Quote Version</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase text-right">Selling Total</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase text-center">Revisions</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase">Date Updated</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {paginatedRejectedProjects.map(proj => {
                                            const q = proj.latest;
                                            const custName = (q.customer_id && typeof q.customer_id === "object") 
                                                ? `${(q.customer_id as Customer).customer_name} (${(q.customer_id as Customer).customer_code})`
                                                : "Customer Deleted";
                                            const sellingPrice = Number(q.total_selling_price || 0);

                                            return (
                                                <tr 
                                                    key={proj.projectName} 
                                                    onClick={() => viewQuoteDetails(proj.latest)}
                                                    className="hover:bg-muted/50 transition-colors cursor-pointer group"
                                                >
                                                    <td className="p-3 font-bold text-destructive group-hover:text-destructive/80 transition-colors">{proj.projectName}</td>
                                                    <td className="p-3 font-medium text-foreground">{custName}</td>
                                                    <td className="p-3 font-mono text-muted-foreground font-semibold">{q.quote_number}</td>
                                                    <td className="p-3 text-right text-muted-foreground font-semibold">₱{sellingPrice.toFixed(2)}</td>
                                                    <td className="p-3 text-center">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleViewSkuHistory(proj.projectName, proj.history);
                                                            }}
                                                            className="hover:underline text-primary font-bold inline-flex items-center gap-1 text-xs"
                                                            title="View SKU Revisions History"
                                                        >
                                                            <Clock className="h-3 w-3" />
                                                            {proj.history.length} sheet(s)
                                                        </button>
                                                    </td>
                                                    <td className="p-3 text-muted-foreground">{q.quote_date ? new Date(q.quote_date).toLocaleDateString() : "—"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}

                    {subTab === "sheets" && (
                        filteredAllQuotes.length === 0 ? (
                            <div className="text-center p-20 max-w-md mx-auto">
                                <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                                <h4 className="text-sm font-bold text-foreground mb-1">No Quotation Sheets Found</h4>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase">Quote Number</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase">Project Name</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase">Customer</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase text-right">Production Cost</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase text-right">Agreed Price</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase text-right">Estimated GP</th>
                                            <th className="p-3 font-semibold text-muted-foreground uppercase">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {paginatedAllQuotes.map(q => {
                                            const custName = (q.customer_id && typeof q.customer_id === "object") 
                                                ? `${(q.customer_id as Customer).customer_name} (${(q.customer_id as Customer).customer_code})`
                                                : "Customer Deleted";
                                            const simulatedCost = Number(q.total_simulated_cost || 0);
                                            const sellingPrice = Number(q.total_selling_price || 0);
                                            const gp = sellingPrice - simulatedCost;
                                            const margin = sellingPrice > 0 ? (gp / sellingPrice) * 100 : 0;
                                            
                                            const projObj = q.project_id && typeof q.project_id === "object" ? q.project_id as Project : null;
                                            const dispProjName = projObj?.project_name || "—";

                                            return (
                                                <tr 
                                                    key={q.id} 
                                                    onClick={() => viewQuoteDetails(q)}
                                                    className="hover:bg-muted/50 transition-colors cursor-pointer group"
                                                >
                                                    <td className="p-3 font-bold text-foreground group-hover:text-primary transition-colors">{q.quote_number}</td>
                                                    <td className="p-3 font-semibold text-primary">{dispProjName}</td>
                                                    <td className="p-3 font-medium text-foreground">{custName}</td>
                                                    <td className="p-3 text-right text-muted-foreground font-semibold">₱{simulatedCost.toFixed(2)}</td>
                                                    <td className="p-3 text-right font-bold text-foreground">₱{sellingPrice.toFixed(2)}</td>
                                                    <td className={`p-3 text-right font-extrabold ${gp >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                                        ₱{gp.toFixed(2)} ({margin.toFixed(1)}%)
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                            q.status === "Converted to SO"
                                                                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                                                : q.status === "Rejected"
                                                                ? "bg-destructive/10 text-destructive border border-destructive/20"
                                                                : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                                        }`}>
                                                            {q.status || "Draft"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
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
                    <div className="bg-card border rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/10">
                            <div>
                                <h3 className="text-base font-bold text-foreground">Project SKU Comparative Pricing Sheet (Excel View)</h3>
                                <p className="text-xs text-muted-foreground">Project Name: <strong className="text-foreground">{historyProjectName}</strong> | Tracked over historical revision periods</p>
                            </div>
                            <button
                                onClick={() => setHistoryModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground text-xs font-semibold rounded-lg border px-3 py-1.5 hover:bg-muted"
                            >
                                Close Grid
                            </button>
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
                                                    <th key={q.id} colSpan={2} className="p-2 font-bold text-center border-r border-b font-mono tracking-wider text-[10px]">
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
                                                        <td className={`p-2 text-right font-extrabold border-r font-mono bg-primary/5 ${
                                                            priceDiff > 0 ? "text-emerald-600" : priceDiff < 0 ? "text-destructive" : "text-muted-foreground"
                                                        }`}>
                                                            {priceDiff > 0 ? "+" : ""}{priceDiff.toFixed(2)}
                                                        </td>
                                                        {/* Cost delta */}
                                                        <td className={`p-2 text-right font-extrabold font-mono bg-primary/5 ${
                                                            costDiff > 0 ? "text-amber-600" : costDiff < 0 ? "text-emerald-600" : "text-muted-foreground"
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

            {/* Modal: Select or Register Project Portfolio first */}
            {projectSelectorOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-card border rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/10">
                            <div>
                                <h3 className="text-base font-bold text-foreground">Select Project Portfolio</h3>
                                <p className="text-xs text-muted-foreground">Select a registered project or register a new one to start creating quotes.</p>
                            </div>
                            <button
                                onClick={() => setProjectSelectorOpen(false)}
                                className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Tabs: Select Existing vs Register New */}
                        <div className="flex border-b text-xs font-bold bg-muted/5">
                            <button
                                onClick={() => setSelectorTab("select")}
                                className={`flex-1 py-3 text-center border-b-2 transition-all ${
                                    selectorTab === "select"
                                        ? "border-primary text-primary bg-background"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/10"
                                }`}
                            >
                                Choose Existing Project ({filteredSelectorProjects.length})
                            </button>
                            <button
                                onClick={() => setSelectorTab("register")}
                                className={`flex-1 py-3 text-center border-b-2 transition-all ${
                                    selectorTab === "register"
                                        ? "border-primary text-primary bg-background"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/10"
                                }`}
                            >
                                ＋ Register New Project
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
                            {selectorTab === "select" ? (
                                <div className="space-y-4">
                                    <div className="space-y-3">
                                        <div className="sticky top-0 bg-card z-10 pb-2 flex items-center justify-between gap-3 pt-1">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase block whitespace-nowrap">Select Portfolio</label>
                                            <input
                                                type="text"
                                                placeholder="Search by project or customer..."
                                                value={projectSearch}
                                                onChange={e => {
                                                    setProjectSearch(e.target.value);
                                                    setProjectDisplayLimit(10);
                                                }}
                                                className="w-full rounded border border-slate-200 dark:border-slate-800 bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary font-semibold"
                                            />
                                        </div>
                                        {filteredSelectorProjects.length === 0 ? (
                                            <div className="text-center py-8">
                                                <Folder className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                                                <p className="text-xs text-muted-foreground font-semibold">
                                                    {projectSearch.trim() ? "No projects found matching your search." : "No registered projects yet."}
                                                </p>
                                                {!projectSearch.trim() && (
                                                    <button
                                                        onClick={() => setSelectorTab("register")}
                                                        className="mt-3 text-xs text-primary font-bold hover:underline"
                                                    >
                                                        Register a new project now
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                                                {filteredSelectorProjects.slice(0, projectDisplayLimit).map(proj => (
                                                    <button
                                                        key={proj.projectName}
                                                        onClick={() => {
                                                            startCreateQuoteForProject(proj.projectName, proj.customerId, proj.projectId);
                                                            setProjectSelectorOpen(false);
                                                        }}
                                                        className="w-full text-left p-3 border rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-between group cursor-pointer"
                                                    >
                                                        <div>
                                                            <span className="text-xs font-bold text-foreground block group-hover:text-primary transition-colors">{proj.projectName}</span>
                                                            <span className="text-[10px] text-muted-foreground block mt-0.5">{proj.customerName}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
                                                            <Clock className="h-3 w-3" /> {proj.quoteCount} quote(s)
                                                        </div>
                                                    </button>
                                                ))}
                                                {filteredSelectorProjects.length > projectDisplayLimit && (
                                                    <button
                                                        onClick={() => setProjectDisplayLimit(prev => prev + 10)}
                                                        className="w-full py-2 mt-2 text-xs font-bold text-primary hover:bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all cursor-pointer"
                                                    >
                                                        Load More
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* New Project Name */}
                                    <div>
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                                            Project Portfolio Name <span className="text-destructive">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={newProjName}
                                            onChange={e => {
                                                setNewProjName(e.target.value);
                                                setFormErrors(prev => ({ ...prev, name: undefined }));
                                            }}
                                            placeholder="e.g. PROJECT VERTEX PH-2"
                                            aria-invalid={Boolean(formErrors.name)}
                                            className="w-full rounded border border-slate-200 dark:border-slate-800 bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary font-bold aria-invalid:border-destructive"
                                        />
                                        {formErrors.name && <p className="text-xs text-destructive mt-1">{formErrors.name}</p>}
                                    </div>

                                    {/* Customer Selection */}
                                    <div className="relative mt-2" ref={custSearchContainerRef}>
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                                            Customer / Client <span className="text-destructive">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Type to search customers..."
                                                value={newProjCustSearch}
                                                aria-invalid={Boolean(formErrors.cust)}
                                                onFocus={() => {
                                                    setCustSearchFocused(true);
                                                    if (customers.length === 0) handleSearchCustomers("");
                                                }}
                                                onChange={e => {
                                                    setCustSearchFocused(true);
                                                    handleSearchCustomers(e.target.value);
                                                    setNewProjCustSearch(e.target.value);
                                                    setFormErrors(prev => ({ ...prev, cust: undefined }));
                                                }}
                                                className="w-full rounded border border-slate-200 dark:border-slate-800 bg-background pl-3 pr-8 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary font-semibold aria-invalid:border-destructive"
                                            />
                                            {selectedCustId && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedCustId(null);
                                                        setSelectedCustName("");
                                                        setNewProjCustSearch("");
                                                    }}
                                                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            )}

                                            {custSearchFocused && !selectedCustId && (
                                                <div 
                                                    className="fixed border bg-card rounded-md shadow-lg divide-y overflow-hidden flex flex-col z-[60]"
                                                    style={dropdownStyle}
                                                >
                                                    <div className="overflow-y-auto max-h-[160px]">
                                                        {customers.slice(0, 10).map(c => (
                                                            <button
                                                                key={c.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedCustId(Number(c.id));
                                                                    setSelectedCustName(c.customer_name);
                                                                    setNewProjCustSearch(`${c.customer_name} (${c.customer_code})`);
                                                                    setCustSearchFocused(false);
                                                                    setFormErrors(prev => ({ ...prev, cust: undefined }));
                                                                }}
                                                                className="w-full text-left px-3 py-3 text-xs hover:bg-muted transition-colors font-semibold text-foreground block cursor-pointer"
                                                            >
                                                                {c.customer_name} ({c.customer_code})
                                                            </button>
                                                        ))}
                                                        {customers.length === 0 && (
                                                            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                                                No customers found.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action button */}
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            let valid = true;
                                            const errors: { name?: string; cust?: string } = {};
                                            const normalizedName = newProjName.trim();
                                            
                                            if (!normalizedName) {
                                                errors.name = "Project name is required";
                                                valid = false;
                                            } else {
                                                // Uniqueness check
                                                const isDuplicate = allProjects.some(
                                                    p => p.projectName.toLowerCase() === normalizedName.toLowerCase()
                                                );
                                                if (isDuplicate) {
                                                    errors.name = "A project with this name already exists.";
                                                    valid = false;
                                                }
                                            }
                                            
                                            if (!selectedCustId) {
                                                errors.cust = "Customer selection is required";
                                                valid = false;
                                            }

                                            setFormErrors(errors);
                                            if (!valid) return;

                                            try {
                                                const newProj = await registerNewProject(normalizedName, selectedCustId!, selectedCustName);
                                                if (newProj && newProj.id) {
                                                    startCreateQuoteForProject(newProj.project_name, selectedCustId!, newProj.id);
                                                    setProjectSelectorOpen(false);
                                                    // Reset inputs
                                                    setNewProjName("");
                                                    setSelectedCustId(null);
                                                    setSelectedCustName("");
                                                    setNewProjCustSearch("");
                                                }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            } catch (e: any) {
                                                toast.error(e.message || "Failed to register project");
                                            }
                                        }}
                                        className="w-full rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-md mt-2 cursor-pointer text-center"
                                    >
                                        Register Portfolio & Create Quote
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
