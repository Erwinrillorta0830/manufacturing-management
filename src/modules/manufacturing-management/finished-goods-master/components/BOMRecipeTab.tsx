import React, { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { BOMMaterialSelect } from "./BOMMaterialSelect";
import { CreatableSelect } from "./CreatableSelect";
import { BOMItem, Unit } from "../types";

interface BOMRecipeTabProps {
    editedBOM: BOMItem[];
    handleBOMChange: <K extends keyof BOMItem>(itemId: string, field: K, value: BOMItem[K]) => void;
    addBOMItem: () => void;
    deleteBOMItem: (id: string) => void;
    units: Unit[];
    baseMaterialCost: number;
}

export const BOMRecipeTab: React.FC<BOMRecipeTabProps> = ({
    editedBOM,
    handleBOMChange,
    addBOMItem,
    deleteBOMItem,
    units,
    baseMaterialCost
}) => {
    const uomOptions = useMemo(() => {
        return units.map(u => ({
            value: u.unit_shortcut,
            label: `${u.unit_name} (${u.unit_shortcut})`
        }));
    }, [units]);
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">Recipe Components (BOM)</h2>
                    <p className="text-xs text-muted-foreground">Raw materials and packaging items required to compile the finished good.</p>
                </div>
                <button 
                    onClick={addBOMItem}
                    className="inline-flex items-center gap-1 rounded-lg border bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-accent"
                >
                    <Plus className="h-3 w-3" /> Add Material
                </button>
            </div>

            <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm min-w-[950px]">
                        <thead>
                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                <th className="p-3">Material Name</th>
                                <th className="p-3 w-28">Type</th>
                                <th className="p-3 w-28">Quantity</th>
                                <th className="p-3 w-28">UOM</th>
                                <th className="p-3 w-24">Density</th>
                                <th className="p-3 w-20">Wastage %</th>
                                <th className="p-3 w-28">Landed Cost</th>
                                <th className="p-3 text-right">Computed Cost</th>
                                <th className="p-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {editedBOM.map((item, index) => {
                                const divisor = 1 - (item.wastagePercent / 100);
                                const itemCost = (item.quantity * item.landedCost) / (divisor > 0 ? divisor : 1);
                                const computedCost = item.type === "by_product" ? -itemCost : itemCost;
                                
                                return (
                                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/5 transition-colors">
                                        <td className="p-1 border-r border-muted/20 min-w-[320px] align-middle">
                                            <BOMMaterialSelect
                                                value={item.productId}
                                                type={item.type}
                                                onSelectProduct={(foundProd) => {
                                                    handleBOMChange(item.id, "productId", foundProd.product_id);
                                                    handleBOMChange(item.id, "name", foundProd.product_name);
                                                    handleBOMChange(item.id, "uom", foundProd.unit_of_measurement?.unit_shortcut || "L");
                                                    handleBOMChange(item.id, "uomId", foundProd.unit_of_measurement?.unit_id || undefined);
                                                    handleBOMChange(item.id, "landedCost", Number(foundProd.cost_per_unit || foundProd.price_per_unit || 0));
                                                    
                                                    // Auto-detect type
                                                    let detectedType: BOMItem["type"] = "raw_material";
                                                    if (foundProd.has_versions) {
                                                        detectedType = "sub_assembly";
                                                    } else {
                                                        const lowerName = foundProd.product_name.toLowerCase();
                                                        const isPkg = lowerName.includes("box") || lowerName.includes("bottle") || lowerName.includes("cap") || lowerName.includes("sticker") || lowerName.includes("packaging") || lowerName.includes("plastic") || lowerName.includes("wrapper") || lowerName.includes("label");
                                                        if (isPkg) {
                                                            detectedType = "packaging";
                                                        }
                                                    }
                                                    handleBOMChange(item.id, "type", detectedType);
                                                }}
                                            />
                                        </td>
                                        <td className="p-1 border-r border-muted/20 w-28 align-middle">
                                            <select
                                                value={item.type}
                                                data-index={index}
                                                disabled={!!item.productId}
                                                onChange={e => handleBOMChange(item.id, "type", e.target.value as BOMItem["type"])}
                                                onKeyDown={e => {
                                                    if (e.key === "ArrowDown") {
                                                        e.preventDefault();
                                                        const el = document.querySelector(`.bom-type-select[data-index="${index + 1}"]`) as HTMLSelectElement;
                                                        if (el) el.focus();
                                                    } else if (e.key === "ArrowUp") {
                                                        e.preventDefault();
                                                        const el = document.querySelector(`.bom-type-select[data-index="${index - 1}"]`) as HTMLSelectElement;
                                                        if (el) el.focus();
                                                    } else if (e.key === "ArrowRight") {
                                                        const el = document.querySelector(`.bom-qty-input[data-index="${index}"]`) as HTMLInputElement;
                                                        if (el) el.focus();
                                                    }
                                                }}
                                                className="bom-type-select w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1 px-1.5 text-xs text-foreground rounded-sm"
                                            >
                                                <option value="raw_material">Raw Mat</option>
                                                <option value="packaging">Packaging</option>
                                                <option value="sub_assembly">Sub-Assy</option>
                                                <option value="by_product">By-Prod</option>
                                                <option value="finished_good">Finished Good</option>
                                            </select>
                                        </td>
                                        <td className="p-1 border-r border-muted/20 w-28 align-middle">
                                            <input 
                                                type="number" 
                                                step="0.0001"
                                                value={item.quantity === 0 ? "" : item.quantity} 
                                                data-index={index}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value);
                                                    handleBOMChange(item.id, "quantity", isNaN(val) ? 0 : val);
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === "ArrowDown") {
                                                        e.preventDefault();
                                                        const el = document.querySelector(`.bom-qty-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                        if (el) el.focus();
                                                    } else if (e.key === "ArrowUp") {
                                                        e.preventDefault();
                                                        const el = document.querySelector(`.bom-qty-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                        if (el) el.focus();
                                                    }
                                                }}
                                                className="bom-qty-input w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1 px-2 text-sm text-foreground rounded-sm"
                                                placeholder="0.00"
                                            />
                                        </td>
                                        <td className="p-1 border-r border-muted/20 w-28 align-middle">
                                            <CreatableSelect
                                                options={uomOptions}
                                                value={item.uom || ""}
                                                onValueChange={(val) => {
                                                    const matchedUnit = units.find(u => u.unit_shortcut === val);
                                                    handleBOMChange(item.id, "uom", val);
                                                    handleBOMChange(item.id, "uomId", matchedUnit ? matchedUnit.unit_id : undefined);
                                                }}
                                                placeholder="UOM"
                                                disabled={!!item.productId}
                                            />
                                        </td>
                                        <td className="p-1 border-r border-muted/20 w-24 align-middle">
                                            <input 
                                                type="number" 
                                                step="0.001"
                                                value={item.densityFactor !== undefined ? item.densityFactor : 1.0} 
                                                data-index={index}
                                                disabled={!!item.productId}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value);
                                                    handleBOMChange(item.id, "densityFactor", isNaN(val) ? 1.0 : val);
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === "ArrowDown") {
                                                        e.preventDefault();
                                                        const el = document.querySelector(`.bom-density-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                        if (el) el.focus();
                                                    } else if (e.key === "ArrowUp") {
                                                        e.preventDefault();
                                                        const el = document.querySelector(`.bom-density-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                        if (el) el.focus();
                                                    }
                                                }}
                                                className="bom-density-input w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1 px-2 text-sm text-right text-foreground rounded-sm"
                                                placeholder="1.00"
                                            />
                                        </td>
                                        <td className="p-1 border-r border-muted/20 w-20 align-middle">
                                            <input 
                                                type="number" 
                                                step="0.1"
                                                value={item.wastagePercent || 0} 
                                                data-index={index}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value);
                                                    handleBOMChange(item.id, "wastagePercent", isNaN(val) ? 0 : val);
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === "ArrowDown") {
                                                        e.preventDefault();
                                                        const el = document.querySelector(`.bom-wastage-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                        if (el) el.focus();
                                                    } else if (e.key === "ArrowUp") {
                                                        e.preventDefault();
                                                        const el = document.querySelector(`.bom-wastage-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                        if (el) el.focus();
                                                    }
                                                }}
                                                className="bom-wastage-input w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1 px-2 text-sm text-foreground rounded-sm"
                                                placeholder="0.0"
                                            />
                                        </td>
                                        <td className="p-1 border-r border-muted/20 w-28 align-middle">
                                            <div className="relative flex items-center px-2">
                                                <span className="text-xs text-muted-foreground select-none mr-1.5">₱</span>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={item.landedCost === 0 ? "" : item.landedCost} 
                                                    data-index={index}
                                                    onChange={e => {
                                                        const val = parseFloat(e.target.value);
                                                        handleBOMChange(item.id, "landedCost", isNaN(val) ? 0 : val);
                                                    }}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            const isLastRow = index === editedBOM.length - 1;
                                                            if (isLastRow) {
                                                                addBOMItem();
                                                            } else {
                                                                const el = document.querySelector(`.bom-type-select[data-index="${index + 1}"]`) as HTMLSelectElement;
                                                                if (el) el.focus();
                                                            }
                                                        } else if (e.key === "ArrowDown") {
                                                            e.preventDefault();
                                                            const el = document.querySelector(`.bom-landed-input[data-index="${index + 1}"]`) as HTMLInputElement;
                                                            if (el) el.focus();
                                                        } else if (e.key === "ArrowUp") {
                                                            e.preventDefault();
                                                            const el = document.querySelector(`.bom-landed-input[data-index="${index - 1}"]`) as HTMLInputElement;
                                                            if (el) el.focus();
                                                        }
                                                    }}
                                                    className="bom-landed-input w-full bg-transparent border-0 focus:ring-1 focus:ring-primary focus:bg-background focus:outline-hidden py-1 px-1.5 text-sm text-foreground rounded-sm"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </td>
                                        <td className={`p-3 text-right font-medium ${item.type === "by_product" ? "text-destructive" : "text-foreground"}`}>
                                            ₱{computedCost.toFixed(2)}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button 
                                                onClick={() => deleteBOMItem(item.id)}
                                                className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {editedBOM.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                                        No recipe ingredients added yet. Click &quot;Add Material&quot; to begin.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="flex justify-end p-2 bg-muted/20 rounded-lg">
                <span className="text-xs font-semibold text-muted-foreground">
                    Raw Ingredients Base Subtotal: <span className="text-sm font-bold text-foreground">₱{baseMaterialCost.toFixed(2)}</span>
                </span>
            </div>
        </div>
    );
};
