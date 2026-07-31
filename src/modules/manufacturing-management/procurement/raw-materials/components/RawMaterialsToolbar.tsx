import React from "react";
import { Search, Plus, X, Info } from "lucide-react";
import { TypeFilter } from "../types/raw-materials.types";

interface RawMaterialsToolbarProps {
    search: string;
    setSearch: (v: string) => void;
    typeFilter: TypeFilter;
    setTypeFilter: (v: TypeFilter) => void;
    onOpenModal: () => void;
}

export function RawMaterialsToolbar({
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    onOpenModal
}: RawMaterialsToolbarProps) {
    return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 border p-4 rounded-xl">
                <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 flex-1">
                    <div className="relative flex-1 sm:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search ingredients, packaging, SKU codes..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 border rounded-lg text-xs bg-background outline-none focus:ring-1 focus:ring-primary font-medium"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors hover:bg-muted rounded cursor-pointer"
                                title="Clear Search"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </div>
                <button
                    onClick={onOpenModal}
                    className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold px-3.5 py-2.5 rounded-lg transition-all shadow-sm cursor-pointer hover:scale-[1.01] active:scale-[0.99] shrink-0"
                >
                    <Plus className="h-4 w-4" /> Register Item
                </button>
            </div>

            {/* Filter segments & Tooltip Note */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border px-4 py-3 rounded-xl">
                <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border text-[11px] font-bold">
                    <button
                        onClick={() => setTypeFilter("all")}
                        className={`px-3 py-1.5 rounded-md transition-all cursor-pointer border-none ${typeFilter === "all" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        All Items
                    </button>
                    <button
                        onClick={() => setTypeFilter("raw")}
                        className={`px-3 py-1.5 rounded-md transition-all cursor-pointer border-none ${typeFilter === "raw" ? "bg-background shadow-sm text-amber-600" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        Raw Materials
                    </button>
                    <button
                        onClick={() => setTypeFilter("pkg")}
                        className={`px-3 py-1.5 rounded-md transition-all cursor-pointer border-none ${typeFilter === "pkg" ? "bg-background shadow-sm text-purple-600" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        Packaging Items
                    </button>
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10">
                    <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>Keyword auto-detection classifies items by name tag (box, bottle, cap, sticker, packaging).</span>
                </div>
            </div>
        </div>
    );
}
