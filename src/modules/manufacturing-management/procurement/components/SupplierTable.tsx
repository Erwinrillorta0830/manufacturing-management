import React from "react";
import { Supplier } from "../types";
import { Search, Plus, MapPin, Globe, Building2, X, Award } from "lucide-react";
import { isSupplierActive, isSupplierNonBuy, isSupplierForeign } from "../services/supplier.service";

export type SupplierStatusFilter = "active" | "inactive" | "all";
export type SupplierForeignFilter = "all" | "local" | "foreign";

export interface SupplierTableProps {
    suppliers: Supplier[];
    filteredSuppliers: Supplier[];
    selectedSupplierId: number | null;
    onSelectSupplier: (id: number) => void;
    search: string;
    onSearchChange: (search: string) => void;
    statusFilter: SupplierStatusFilter;
    onStatusFilterChange: (filter: SupplierStatusFilter) => void;
    foreignFilter: SupplierForeignFilter;
    onForeignFilterChange: (filter: SupplierForeignFilter) => void;
    onOpenRegisterModal: () => void;
    onOpenEvaluationModal?: (supplier: Supplier) => void;
}

export default function SupplierTable({
    suppliers,
    filteredSuppliers,
    selectedSupplierId,
    onSelectSupplier,
    search,
    onSearchChange,
    statusFilter,
    onStatusFilterChange,
    foreignFilter,
    onForeignFilterChange,
    onOpenRegisterModal,
    onOpenEvaluationModal
}: SupplierTableProps) {
    const activeSupplierId = selectedSupplierId ?? filteredSuppliers[0]?.id ?? null;

    return (
        <div className="w-full lg:w-2/5 flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm">
            <div className="p-4 border-b space-y-3 shrink-0 bg-muted/20">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                        <Building2 className="h-4 w-4 text-primary" />
                        Suppliers Directory ({filteredSuppliers.length})
                    </h3>
                    <button
                        onClick={onOpenRegisterModal}
                        className="inline-flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-2.5 py-1.5 rounded-lg text-xs transition-all shadow-sm cursor-pointer"
                    >
                        <Plus className="h-3.5 w-3.5" /> Register
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 flex-1" role="group" aria-label="Supplier status filter">
                        {(["active", "inactive", "all"] as SupplierStatusFilter[]).map(filter => {
                            const count = suppliers.filter(s =>
                                filter === "all" || (filter === "active" ? isSupplierActive(s) : !isSupplierActive(s))
                            ).length;
                            return (
                                <button
                                    key={filter}
                                    type="button"
                                    onClick={() => onStatusFilterChange(filter)}
                                    className={`rounded-md px-2 py-1 text-[10px] font-bold capitalize transition-colors cursor-pointer ${
                                        statusFilter === filter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {filter} ({count})
                                </button>
                            );
                        })}
                    </div>
                    <select
                        value={foreignFilter}
                        onChange={e => onForeignFilterChange(e.target.value as SupplierForeignFilter)}
                        className="rounded-lg border bg-background px-2 py-1 text-[10px] font-bold text-foreground outline-none focus:ring-1 focus:ring-primary h-[31px]"
                        aria-label="Filter supplier classification"
                    >
                        <option value="all">All Origins</option>
                        <option value="local">Local (PHP)</option>
                        <option value="foreign">Foreign</option>
                    </select>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search suppliers name, TIN, code..."
                        value={search}
                        onChange={e => onSearchChange(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 border rounded-lg text-xs bg-background outline-none focus:ring-1 focus:ring-primary font-medium"
                    />
                    {search && (
                        <button
                            onClick={() => onSearchChange("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors hover:bg-muted rounded cursor-pointer"
                            title="Clear Search"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y">
                {filteredSuppliers.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                        No suppliers found. Click &quot;Register&quot; to add one.
                    </div>
                ) : (
                    filteredSuppliers.map(s => {
                        const isForeign = isSupplierForeign(s);
                        const isSelected = activeSupplierId === s.id;
                        return (
                            <div
                                key={s.id}
                                onClick={() => onSelectSupplier(s.id)}
                                className={`w-full text-left p-4 hover:bg-muted/40 transition-all flex flex-col gap-1.5 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] cursor-pointer ${
                                    isSelected ? "bg-primary/5 border-l-2 border-primary" : ""
                                } ${!isSupplierActive(s) ? "opacity-60" : ""}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="font-semibold text-xs text-foreground truncate">{s.supplier_name}</span>
                                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                        {isSupplierNonBuy(s) && (
                                            <span className="bg-amber-500/15 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide">
                                                Non-Buy
                                            </span>
                                        )}
                                        {!isSupplierActive(s) && (
                                            <span className="bg-red-500/15 text-red-600 border border-red-500/20 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide">
                                                Inactive
                                            </span>
                                        )}
                                        {isForeign ? (
                                            <span className="bg-amber-500/15 text-amber-700 border border-amber-500/30 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide flex items-center gap-0.5">
                                                <Globe className="h-2.5 w-2.5" /> FOREIGN IMPORT
                                            </span>
                                        ) : (
                                            <span className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide flex items-center gap-0.5">
                                                <Building2 className="h-2.5 w-2.5" /> LOCAL
                                            </span>
                                        )}
                                        {s.supplier_shortcut && (
                                            <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                {s.supplier_shortcut}
                                            </span>
                                        )}
                                        {onOpenEvaluationModal && isSelected && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpenEvaluationModal(s);
                                                }}
                                                className="bg-primary/10 hover:bg-primary/20 text-primary p-1 rounded transition-colors"
                                                title="Evaluate Supplier Performance"
                                            >
                                                <Award className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span className="truncate flex items-center gap-1">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {s.city || "No Address"}, {s.country}
                                    </span>
                                    {s.tin_number && (
                                        <span className="font-mono text-[9px] bg-muted px-1 rounded">TIN: {s.tin_number}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
