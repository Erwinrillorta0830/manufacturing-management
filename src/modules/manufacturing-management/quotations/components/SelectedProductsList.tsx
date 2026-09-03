import React, { useState, useEffect } from "react";
import { Trash2, Coins, Percent, Plus } from "lucide-react";
import { SelectedQuoteProduct, CatalogProduct } from "../types";
import { CreatableSelect } from "../../finished-goods/components/CreatableSelect";

interface SelectedProductsListProps {
    selectedProductsList: SelectedQuoteProduct[];
    handleAgreedPriceChange: (lineIdOrProductId: number, val: number) => void;
    removeProductFromQuote: (lineIdOrProductId: number) => void;
    changeProductVersion: (lineIdOrProductId: number, versionId: number | null, versionName: string | null) => void;
    productTypes?: Record<string, unknown>[];
    allProducts?: CatalogProduct[];
    addEmptyRow?: () => void;
    updateRow?: (lineId: number, field: string, value: unknown) => void;
    handleRowProductSelect?: (lineId: number, prod: CatalogProduct | null) => void;
}

const formatUomLabel = (product: Record<string, unknown>): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return String((product as any).unit_of_measurement?.unit_shortcut || (product as any).unit_shortcut || "Unit");
};

export function SelectedProductsList({
    selectedProductsList,
    handleAgreedPriceChange,
    removeProductFromQuote,
    changeProductVersion,
    productTypes = [],
    allProducts = [],
    addEmptyRow,
    updateRow,
    handleRowProductSelect
}: SelectedProductsListProps) {
    const [cogsMap, setCogsMap] = useState<Record<string, number | null>>({});
    const [loadingCogs, setLoadingCogs] = useState<Record<string, boolean>>({});
    const [versionsMap, setVersionsMap] = useState<Record<number, { id: number; version_name: string; created_at?: string }[]>>({});
    const [loadingVersions, setLoadingVersions] = useState<Record<number, boolean>>({});

    // Fetch versions dynamically for selected parent products
    useEffect(() => {
        selectedProductsList.forEach(item => {
            const parentId = item.parent_product_id || item.product?.parent_product_id || item.product?.product_id;
            if (!parentId) return;
            
            if (versionsMap[parentId] !== undefined || loadingVersions[parentId]) return;

            setLoadingVersions(prev => ({ ...prev, [parentId]: true }));
            fetch(`/api/manufacturing/finished-goods/versions?productId=${parentId}&status=Active`)
                .then(res => res.ok ? res.json() : [])
                .then(data => {
                    const sorted = [...data].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
                        const timeA = a.created_at ? new Date(a.created_at as string).getTime() : 0;
                        const timeB = b.created_at ? new Date(b.created_at as string).getTime() : 0;
                        if (timeA !== timeB) return timeB - timeA;
                        return (b.id as number) - (a.id as number);
                    });
                    setVersionsMap(prev => ({ ...prev, [parentId]: sorted }));
                    
                    // Auto-default if product is already selected
                    if (item.product && sorted.length > 0 && !item.versionId && item.line_id) {
                        changeProductVersion(item.line_id, sorted[0].id, sorted[0].version_name);
                    }
                })
                .catch(e => console.error("Error fetching versions:", parentId, e))
                .finally(() => {
                    setLoadingVersions(prev => ({ ...prev, [parentId]: false }));
                });
        });
    }, [selectedProductsList, versionsMap, loadingVersions, changeProductVersion]);

    // Fetch cost for selected product + version cache key
    useEffect(() => {
        selectedProductsList.forEach(item => {
            if (!item.product) return;
            
            const pid = item.product.product_id;
            const parentId = item.parent_product_id || item.product.parent_product_id || pid;
            const vid = item.versionId;
            const cacheKey = `${pid}-${vid || "default"}`;

            if (cogsMap[cacheKey] !== undefined || loadingCogs[cacheKey]) return;

            setLoadingCogs(prev => ({ ...prev, [cacheKey]: true }));
            
            // Note: cost depends on the BOM of the parent but price is based on the variant
            const url = vid 
                ? `/api/manufacturing/finished-goods/bom-cost?productId=${parentId}&versionId=${vid}`
                : `/api/manufacturing/finished-goods/bom-cost?productId=${pid}`;

            fetch(url)
                .then(res => res.ok ? res.json() : { cost: 0, hasCogs: false })
                .then(data => {
                    const hasCogs = data.hasCogs !== undefined ? data.hasCogs : (typeof data.cost === "number" && data.cost > 0);
                    const resolvedCost = hasCogs
                        ? (typeof data.cost === "number" ? data.cost : Number(item.product!.cost_per_unit || 0))
                        : (item.product!.has_cogs ? Number(item.product!.cost_per_unit || 0) : null);
                    setCogsMap(prev => ({ ...prev, [cacheKey]: resolvedCost }));
                })
                .catch(() => {
                    setCogsMap(prev => ({ ...prev, [cacheKey]: item.product!.has_cogs ? Number(item.product!.cost_per_unit || 0) : null }));
                })
                .finally(() => {
                    setLoadingCogs(prev => ({ ...prev, [cacheKey]: false }));
                });
        });
    }, [selectedProductsList, cogsMap, loadingCogs]);

    return (
        <div className="space-y-4 rounded-2xl border bg-card/40 backdrop-blur-md p-6 shadow-xl w-full">
            <div className="flex items-center justify-between border-b pb-3">
                <div>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Coins className="h-4 w-4 text-violet-400" />
                        Agreed Pricing Override Sheet
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Define custom margins and price deviations from the catalog baseline.</p>
                </div>
            </div>

            <div className="overflow-x-auto overflow-y-visible rounded-xl border bg-muted/20 pb-4">
                <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
                    <thead className="bg-muted border-b text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        <tr>
                            <th className="p-3.5 w-48">Product Type</th>
                            <th className="p-3.5 w-64">Product</th>
                            <th className="p-3.5 min-w-[10rem]">Version</th>
                            <th className="p-3.5 w-32">UOM</th>
                            <th className="p-3.5 text-right w-24">Standard COGS</th>
                            <th className="p-3.5 text-right w-24">Price Type Rate</th>
                            <th className="p-3.5 text-right w-36">Agreed Price</th>
                            <th className="p-3.5 text-right w-24">Gross Profit Margin</th>
                            <th className="p-3.5 text-center w-16">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/85">
                        {selectedProductsList.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="py-12 text-center text-xs text-muted-foreground bg-muted/25 border-dashed">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Coins className="h-10 w-10 text-muted-foreground/60 animate-bounce" />
                                        <span>No products selected. Click &quot;+ Add Product&quot; to add them to this pricing draft.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : selectedProductsList.map((item, index) => {
                            const lineId = item.line_id || item.product?.product_id || index;
                            const pid = item.product?.product_id;
                            const parentId = item.parent_product_id || item.product?.parent_product_id || pid;
                            
                            const vid = item.versionId;
                            const cacheKey = `${pid}-${vid || "default"}`;
                            const cost = (pid && cogsMap[cacheKey] !== undefined) ? cogsMap[cacheKey] : (item.product?.has_cogs ? Number(item.product.cost_per_unit || 0) : null);
                            const priceTypePrice = Number(item.priceTypePrice || 0);
                            const agreedPrice = Number(item.agreedPrice || 0);
                            const gp = (cost !== null && agreedPrice > 0) ? agreedPrice - cost : null;
                            const margin = (gp !== null && agreedPrice > 0) ? (gp / agreedPrice) * 100 : null;
                            const isOverride = Math.abs(agreedPrice - priceTypePrice) > 0.01;

                            const otherSelectedVariantIds = selectedProductsList.filter(it => it.line_id !== lineId).map(it => it.product?.product_id).filter(Boolean);

                            const parentOptions = allProducts.filter(p => (p as unknown as Record<string, unknown>).is_parent)
                                .filter(p => {
                                    if (item.product_type_id && Number((p as unknown as Record<string, unknown>).product_type) !== item.product_type_id) return false;
                                    return true;
                                })
                                .map(p => ({ value: String(p.product_id), label: `${p.product_name} (${p.product_code || `SKU-${p.product_id}`})` }));

                            const uomOptions = allProducts.filter(p => Number((p as unknown as Record<string, unknown>).parent_product_id) === Number(parentId))
                                .filter(p => Number(p.product_id) === Number(pid) || !otherSelectedVariantIds.includes(Number(p.product_id)))
                                .sort((a, b) => Number((b as unknown as Record<string, unknown>).is_parent) - Number((a as unknown as Record<string, unknown>).is_parent) || Number((a as unknown as Record<string, unknown>).unit_count) - Number((b as unknown as Record<string, unknown>).unit_count))
                                .map(p => ({ value: String(p.product_id), label: formatUomLabel(p as unknown as Record<string, unknown>) }));
                                
                            const activeVersions = versionsMap[parentId || 0] || [];

                            return (
                                <tr key={lineId} className="hover:bg-muted/35 transition-colors group">
                                    <td className="p-3.5 overflow-visible">
                                        <CreatableSelect 
                                            options={productTypes.map(t => ({ value: String(t.id), label: String(t.name) }))} 
                                            value={item.product_type_id ? String(item.product_type_id) : ""} 
                                            onValueChange={(val) => {
                                                if (updateRow) {
                                                    updateRow(lineId, "product_type_id", Number(val));
                                                    updateRow(lineId, "parent_product_id", undefined);
                                                    if (handleRowProductSelect) handleRowProductSelect(lineId, null);
                                                }
                                            }} 
                                            placeholder="Choose Type..." 
                                            className="h-8 text-xs font-semibold" 
                                        />
                                    </td>
                                    <td className="p-3.5 overflow-visible">
                                        <CreatableSelect 
                                            options={parentOptions} 
                                            value={parentId ? String(parentId) : ""} 
                                            onValueChange={(val) => {
                                                if (updateRow) {
                                                    updateRow(lineId, "parent_product_id", Number(val));
                                                    if (handleRowProductSelect) handleRowProductSelect(lineId, null);
                                                    
                                                    // Auto-select UOM if only 1 option available? Let user select it.
                                                }
                                            }} 
                                            placeholder="Choose Product..." 
                                            className="h-8 text-xs font-semibold" 
                                            disabled={!item.product_type_id && !parentId} 
                                        />
                                    </td>
                                    <td className="p-3.5 overflow-visible">
                                        <CreatableSelect 
                                            options={activeVersions.map(v => ({ value: String(v.id), label: v.version_name }))} 
                                            value={vid ? String(vid) : ""} 
                                            onValueChange={(val) => {
                                                const vObj = activeVersions.find(v => String(v.id) === val);
                                                changeProductVersion(lineId, Number(val), vObj ? vObj.version_name : null);
                                            }} 
                                            placeholder="Choose Version..." 
                                            className="h-8 text-xs font-semibold" 
                                            disabled={!parentId || activeVersions.length === 0} 
                                        />
                                    </td>
                                    <td className="p-3.5 overflow-visible">
                                        <CreatableSelect 
                                            options={uomOptions} 
                                            value={pid ? String(pid) : ""} 
                                            onValueChange={(val) => {
                                                if (handleRowProductSelect) {
                                                    const variant = allProducts.find(p => String(p.product_id) === val);
                                                    handleRowProductSelect(lineId, (variant as unknown as CatalogProduct) || null);
                                                }
                                            }} 
                                            placeholder="Choose UOM..." 
                                            className="h-8 text-xs font-semibold" 
                                            disabled={!parentId} 
                                        />
                                    </td>
                                    <td className="p-3.5 text-right font-semibold text-foreground">
                                        {!pid ? (
                                            <span className="text-muted-foreground bg-muted border px-2 py-0.5 rounded-md text-[10px]">--</span>
                                        ) : loadingCogs[cacheKey] ? (
                                            <span className="text-muted-foreground animate-pulse text-[10px]">resolving...</span>
                                        ) : cost !== null ? (
                                            `₱${cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                                        ) : (
                                            <span className="text-muted-foreground bg-muted border px-2 py-0.5 rounded-md text-[10px]">N/A</span>
                                        )}
                                    </td>
                                    <td className="p-3.5 text-right text-muted-foreground font-medium">
                                        {!pid ? (
                                            <span className="text-muted-foreground bg-muted border px-2 py-0.5 rounded-md text-[10px]">--</span>
                                        ) : (
                                            `₱${priceTypePrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                                        )}
                                    </td>
                                    <td className="p-3.5 text-right">
                                        <div className="relative inline-block w-full max-w-[120px]">
                                            <span className="absolute left-2.5 top-1.5 text-[10px] text-muted-foreground">₱</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={agreedPrice || ""}
                                                onChange={e => handleAgreedPriceChange(lineId, parseFloat(e.target.value) || 0)}
                                                className={`w-full rounded-lg border pl-6 pr-2.5 py-1 text-right text-xs bg-background outline-none transition-all ${
                                                    isOverride 
                                                        ? "border-amber-500/80 font-bold text-amber-500 focus:ring-1 focus:ring-amber-500" 
                                                        : "border-input text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
                                                }`}
                                                disabled={!pid}
                                            />
                                        </div>
                                    </td>
                                    <td className="p-3.5 text-right">
                                        <div className="flex flex-col items-end">
                                            {!pid ? (
                                                <span className="text-muted-foreground text-[10px] bg-muted border px-2 py-0.5 rounded-md">--</span>
                                            ) : gp !== null ? (
                                                <>
                                                    <span className={`font-bold text-xs ${gp >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                                        ₱{gp.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                    </span>
                                                    <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${margin !== null && margin >= 15 ? "text-emerald-600/90" : "text-amber-500"}`}>
                                                        <Percent className="h-2.5 w-2.5" />
                                                        {margin !== null ? margin.toFixed(1) : 0}%
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-muted-foreground text-[10px] bg-muted border px-2 py-0.5 rounded-md">N/A</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3.5 text-center">
                                        <button
                                            onClick={() => removeProductFromQuote(lineId)}
                                            className="p-2 hover:bg-muted text-rose-500/80 hover:text-rose-500 rounded-lg transition-all"
                                            title="Remove Item"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="px-4 pt-3 flex justify-start">
                    <button
                        onClick={addEmptyRow}
                        className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-dashed border-primary text-primary hover:bg-primary/10 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Product
                    </button>
                </div>
            </div>
        </div>
    );
}
