import React from "react";
import { Sliders, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BOMItem, Product } from "../types";
import { CostingBreakdown, OverheadSummary } from "../costing";

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
    selectedVersionId: number | null;
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
}

export const CostRollupTab: React.FC<CostRollupTabProps> = ({
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
    selectedVersionId,
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
    const [customers, setCustomers] = React.useState<{ id: number; customer_name: string; customer_code?: string }[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = React.useState<string>("");
    const [quoteNumber, setQuoteNumber] = React.useState<string>("");
    const [remarks, setRemarks] = React.useState<string>("");
    const [isSavingQuote, setIsSavingQuote] = React.useState<boolean>(false);
    const [isQuoteModalOpen, setIsQuoteModalOpen] = React.useState<boolean>(false);

    React.useEffect(() => {
        if (isQuoteModalOpen) {
            // Load customers list
            fetch("/api/manufacturing/finished-goods/customers")
                .then(res => res.ok ? res.json() : [])
                .then(data => {
                    setCustomers(data);
                    if (data.length > 0) {
                        setSelectedCustomerId(String(data[0].id));
                    }
                })
                .catch(e => console.error("Error loading customers:", e));

            // Generate unique quote number: e.g. QT-YYYYMMDD-HHMM
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            const sec = String(now.getSeconds()).padStart(2, '0');
            setQuoteNumber(`QT-${year}${month}${day}-${hour}${min}${sec}`);
        }
    }, [isQuoteModalOpen]);

    const handleSaveQuotation = async () => {
        if (!selectedCustomerId) {
            toast.error("Please select a customer first");
            return;
        }
        if (!quoteNumber.trim()) {
            toast.error("Quote number is required");
            return;
        }
        if (!selectedVersionId || selectedVersionId <= 0) {
            toast.error("Select a valid BOM version before saving a quotation");
            return;
        }
        if (editedBOM.some(item => !item.productId || Number(item.productId) <= 0)) {
            toast.error("Every BOM ingredient must have a valid product before saving a quotation");
            return;
        }

        setIsSavingQuote(true);
        try {
            // Compile header
            const header = {
                quote_number: quoteNumber,
                customer_id: parseInt(selectedCustomerId),
                total_selling_price: simulationTargetPrice,
                total_simulated_cost: simulatedCogs,
                forex_rate_used: simulatedForexRate,
                remarks: remarks || ""
            };

            // Compile snapshots
            interface QuoteSnapshot {
                product_id: number;
                version_id: number;
                node_name: string;
                node_type: string;
                quantity: number;
                uom: string;
                frozen_unit_cost_php: number;
                frozen_total_cost_php: number;
            }
            const snapshots: QuoteSnapshot[] = [];

            // 1. Ingredients
            editedBOM.forEach(item => {
                const overrideCost = simulationPriceOverrides[item.id] !== undefined ? simulationPriceOverrides[item.id] : item.landedCost;
                snapshots.push({
                    product_id: Number(item.productId),
                    version_id: selectedVersionId,
                    node_name: item.name,
                    node_type: item.type === "by_product" ? "by_product" : "ingredient",
                    quantity: item.quantity,
                    uom: item.uom,
                    frozen_unit_cost_php: overrideCost,
                    frozen_total_cost_php: item.quantity * overrideCost
                });
            });

            // 2. Routing step nodes from standard (we can use dummy placeholder if active component doesn't receive routings, but let's grab it if available)
            // Note: routings are configured inside FinishedGoodsModule.tsx state, we can add snapshots for materials, overheads and routing steps
            // Let's check what we have in standardOverheads/simulatedOverheads
            simulatedOverheads.items.forEach(o => {
                snapshots.push({
                    product_id: Number(selectedProduct.id),
                    version_id: selectedVersionId,
                    node_name: o.overheadName,
                    node_type: "overhead",
                    quantity: 1,
                    uom: "PHP",
                    frozen_unit_cost_php: Number(o.amount) || 0,
                    frozen_total_cost_php: Number(o.amount) || 0
                });
            });

            const response = await fetch("/api/manufacturing/finished-goods/quotes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ header, snapshots })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to save quotation snapshot");
            }

            toast.success(`Quotation ${quoteNumber} saved and frozen successfully!`);
            setIsQuoteModalOpen(false);
            setRemarks("");
        } catch (e) {
            console.error("Save quotation error:", e);
            const err = e instanceof Error ? e : new Error(String(e));
            toast.error(err.message || "Error saving quotation");
        } finally {
            setIsSavingQuote(false);
        }
    };

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            {/* Cost Rollup Tree / Summary */}
            <div className="space-y-6 rounded-xl border bg-muted/10 p-5">
                <div>
                    <h3 className="text-base font-bold text-foreground">Standard Cost & Profitability Rollup</h3>
                    <p className="text-xs text-muted-foreground">Excel-aligned profit margins and overhead expense breakdown.</p>
                </div>

                <div className="space-y-4">
                    <div className="rounded-lg bg-card p-3.5 border space-y-2">
                        <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                            <span>Target Selling Price</span>
                            <span className="text-foreground text-sm font-bold">₱{standardPrice.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground border-b pb-2">
                            <span>Cost of Goods Sold (COGS / unit)</span>
                            <span className="text-foreground text-sm font-bold">₱{standardCogs.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs border-b pb-2">
                            <span>Batch COGS</span>
                            <span className="text-foreground text-sm font-bold">₱{standardBreakdown.batchCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold pt-1">
                            <span className="text-primary">Gross Margin (on sales)</span>
                            <span className="text-primary text-sm">
                                ₱{standardGrossProfit.toFixed(2)} ({standardPrice > 0 ? `${standardGrossMarginPercent.toFixed(1)}%` : "N/A"})
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs rounded-lg border bg-card p-3">
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Materials (pre-yield, per unit)</span>
                            <span className="font-medium">₱{standardBreakdown.materialsCost.toFixed(2)}</span>
                        </div>

                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Machine overhead (per unit)</span>
                            <span className="font-medium">₱{standardBreakdown.machineOverheadCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Workstation duration</span>
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
                            <span className="text-muted-foreground">Total workstation cost</span>
                            <span className="font-medium">₱{standardBreakdown.totalMachineCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Custom overhead</span>
                            <span className="font-medium">₱{standardBreakdown.customOverheadCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-2 border-t pt-2 col-span-2">
                            <span className="font-semibold">Pre-yield direct unit cost</span>
                            <span className="font-semibold">₱{standardBreakdown.preYieldDirectCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-2 col-span-2">
                            <span className="text-muted-foreground">Yield-adjusted unit cost</span>
                            <span className="font-medium">₱{standardBreakdown.unitCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-2 col-span-2">
                            <span className="text-muted-foreground">Expected yield</span>
                            <span className="font-medium">{standardBreakdown.yieldPercentage.toFixed(2)}% (factor {standardBreakdown.yieldFactor.toFixed(4)}) · batch × {standardBreakdown.baseQuantity}</span>
                        </div>
                    </div>

                    {/* Overhead Details */}
                    <div className="space-y-2.5">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Overhead Expenses</span>
                        <div className="grid grid-cols-2 gap-2 text-xs border rounded-lg bg-card p-3 shadow-xs">
                            <div className="flex justify-between gap-2 border-b pb-1 col-span-2">
                                <span className="text-muted-foreground">Custom Manufacturing Overhead (included in COGS):</span>
                                <span className="font-medium text-foreground shrink-0">
                                    ₱{standardOverheads.customOverhead.toFixed(2)}
                                </span>
                            </div>
                            {standardOverheads.items.map((item) => (
                                <div key={item.id} className="flex justify-between border-b pb-1">
                                    <span className="text-muted-foreground truncate pr-1" title={item.overheadName}>
                                        {item.overheadName}:
                                    </span>
                                    <span className="font-medium text-foreground shrink-0">
                                        ₱{Number(item.amount).toFixed(2)}
                                    </span>
                                </div>
                            ))}
                            {standardOverheads.items.length === 0 && (
                                <div className="col-span-2 text-center text-muted-foreground py-2">
                                    No additional overhead variables registered.
                                </div>
                            )}
                            <div className="flex justify-between gap-2 border-t pt-2 col-span-2">
                                <span className="text-muted-foreground">Additional Operating Overhead (excluded from COGS):</span>
                                <span className="font-medium text-foreground shrink-0">
                                    ₱{standardOverheads.additionalOperatingOverhead.toFixed(2)}
                                </span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-xs font-semibold px-1">
                            <span className="text-muted-foreground">Total Overhead Expenses:</span>
                            <span className="text-foreground font-bold">₱{standardOverheads.totalOverheadExpenses.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Bottom Line Net Profit */}
                    <div className={`rounded-xl border p-4 flex items-center justify-between shadow-xs ${
                        standardNetProfit >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-destructive/5 border-destructive/20"
                    }`}>
                        <div>
                          <div className="text-xs font-bold text-muted-foreground uppercase">Net Profit Bottom Line (margin on sales)</div>
                          <div className={`text-xl font-extrabold tracking-tight ${standardNetProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                              ₱{standardNetProfit.toFixed(2)} ({standardPrice > 0 ? `${standardNetMarginPercent.toFixed(1)}%` : "N/A"})
                          </div>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
                            standardNetProfit >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive animate-pulse"
                        }`}>
                            {standardNetProfit >= 0 ? "Optimal Margin" : "Net Loss Alert"}
                        </span>
                    </div>
                </div>
            </div>

            {/* What-If Simulator Sandbox */}
            <div className="space-y-6 rounded-xl border bg-card p-5 shadow-sm text-foreground">
                <div className="flex items-center justify-between border-b pb-3">
                    <div>
                        <h3 className="text-base font-bold flex items-center gap-1.5">
                            <Sliders className="h-4 w-4 text-amber-500" />
                            What-If Simulator Sandbox
                        </h3>
                        <p className="text-xs text-muted-foreground">Simulate yield drops and override material costs.</p>
                    </div>
                    <button 
                        onClick={() => {
                            setSimulationYield(selectedProduct.expectedYieldPercent);
                            setSimulationTargetPrice(selectedProduct.targetSellingPrice);
                            const initialPrices: Record<string, number> = {};
                            editedBOM.forEach(item => {
                                initialPrices[item.id] = item.landedCost;
                            });
                            setSimulationPriceOverrides(initialPrices);
                            toast.success("Simulation parameters reset");
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border bg-background hover:bg-muted text-muted-foreground"
                        title="Reset Simulation"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                </div>

                {/* Yield loss slider */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-muted-foreground">Simulate Yield Drop</span>
                        <span className="font-bold text-amber-600">{Number(simulationYield).toFixed(1)}%</span>
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
                        <span className="font-bold text-blue-600">₱{Number(simulatedForexRate).toFixed(2)}</span>
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
                                <span className="font-semibold text-foreground">₱{simulatedCogs.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs font-bold text-primary">
                                <span>Simulated Gross Margin (on sales):</span>
                                <span>₱{simulatedGrossProfit.toFixed(2)} ({simulationTargetPrice > 0 ? `${simulatedGrossMarginPercent.toFixed(1)}%` : "N/A"})</span>
                            </div>
                            <div className="flex justify-between items-center text-xs border-b pb-2">
                                <span>Simulated Overhead Expenses:</span>
                                <span className="font-semibold text-muted-foreground">₱{simulatedOverheads.totalOverheadExpenses.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Custom overhead included in COGS:</span>
                                <span className="font-semibold text-muted-foreground">₱{simulatedOverheads.customOverhead.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Additional overhead excluded from COGS:</span>
                                <span className="font-semibold text-muted-foreground">₱{simulatedOverheads.additionalOperatingOverhead.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Simulated batch COGS:</span>
                                <span className="font-semibold text-muted-foreground">₱{simulatedBreakdown.batchCost.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm border-t pt-2 mt-1">
                                <span className="font-extrabold text-foreground">Simulated Net Profit (margin on sales):</span>
                                <span className={`font-extrabold text-sm ${
                                    isLow ? "text-destructive" : "text-emerald-600"
                                }`}>
                                    ₱{simProfit.toFixed(2)} ({simulationTargetPrice > 0 ? `${simulatedNetMarginPercent.toFixed(1)}%` : "N/A"})
                                </span>
                            </div>
                        </div>
                    );
                })()}

                {/* Freeze / Save Quotation Trigger */}
                <button
                    onClick={() => setIsQuoteModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 text-xs font-bold shadow-md hover:bg-primary/95 transition-all mt-4"
                >
                    📁 Freeze & Save Quotation
                </button>
            </div>

            {/* Save Quotation Modal */}
            {isQuoteModalOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-card border rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200 p-6 space-y-4 text-foreground">
                        <div>
                            <h3 className="text-base font-bold text-foreground">Freeze Cost Simulation</h3>
                            <p className="text-xs text-muted-foreground">This saves a snapshot of the current what-if sandbox costs for client pricing negotiation.</p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Quote Number (Unique)</label>
                                <input
                                    type="text"
                                    value={quoteNumber}
                                    onChange={e => setQuoteNumber(e.target.value)}
                                    className="w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Customer Account</label>
                                <select
                                    value={selectedCustomerId}
                                    onChange={e => setSelectedCustomerId(e.target.value)}
                                    className="w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
                                >
                                    <option value="">-- Select Customer --</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.customer_name} ({c.customer_code})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Remarks / Negotiation Notes</label>
                                <textarea
                                    rows={3}
                                    value={remarks}
                                    onChange={e => setRemarks(e.target.value)}
                                    placeholder="e.g. Special promo pricing for Q3 volume purchase..."
                                    className="w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
                                />
                            </div>

                            {/* Summary review */}
                            <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-1.5 border">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Simulated Cost:</span>
                                    <span className="font-semibold text-foreground">₱{simulatedCogs.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Agreed Selling Price:</span>
                                    <span className="font-semibold text-primary">₱{simulationTargetPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-t pt-1.5 mt-1">
                                    <span className="font-bold">Estimated Margin:</span>
                                    <span className={`font-bold ${simulationTargetPrice - simulatedCogs >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                        ₱{(simulationTargetPrice - simulatedCogs).toFixed(2)} ({simulatedNetMarginPercent.toFixed(1)}%)
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-3 border-t">
                            <button
                                onClick={() => setIsQuoteModalOpen(false)}
                                className="px-4 py-2 border rounded text-xs font-semibold hover:bg-muted text-muted-foreground"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveQuotation}
                                disabled={isSavingQuote}
                                className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded text-xs hover:bg-primary/95 disabled:opacity-50"
                            >
                                {isSavingQuote ? "Freezing..." : "Confirm & Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
