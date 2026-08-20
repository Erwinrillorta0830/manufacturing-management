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

    const filteredLinkedProducts = linkedProducts.filter(lp => {
        if (!linkedFilterSearch.trim()) return true;
        const q = linkedFilterSearch.toLowerCase().trim();
        const code = lp.product_id?.product_code || "";
        const name = lp.product_id?.product_name || "";
        return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });

    const allSelected = availableRM.length > 0 && availableRM.every(rm => selectedProductIdsToLink.includes(String(rm.product_id)));

    const toggleProductSelection = (productId: number | string) => {
        const value = String(productId);
        setSelectedProductIdsToLink(prev => prev.includes(value) ? prev.filter(id => id !== value) : [...prev, value]);
    };

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

                            {/* Available Products Table */}
                            <div className="border rounded-xl bg-background max-h-[220px] overflow-auto">
                                <table className="w-full min-w-[600px] text-left">
                                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                                        <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                                            <th scope="col" className="w-12 px-3 py-2 font-bold">Select</th>
                                            <th scope="col" className="w-32 px-3 py-2 font-bold">Product Code</th>
                                            <th scope="col" className="px-3 py-2 font-bold">Catalog Item</th>
                                            <th scope="col" className="w-20 px-3 py-2 font-bold">UOM</th>
                                            <th scope="col" className="w-28 px-3 py-2 text-right font-bold">Unit Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/70">
                                        {availableRM.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="text-center py-6 text-xs text-muted-foreground italic">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <AlertCircle className="h-4 w-4 text-muted-foreground/40" />
                                                        <span>No unlinked raw materials match your search</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            availableRM.map(rm => {
                                                const isChecked = selectedProductIdsToLink.includes(String(rm.product_id));
                                                const uomName = rm.unit_of_measurement?.unit_shortcut || rm.unit_of_measurement?.unit_name;
                                                return (
                                                    <tr
                                                        key={rm.product_id}
                                                        onClick={() => toggleProductSelection(rm.product_id)}
                                                        aria-selected={isChecked}
                                                        className={`cursor-pointer align-middle text-xs transition-colors ${
                                                            isChecked ? "bg-primary/5" : "hover:bg-muted/40"
                                                        }`}
                                                    >
                                                        <td className="px-3 py-2">
                                                            <input
                                                                id={`catalog-product-${rm.product_id}`}
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => toggleProductSelection(rm.product_id)}
                                                                onClick={event => event.stopPropagation()}
                                                                aria-label={`Select ${rm.product_name}`}
                                                                className="rounded text-primary focus:ring-0 h-4 w-4"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 font-mono font-bold text-[10px] text-foreground break-all">
                                                            {rm.product_code || "—"}
                                                        </td>
                                                        <td className="px-3 py-2 font-bold text-foreground whitespace-normal break-words">
                                                            {rm.product_name}
                                                        </td>
                                                        <td className="px-3 py-2 text-[10px] font-semibold text-primary">
                                                            {uomName || "—"}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-mono text-[10px] text-foreground">
                                                            {rm.cost_per_unit > 0
                                                                ? `₱${Number(rm.cost_per_unit).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                                                                : "—"}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
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
                                <div className="border rounded-xl bg-background max-h-[220px] overflow-auto">
                                    <table className="w-full min-w-[520px] text-left">
                                        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                                            <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                                                <th scope="col" className="w-32 px-3 py-2 font-bold">Product Code</th>
                                                <th scope="col" className="px-3 py-2 font-bold">Catalog Item</th>
                                                <th scope="col" className="w-20 px-3 py-2 font-bold">UOM</th>
                                                <th scope="col" className="w-20 px-3 py-2 text-right font-bold">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/70">
                                            {filteredLinkedProducts.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="text-center py-6 text-xs text-muted-foreground italic">
                                                        No linked raw materials match your search.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredLinkedProducts.map((lp: LinkedProduct) => {
                                                    const uom = lp.product_id?.unit_of_measurement?.unit_shortcut || lp.product_id?.unit_of_measurement?.unit_name;
                                                    const productName = lp.product_id?.product_name || "Unknown Product";
                                                    return (
                                                        <tr key={lp.id} className="align-middle text-xs transition-colors hover:bg-muted/40">
                                                            <td className="px-3 py-2 font-mono font-bold text-[10px] text-primary break-all">
                                                                {lp.product_id?.product_code || "—"}
                                                            </td>
                                                            <td className="px-3 py-2 font-bold text-foreground whitespace-normal break-words">
                                                                {productName}
                                                            </td>
                                                            <td className="px-3 py-2 text-[10px] font-semibold text-muted-foreground">
                                                                {uom || "—"}
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                <button
                                                                    onClick={() => onUnlinkProduct(lp.id)}
                                                                    disabled={unlinkingLinkId === lp.id}
                                                                    className="text-muted-foreground hover:text-red-600 p-1.5 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer"
                                                                    title="Unlink Product"
                                                                    aria-label={`Unlink ${productName}`}
                                                                >
                                                                    {unlinkingLinkId === lp.id ? <Loader2 className="h-4 w-4 animate-spin text-red-500" /> : <Trash2 className="h-4 w-4" />}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
