import React, { useState } from "react";
import { Supplier, RawMaterial, LinkedProduct } from "../types";
import { motion, AnimatePresence } from "framer-motion";
import { Link, Search, Plus, Trash2, X, AlertCircle, Loader2, CheckCircle2, Globe } from "lucide-react";

export interface SupplierCatalogMatrixModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier | null;
    rawMaterials: RawMaterial[];
    linkedProducts: LinkedProduct[];
    loadingLinkedProducts: boolean;
    onLinkProducts: (productIds: string[]) => Promise<void>;
    onUnlinkProduct: (linkId: number) => Promise<void>;
    unlinkingLinkId: number | null;
}

export default function SupplierCatalogMatrixModal({
    isOpen,
    onClose,
    supplier,
    rawMaterials = [],
    linkedProducts = [],
    loadingLinkedProducts,
    onLinkProducts,
    onUnlinkProduct,
    unlinkingLinkId
}: SupplierCatalogMatrixModalProps) {
    const [selectedProductIdsToLink, setSelectedProductIdsToLink] = useState<string[]>([]);
    const [linkProductSearch, setLinkProductSearch] = useState("");
    const [linkedFilterSearch, setLinkedFilterSearch] = useState("");
    const [linkingLoading, setLinkingLoading] = useState(false);

    if (!supplier) return null;

    const handleLinkMultiple = async () => {
        if (selectedProductIdsToLink.length === 0) return;
        setLinkingLoading(true);
        try {
            await onLinkProducts(selectedProductIdsToLink);
            setSelectedProductIdsToLink([]);
            setLinkProductSearch("");
        } catch (e) {
            console.error(e);
        } finally {
            setLinkingLoading(false);
        }
    };

    const availableRM = rawMaterials.filter(rm => {
        const isLinked = linkedProducts.some(lp => {
            const lpProdId = typeof lp.product_id === "object" ? (lp.product_id as Record<string, unknown>)?.product_id || (lp.product_id as Record<string, unknown>)?.id : lp.product_id;
            return Number(lpProdId) === Number(rm.product_id);
        });
        if (isLinked) return false;
        const query = linkProductSearch.toLowerCase().trim();
        if (!query) return true;
        return rm.product_name.toLowerCase().includes(query) || (rm.product_code && rm.product_code.toLowerCase().includes(query));
    });

    const allSelected = availableRM.length > 0 && availableRM.every(rm => selectedProductIdsToLink.includes(String(rm.product_id)));

    const toggleSelectAll = () => {
        if (allSelected) {
            const availIds = new Set(availableRM.map(rm => String(rm.product_id)));
            setSelectedProductIdsToLink(prev => prev.filter(id => !availIds.has(id)));
        } else {
            const availIds = availableRM.map(rm => String(rm.product_id));
            setSelectedProductIdsToLink(prev => Array.from(new Set([...prev, ...availIds])));
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 15 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 15 }}
                        transition={{ type: "spring", duration: 0.3 }}
                        className="bg-card text-foreground w-full max-w-3xl border rounded-2xl shadow-xl p-6 space-y-5"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <Link className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-foreground">Supplier Raw Material Catalog Matrix</h3>
                                    <p className="text-[11px] text-muted-foreground">{supplier.supplier_name}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-lg hover:bg-muted"
                            >
                                <X className="h-4.5 w-4.5" />
                            </button>
                        </div>

                        {/* Associate New Products Section */}
                        <div className="bg-muted/20 p-4 rounded-2xl border border-primary/20 space-y-3 shadow-xs">
                            <div className="flex items-center justify-between border-b pb-2.5">
                                <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-xs font-extrabold text-foreground">
                                        Select Catalog Items to Associate
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedProductIdsToLink.length > 0 && (
                                        <span className="text-[10px] bg-primary text-primary-foreground font-bold px-2.5 py-0.5 rounded-full shadow-xs">
                                            {selectedProductIdsToLink.length} Selected
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={toggleSelectAll}
                                        disabled={availableRM.length === 0}
                                        className="text-[10px] font-bold text-muted-foreground hover:text-foreground border px-2.5 py-1 rounded-xl bg-background hover:bg-muted/50 disabled:opacity-50 transition-all cursor-pointer"
                                    >
                                        {allSelected ? "Deselect All" : "Select All Unlinked"}
                                    </button>
                                </div>
                            </div>

                            {/* Search unlinked items */}
                            <div className="relative">
                                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search unlinked raw materials by code or name..."
                                    value={linkProductSearch}
                                    onChange={e => setLinkProductSearch(e.target.value)}
                                    className="w-full rounded-xl border bg-background pl-9 pr-8 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                />
                                {linkProductSearch && (
                                    <button
                                        onClick={() => setLinkProductSearch("")}
                                        className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Available Products Grid */}
                            <div className="border rounded-xl bg-background p-2 max-h-[180px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {availableRM.length === 0 ? (
                                    <div className="col-span-2 text-center py-6 text-xs text-muted-foreground italic flex flex-col items-center justify-center gap-1">
                                        <AlertCircle className="h-4 w-4 text-muted-foreground/40" />
                                        <span>No unlinked raw materials match your search</span>
                                    </div>
                                ) : (
                                    availableRM.map(rm => {
                                        const isChecked = selectedProductIdsToLink.includes(String(rm.product_id));
                                        const uomName = rm.unit_of_measurement?.unit_shortcut || rm.unit_of_measurement?.unit_name;
                                        return (
                                            <div
                                                key={rm.product_id}
                                                onClick={() => {
                                                    const valStr = String(rm.product_id);
                                                    if (isChecked) {
                                                        setSelectedProductIdsToLink(prev => prev.filter(id => id !== valStr));
                                                    } else {
                                                        setSelectedProductIdsToLink(prev => [...prev, valStr]);
                                                    }
                                                }}
                                                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                                                    isChecked
                                                        ? "border-primary bg-primary/5 shadow-xs"
                                                        : "border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/30"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {}}
                                                        className="rounded text-primary focus:ring-0 h-4 w-4 shrink-0"
                                                    />
                                                    <div className="min-w-0 space-y-0.5">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {rm.product_code && (
                                                                <span className="font-mono text-[9px] font-bold bg-muted px-1.5 py-0.5 rounded text-foreground border shrink-0">
                                                                    {rm.product_code}
                                                                </span>
                                                            )}
                                                            <span className="text-xs font-bold text-foreground truncate">
                                                                {rm.product_name}
                                                            </span>
                                                        </div>
                                                        {uomName && (
                                                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                <span className="bg-primary/5 text-primary px-1.5 rounded font-semibold border border-primary/10">
                                                                    {uomName}
                                                                </span>
                                                                {rm.cost_per_unit > 0 && (
                                                                    <span className="font-mono text-[10px]">
                                                                        ₱{Number(rm.cost_per_unit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Action bar */}
                            <div className="flex items-center justify-between pt-1 border-t">
                                <span className="text-[11px] font-medium text-muted-foreground">
                                    {selectedProductIdsToLink.length} material(s) selected
                                </span>
                                <button
                                    onClick={handleLinkMultiple}
                                    disabled={selectedProductIdsToLink.length === 0 || linkingLoading}
                                    className="bg-primary text-primary-foreground px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-primary/95 disabled:opacity-50 transition-all cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                                >
                                    {linkingLoading ? (
                                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Linking...</>
                                    ) : (
                                        <><Plus className="h-3.5 w-3.5" /> Link Selected Items ({selectedProductIdsToLink.length})</>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Currently Linked Products Matrix */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    Currently Linked Materials ({linkedProducts.length})
                                </h4>
                                {linkedProducts.length > 3 && (
                                    <div className="relative w-48">
                                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Filter linked..."
                                            value={linkedFilterSearch}
                                            onChange={e => setLinkedFilterSearch(e.target.value)}
                                            className="w-full rounded-lg border bg-background pl-8 pr-6 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                )}
                            </div>

                            {loadingLinkedProducts ? (
                                <div className="text-center text-xs text-muted-foreground py-6 flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    <span>Loading associated products...</span>
                                </div>
                            ) : linkedProducts.length === 0 ? (
                                <div className="text-center p-6 border border-dashed rounded-xl bg-muted/5 text-xs text-muted-foreground">
                                    No raw materials currently associated with this vendor.
                                </div>
                            ) : (
                                <div className="grid gap-2.5 sm:grid-cols-2 max-h-[220px] overflow-y-auto pr-1">
                                    {linkedProducts.filter(lp => {
                                        if (!linkedFilterSearch.trim()) return true;
                                        const q = linkedFilterSearch.toLowerCase().trim();
                                        const code = lp.product_id?.product_code || "";
                                        const name = lp.product_id?.product_name || "";
                                        return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
                                    }).map((lp: LinkedProduct) => {
                                        const uom = lp.product_id?.unit_of_measurement?.unit_shortcut || lp.product_id?.unit_of_measurement?.unit_name;
                                        return (
                                            <div
                                                key={lp.id}
                                                className="border border-border/80 hover:border-primary/40 rounded-xl p-3 flex items-center justify-between bg-card hover:bg-muted/10 transition-all shadow-xs group border-l-4 border-l-primary/60"
                                            >
                                                <div className="space-y-1 min-w-0 pr-2">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {lp.product_id?.product_code && (
                                                            <span className="font-mono text-[9px] text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                                                                {lp.product_id.product_code}
                                                            </span>
                                                        )}
                                                        <span className="text-xs font-bold text-foreground truncate block">
                                                            {lp.product_id?.product_name || "Unknown Product"}
                                                        </span>
                                                        {uom && (
                                                            <span className="text-[10px] text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded border italic">
                                                                {uom}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => onUnlinkProduct(lp.id)}
                                                    disabled={unlinkingLinkId === lp.id}
                                                    className="text-muted-foreground hover:text-red-600 p-1.5 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer shrink-0"
                                                    title="Unlink Product"
                                                >
                                                    {unlinkingLinkId === lp.id ? <Loader2 className="h-4 w-4 animate-spin text-red-500" /> : <Trash2 className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
