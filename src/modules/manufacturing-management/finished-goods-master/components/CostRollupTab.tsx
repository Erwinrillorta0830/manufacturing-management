import React from "react";
import { Sliders, RefreshCw, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { BOMItem, Product, VersionOverheadItem } from "../types";
import { CostingBreakdown, OverheadSummary } from "../costing";
import { generateFinishedGoodCostRollupPDF } from "../utils/exportFinishedGoodCostRollupPDF";

interface ProductOverhead {
    id: string;
    overheadId: number;
    overheadName: string;
    amount: number;
}

interface CostRollupTabProps {
    standardPrice: number;
    standardCogs: number;
    standardBreakdown: CostingBreakdown;
    standardOverheads: OverheadSummary & {
        items: ProductOverhead[];
    };
    standardGrossProfit: number;
    standardGrossMarginPercent: number;
    standardNetProfit: number;
    standardNetMarginPercent: number;
    simulationYield: number;
    setSimulationYield: React.Dispatch<React.SetStateAction<number>>;
    simulationTargetPrice: number;
    setSimulationTargetPrice: React.Dispatch<React.SetStateAction<number>>;
    simulationPriceOverrides: Record<string, number>;
    setSimulationPriceOverrides: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    editedBOM: BOMItem[];
    selectedProduct: Product;
    selectedVersionId?: number | null;
    simulatedGrossProfit: number;
    simulatedGrossMarginPercent: number;
    simulatedNetProfit: number;
    simulatedCogs: number;
    simulatedBreakdown: CostingBreakdown;
    simulatedOverheads: OverheadSummary & {
        items: ProductOverhead[];
    };
    simulatedNetMarginPercent: number;
    simulatedForexRate: number;
    setSimulatedForexRate: React.Dispatch<React.SetStateAction<number>>;
    versionOverheadItems?: VersionOverheadItem[];
}

export const CostRollupTab: React.FC<CostRollupTabProps> = ({
    versionOverheadItems = [],
    standardPrice,
    standardCogs,
    standardBreakdown,
    standardOverheads,
    standardGrossProfit,
    standardGrossMarginPercent,
    standardNetProfit,
    standardNetMarginPercent,
    simulationYield,
    setSimulationYield,
    simulationTargetPrice,
    setSimulationTargetPrice,
    simulationPriceOverrides,
    setSimulationPriceOverrides,
    editedBOM,
    selectedProduct,
    simulatedGrossProfit,
    simulatedGrossMarginPercent,
    simulatedNetProfit,
    simulatedCogs,
    simulatedBreakdown,
    simulatedOverheads,
    simulatedNetMarginPercent,
    simulatedForexRate,
    setSimulatedForexRate
}) => {
    const formatCurrency = (val: number | string | null | undefined): string => {
        const num = Number(val || 0);
        return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const handleExportCSV = () => {
        const rows = [
            ["Cost Rollup Report", selectedProduct?.title || "Finished Good"],
            ["SKU", selectedProduct?.sku || ""],
            ["Base UOM", selectedProduct?.baseUom || ""],
            ["Date Generated", new Date().toLocaleDateString()],
            [""],
            ["Metric", "Standard Value (PHP)"],
            ["Target Selling Price", standardPrice.toFixed(2)],
            ["Cost of Goods Sold (COGS)", standardCogs.toFixed(2)],
            ["Gross Profit", standardGrossProfit.toFixed(2)],
            ["Gross Margin %", `${standardGrossMarginPercent.toFixed(1)}%`],
            ["Net Profit", standardNetProfit.toFixed(2)],
            ["Net Margin %", `${standardNetMarginPercent.toFixed(1)}%`],
            [""],
            ["BOM Component Breakdown", "Quantity", "UOM", "Unit Cost (PHP)", "Extended Cost (PHP)"],
            ...editedBOM.map(b => {
                const qty = Number(b.quantity || 0);
                const itemObj = b as unknown as Record<string, unknown>;
                const landed = Number(b.landedCost ?? itemObj.unitCost ?? itemObj.costPerUnit ?? 0);
                const ext = qty * landed;
                return [
                    b.name || "Ingredient",
                    qty.toString(),
                    b.uom || "PCS",
                    landed.toFixed(2),
                    ext.toFixed(2)
                ];
            }),
            [""],
            ["Overhead Item", "Cost per Unit (PHP)"],
            ...versionOverheadItems.map(o => {
                const oObj = o as unknown as Record<string, unknown>;
                return [
                    o.overhead_name || "Overhead",
                    (Number(o.cost_per_unit || oObj.cost || 0)).toFixed(2)
                ];
            })
        ];

        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.map(cell => `"${cell}"`).join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Cost_Rollup_${selectedProduct?.sku || "FG"}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Cost rollup exported to CSV!");
    };

    const handleExportPDF = () => {
        try {
            generateFinishedGoodCostRollupPDF({
                selectedProduct,
                standardPrice,
                standardCogs,
                standardBreakdown,
                standardOverheads,
                standardGrossProfit,
                standardGrossMarginPercent,
                standardNetProfit,
                standardNetMarginPercent,
                editedBOM,
                versionOverheadItems
            });
            toast.success("PDF report generated and downloaded!");
        } catch (err: unknown) {
            console.error("PDF Export error:", err);
            toast.error((err as Error).message || "Failed to generate PDF report");
        }
    };

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            {/* Cost Rollup Tree / Summary */}
            <div className="space-y-6 rounded-xl border bg-muted/10 p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-bold text-foreground">Standard Cost & Profitability Rollup</h3>
                        <p className="text-xs text-muted-foreground">Excel-aligned profit margins and overhead expense breakdown.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleExportPDF}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all cursor-pointer shadow-2xs"
                            title="Generate and download jsPDF document"
                        >
                            <FileText className="h-3.5 w-3.5 text-primary" /> Download PDF
                        </button>
                        <button
                            type="button"
                            onClick={handleExportCSV}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border bg-background hover:bg-muted text-foreground transition-all cursor-pointer shadow-2xs"
                            title="Export Cost Rollup Report to CSV"
                        >
                            <Download className="h-3.5 w-3.5 text-foreground" /> CSV
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-lg bg-card p-3.5 border space-y-2">
                        <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                            <span>Target Selling Price</span>
                            <span className="text-foreground text-sm font-bold">₱{formatCurrency(standardPrice)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground border-b pb-2">
                            <span>Cost of Goods Sold (COGS / unit)</span>
                            <span className="text-foreground text-sm font-bold">₱{formatCurrency(standardCogs)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs border-b pb-2">
                            <span>Batch COGS</span>
                            <span className="text-foreground text-sm font-bold">₱{formatCurrency(standardBreakdown.batchCost)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold pt-1">
                            <span className="text-primary">Gross Margin (on sales)</span>
                            <span className="text-primary text-sm">
                                ₱{formatCurrency(standardGrossProfit)} ({standardPrice > 0 ? `${standardGrossMarginPercent.toFixed(1)}%` : "N/A"})
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs rounded-lg border bg-card p-3">
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Direct Materials (pre-yield, per unit)</span>
                            <span className="font-medium">₱{formatCurrency(standardBreakdown.materialsCost)}</span>
                        </div>

                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground font-semibold text-amber-600 dark:text-amber-400">Direct Labor (per unit)</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">₱{formatCurrency(standardBreakdown.directLaborCost)}</span>
                        </div>

                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Machine &amp; routing overhead (per unit)</span>
                            <span className="font-medium">₱{formatCurrency(standardBreakdown.machineOverheadCost)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground font-semibold text-sky-600 dark:text-sky-400">Continuous Line Shift Duration (Inline)</span>
                            <span className="font-bold font-mono text-sky-600 dark:text-sky-400">
                                {(() => {
                                    const hrs = standardBreakdown.lineElapsedHours || 0;
                                    if (!hrs || isNaN(hrs)) return "00:00:00";
                                    const totalSeconds = Math.round(Math.abs(hrs) * 3600);
                                    const h = Math.floor(totalSeconds / 3600);
                                    const m = Math.floor((totalSeconds % 3600) / 60);
                                    const s = totalSeconds % 60;
                                    const pad = (num: number) => String(num).padStart(2, "0");
                                    return `${pad(h)}:${pad(m)}:${pad(s)}`;
                                })()}
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Cumulative Workstation Machine Hours</span>
                            <span className="font-medium font-mono">
                                {(() => {
                                    const hrs = standardBreakdown.machineHours;
                                    if (hrs === null || hrs === undefined || isNaN(hrs)) return "00:00:00";
                                    const totalSeconds = Math.round(Math.abs(hrs) * 3600);
                                    const h = Math.floor(totalSeconds / 3600);
                                    const m = Math.floor((totalSeconds % 3600) / 60);
                                    const s = totalSeconds % 60;
                                    const sign = hrs < 0 ? "-" : "";
                                    const pad = (num: number) => String(num).padStart(2, "0");
                                    return `${sign}${pad(h)}:${pad(m)}:${pad(s)}`;
                                })()}
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Total work center cost (batch total)</span>
                            <span className="font-medium font-mono text-foreground">₱{formatCurrency(standardBreakdown.totalMachineCost)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Version overhead allocation (per unit)</span>
                            <span className="font-medium">₱{formatCurrency(standardBreakdown.customOverheadCost)}</span>
                        </div>
                        <div className="flex justify-between gap-2 border-t pt-2 col-span-2">
                            <span className="font-semibold">Pre-yield direct unit cost</span>
                            <span className="font-semibold">₱{formatCurrency(standardBreakdown.preYieldDirectCost)}</span>
                        </div>
                        <div className="flex justify-between gap-2 col-span-2">
                            <span className="text-muted-foreground">Yield-adjusted unit cost</span>
                            <span className="font-medium">₱{formatCurrency(standardBreakdown.unitCost)}</span>
                        </div>
                        <div className="flex justify-between gap-2 col-span-2">
                            <span className="text-muted-foreground">Expected yield</span>
                            <span className="font-medium">{standardBreakdown.yieldPercentage.toFixed(2)}% (factor {standardBreakdown.yieldFactor.toFixed(4)}) · batch × {standardBreakdown.baseQuantity}</span>
                        </div>
                    </div>

                    {/* Overhead Details */}
                    <div className="space-y-2.5">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Overhead Expenses Breakdown</span>
                        <div className="border rounded-lg bg-card p-3 shadow-xs space-y-2 text-xs">
                            <div className="flex justify-between items-center border-b pb-1.5 font-semibold text-foreground">
                                <span>Version Overhead Allocation (Included in Unit COGS):</span>
                                <span className="font-mono font-bold text-primary">₱{formatCurrency(standardOverheads.customOverhead)}</span>
                            </div>

                            {/* Configured Overhead Types Line-Item Breakdown */}
                            {versionOverheadItems.filter(i => i.is_active !== false).length > 0 ? (
                                <div className="space-y-1.5 py-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Configured Overhead Types:</span>
                                    <div className="space-y-1 pl-2 border-l-2 border-primary/40">
                                        {versionOverheadItems.filter(i => i.is_active !== false).map((item) => (
                                            <div key={item.id} className="flex justify-between items-center text-xs py-0.5">
                                                <span className="text-foreground font-medium flex items-center gap-1.5" title={item.remarks}>
                                                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                                    {item.overhead_name}
                                                </span>
                                                <span className="font-mono font-bold text-foreground">
                                                    ₱{formatCurrency(item.cost_per_unit)} <span className="text-[10px] text-muted-foreground font-normal">/ unit</span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : standardOverheads.items.length > 0 ? (
                                <div className="space-y-1 py-1 pl-2 border-l-2 border-primary/40">
                                    {standardOverheads.items.map((item) => (
                                        <div key={item.id} className="flex justify-between items-center text-xs py-0.5">
                                            <span className="text-foreground font-medium">{item.overheadName}:</span>
                                            <span className="font-mono font-bold text-foreground">₱{formatCurrency(item.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-muted-foreground py-1 text-[11px]">
                                    No active overhead types allocated to this version.
                                </div>
                            )}

                            <div className="flex justify-between items-center border-t pt-2 text-muted-foreground">
                                <span>Additional Operating Overhead (Excluded from COGS):</span>
                                <span className="font-mono font-semibold text-foreground">
                                    ₱{formatCurrency(standardOverheads.additionalOperatingOverhead)}
                                </span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-xs font-semibold px-1">
                            <span className="text-muted-foreground uppercase text-[11px] font-bold">Total Overhead Expenses:</span>
                            <span className="text-foreground font-black text-sm font-mono">₱{formatCurrency(standardOverheads.totalOverheadExpenses)}</span>
                        </div>
                    </div>

                    {/* Bottom Line Net Profit */}
                    <div className={`rounded-xl border p-4 flex items-center justify-between shadow-xs ${
                        standardNetProfit >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-destructive/5 border-destructive/20"
                    }`}>
                        <div>
                            <span className="text-xs font-semibold text-muted-foreground block">Standard Net Margin (on sales)</span>
                            <span className="text-xs text-muted-foreground">Net of all COGS and operating overheads</span>
                        </div>
                        <div className="text-right">
                            <span className={`text-lg font-black font-mono block ${
                                standardNetProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                            }`}>
                                ₱{formatCurrency(standardNetProfit)}
                            </span>
                            <span className="text-xs font-bold text-muted-foreground">
                                {standardPrice > 0 ? `${standardNetMarginPercent.toFixed(1)}% margin` : "N/A"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Simulator Column */}
            <div className="space-y-6 rounded-xl border bg-card p-5 shadow-xs">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                            <Sliders className="h-4 w-4 text-primary" /> What-If Cost &amp; Margin Simulator
                        </h3>
                        <p className="text-xs text-muted-foreground">Simulate yield changes, price fluctuations &amp; target margins in real-time.</p>
                    </div>

                    <button
                        onClick={() => {
                            setSimulationYield(Number(standardBreakdown.yieldPercentage) || 100);
                            setSimulationTargetPrice(standardPrice);
                            setSimulationPriceOverrides({});
                            toast.info("Simulation reset to standard baseline");
                        }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border px-2.5 py-1.5 rounded-lg bg-background"
                        title="Reset simulation parameters to standard version baseline"
                    >
                        <RefreshCw className="h-3 w-3" /> Reset
                    </button>
                </div>

                {/* Yield slider */}
                <div className="space-y-2 border-t pt-3">
                    <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-muted-foreground">Expected Yield Percentage</span>
                        <span className="font-bold text-primary">{simulationYield.toFixed(1)}%</span>
                    </div>
                    <input 
                        type="range"
                        min="50"
                        max="100"
                        step="0.5"
                        value={simulationYield}
                        onChange={e => setSimulationYield(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                </div>

                {/* Global Forex Rate Simulator */}
                <div className="space-y-2 border-t pt-3">
                    <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-muted-foreground flex items-center gap-1">
                            🌐 Simulate USD Forex Rate
                        </span>
                        <span className="font-bold text-blue-600">₱{formatCurrency(simulatedForexRate)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <input 
                            type="range"
                            min="50"
                            max="65"
                            step="0.1"
                            value={simulatedForexRate}
                            onChange={e => setSimulatedForexRate(parseFloat(e.target.value))}
                            className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <input
                            type="number"
                            step="0.01"
                            value={simulatedForexRate}
                            onChange={e => setSimulatedForexRate(parseFloat(e.target.value) || 58.00)}
                            className="w-16 rounded border px-1.5 py-0.5 text-right text-xs bg-background text-foreground"
                        />
                    </div>
                </div>

                {/* Cost price overrides */}
                <div className="space-y-3 border-t pt-3">
                    <span className="text-xs font-semibold text-muted-foreground">Override Material Landed Costs</span>
                    <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                        {editedBOM.map(item => {
                            const isForeign = item.isForeign || item.currency === "USD";
                            return (
                                <div key={item.id} className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                                        <span className="text-xs font-medium truncate text-foreground">{item.name}</span>
                                        {isForeign && (
                                            <span className="shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded-[4px] text-[8px] font-bold border border-blue-500/20" title={`Foreign Sourced: $${item.originalPrice || 0} USD`}>
                                                USD
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-xs text-muted-foreground">₱</span>
                                        <input 
                                            type="number"
                                            step="0.1"
                                            value={simulationPriceOverrides[item.id] !== undefined ? simulationPriceOverrides[item.id] : item.landedCost}
                                            onChange={e => setSimulationPriceOverrides(prev => ({
                                                ...prev,
                                                [item.id]: parseFloat(e.target.value) || 0
                                            }))}
                                            className="w-24 rounded border px-1.5 py-0.5 text-right text-xs bg-background text-foreground"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Target selling price override */}
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Simulation Target Price</label>
                    <div className="relative">
                        <span className="absolute left-2 top-2 text-xs text-muted-foreground">₱</span>
                        <input 
                            type="number"
                            step="0.1"
                            value={simulationTargetPrice}
                            onChange={e => setSimulationTargetPrice(parseFloat(e.target.value) || 0)}
                            className="w-full rounded-lg border pl-5 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary bg-background text-foreground"
                        />
                    </div>
                </div>

                {/* Dynamic calculation box */}
                {(() => {
                    const simProfit = simulatedNetProfit;
                    const isLow = simProfit < 0;
                    return (
                        <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                            <div className="flex justify-between items-center text-xs">
                                <span>Simulated COGS / unit:</span>
                                <span className="font-semibold text-foreground">₱{formatCurrency(simulatedCogs)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs font-bold text-primary">
                                <span>Simulated Gross Margin (on sales):</span>
                                <span>₱{formatCurrency(simulatedGrossProfit)} ({simulationTargetPrice > 0 ? `${simulatedGrossMarginPercent.toFixed(1)}%` : "N/A"})</span>
                            </div>
                            <div className="flex justify-between items-center text-xs border-t pt-1">
                                <span className="text-muted-foreground">Direct Materials (per unit):</span>
                                <span className="font-semibold text-foreground">₱{formatCurrency(simulatedBreakdown.materialsCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">Direct Labor (per unit):</span>
                                <span className="font-bold text-amber-600 dark:text-amber-400">₱{formatCurrency(simulatedBreakdown.directLaborCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Machine Routing Overhead (per unit):</span>
                                <span className="font-semibold text-foreground">₱{formatCurrency(simulatedBreakdown.machineOverheadCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs border-b pb-2">
                                <span>Simulated Overhead Expenses:</span>
                                <span className="font-semibold text-muted-foreground">₱{formatCurrency(simulatedOverheads.totalOverheadExpenses)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Version overhead included in unit COGS:</span>
                                <span className="font-semibold text-muted-foreground">₱{formatCurrency(simulatedOverheads.customOverhead)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Operating overhead excluded from COGS:</span>
                                <span className="font-semibold text-muted-foreground">₱{formatCurrency(simulatedOverheads.additionalOperatingOverhead)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Simulated batch COGS:</span>
                                <span className="font-semibold text-muted-foreground">₱{formatCurrency(simulatedBreakdown.batchCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm border-t pt-2 mt-1">
                                <span className="font-extrabold text-foreground">Simulated Net Profit (margin on sales):</span>
                                <span className={`font-extrabold text-sm ${
                                    isLow ? "text-destructive" : "text-emerald-600"
                                }`}>
                                    ₱{formatCurrency(simProfit)} ({simulationTargetPrice > 0 ? `${simulatedNetMarginPercent.toFixed(1)}%` : "N/A"})
                                </span>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};
