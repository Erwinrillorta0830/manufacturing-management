import React from "react";
import { Search, Plus } from "lucide-react";
import { CatalogProduct, SelectedQuoteProduct } from "../types";

interface ProductCatalogTableProps {
    loadingProducts: boolean;
    searchQuery: string;
    setSearchQuery: (val: string) => void;
    paginatedCatalog: CatalogProduct[];
    filteredCatalog: CatalogProduct[];
    addProductToQuote: (prod: CatalogProduct) => void;
    currentPage: number;
    setCurrentPage: (updater: number | ((prev: number) => number)) => void;
    totalPages: number;
    selectedProductsList: SelectedQuoteProduct[];
}

export function ProductCatalogTable({
    loadingProducts,
    searchQuery,
    setSearchQuery,
    paginatedCatalog,
    filteredCatalog,
    addProductToQuote,
    currentPage,
    setCurrentPage,
    totalPages,
    selectedProductsList
}: ProductCatalogTableProps) {
    const itemsWithHeaders = paginatedCatalog.map((prod, idx) => {
        const currentCategory = prod.parent_id?.product_name || prod.product_name;
        const prevProd = idx > 0 ? paginatedCatalog[idx - 1] : null;
        const prevCategory = prevProd ? (prevProd.parent_id?.product_name || prevProd.product_name) : "";
        const showHeader = currentCategory !== prevCategory;
        return { prod, showHeader, currentCategory };
    });

    return (
        <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-5 shadow-xl">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-slate-200 dark:border-slate-800/85 pb-2.5 flex justify-between items-center">
                <span className="flex items-center gap-1.5 font-extrabold text-foreground">
                    <Search className="h-4 w-4 text-violet-500" />
                    Finished Goods Catalog
                </span>
                {loadingProducts && <span className="text-[10px] text-violet-500 animate-pulse font-mono font-semibold bg-violet-500/10 px-2 py-0.5 rounded-full">Syncing...</span>}
            </h4>

            <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Search catalog products..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 pl-9 pr-3.5 py-2 text-xs bg-background text-foreground placeholder:text-muted-foreground/50 outline-none transition-all focus:border-violet-500/80 focus:ring-1 focus:ring-violet-500/30 font-semibold"
                />
            </div>

            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
                {itemsWithHeaders.map(({ prod, showHeader, currentCategory }) => {
                    const cost = prod.cost_per_unit || 0;
                    const isAlreadyAdded = selectedProductsList.some(item => Number(item.product?.product_id) === Number(prod.product_id));

                    return (
                        <React.Fragment key={prod.product_id}>
                            {showHeader && (
                                <div className="text-[9px] font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 border border-violet-500/15 px-2.5 py-0.5 rounded-full mt-3 first:mt-0 w-max tracking-wide">
                                    👪 {currentCategory}
                                </div>
                            )}
                            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/15 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 shadow-sm hover:border-violet-500/40 hover:bg-slate-100 dark:hover:bg-slate-900/40 transition-all duration-200">
                                <div className="min-w-0 pr-2">
                                    <span className="text-xs font-bold text-foreground truncate block">{prod.product_name}</span>
                                    <span className="text-[10px] text-muted-foreground block mt-0.5 font-mono">
                                        {prod.product_code} • {prod.unit_of_measurement?.unit_shortcut || "PCS"} • <span className="text-violet-500 dark:text-violet-400 font-bold">{prod.has_cogs ? `₱${cost.toFixed(2)}` : "N/A"}</span>
                                    </span>
                                </div>
                                {isAlreadyAdded ? (
                                    <span className="shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 rounded-xl leading-normal select-none">
                                        ✓ Added
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => addProductToQuote(prod)}
                                        className="shrink-0 p-2 bg-background border border-slate-200 dark:border-slate-850 rounded-lg text-muted-foreground hover:bg-violet-600 hover:text-white hover:border-violet-500 transition-all duration-200 shadow-xs cursor-pointer"
                                        title="Add to Quote Draft"
                                    >
                                        <Plus className="h-3.5 w-3.5 animate-pulse" />
                                    </button>
                                )}
                            </div>
                        </React.Fragment>
                    );
                })}
                {filteredCatalog.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-10 bg-slate-100/50 dark:bg-slate-900/15 rounded-xl border border-slate-200 dark:border-slate-800 border-dashed">
                        No matching goods found.
                    </div>
                )}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800/80 pt-2.5 mt-1 select-none">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(Number(prev) - 1, 1))}
                        className="px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-semibold bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-background transition-colors cursor-pointer"
                    >
                        Prev
                    </button>
                    <span className="text-[10px] text-muted-foreground font-medium">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(Number(prev) + 1, totalPages))}
                        className="px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-semibold bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-background transition-colors cursor-pointer"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
