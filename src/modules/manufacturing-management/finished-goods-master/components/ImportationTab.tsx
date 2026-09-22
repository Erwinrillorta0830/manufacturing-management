import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface ImportationTabProps {
    importNetWeight: number;
    setImportNetWeight: React.Dispatch<React.SetStateAction<number>>;
    importPriceUsd: number;
    setImportPriceUsd: React.Dispatch<React.SetStateAction<number>>;
    importFxRate: number;
    setImportFxRate: React.Dispatch<React.SetStateAction<number>>;
    importDensityFactor: number;
    setImportDensityFactor: React.Dispatch<React.SetStateAction<number>>;
    importThcFee: number;
    setImportThcFee: React.Dispatch<React.SetStateAction<number>>;
    importStorageFee: number;
    setImportStorageFee: React.Dispatch<React.SetStateAction<number>>;
    importCustomSop: number;
    setImportCustomSop: React.Dispatch<React.SetStateAction<number>>;
    importTruckingFee: number;
    setImportTruckingFee: React.Dispatch<React.SetStateAction<number>>;
    importOtherPortFees: number;
    setImportOtherPortFees: React.Dispatch<React.SetStateAction<number>>;
    importCustomDuty: number;
    setImportCustomDuty: React.Dispatch<React.SetStateAction<number>>;
    importVat: number;
    setImportVat: React.Dispatch<React.SetStateAction<number>>;
    importIpf: number;
    setImportIpf: React.Dispatch<React.SetStateAction<number>>;
    importForeignPeso: number;
    importTotalShippingPort: number;
    importTotalDutiesTaxes: number;
    importTotalLandedCost: number;
    importLandedCostPerKg: number;
    importLandedCostPerL: number;
    importTotalForCogs: number;
    importCogsPerKg: number;
    importCogsPerL: number;
    handleApplyImportLandedCost: () => void;
    automateCustoms: boolean;
    setAutomateCustoms: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ImportationTab: React.FC<ImportationTabProps> = ({
    importNetWeight,
    setImportNetWeight,
    importPriceUsd,
    setImportPriceUsd,
    importFxRate,
    setImportFxRate,
    importDensityFactor,
    setImportDensityFactor,
    importThcFee,
    setImportThcFee,
    importStorageFee,
    setImportStorageFee,
    importCustomSop,
    setImportCustomSop,
    importTruckingFee,
    setImportTruckingFee,
    importOtherPortFees,
    setImportOtherPortFees,
    importCustomDuty,
    setImportCustomDuty,
    importVat,
    setImportVat,
    importIpf,
    setImportIpf,
    importForeignPeso,
    importTotalShippingPort,
    importTotalDutiesTaxes,
    importTotalLandedCost,
    importLandedCostPerKg,
    importLandedCostPerL,
    importTotalForCogs,
    importCogsPerKg,
    importCogsPerL,
    handleApplyImportLandedCost,
    automateCustoms,
    setAutomateCustoms
}) => {
    return (
        <div className="grid gap-6 lg:grid-cols-2">
            {/* Column 1: Import Parameters */}
            <div className="space-y-6 rounded-xl border bg-card p-5 shadow-sm text-foreground">
                <div>
                    <h3 className="text-base font-bold">Importation Run Parameters</h3>
                    <p className="text-xs text-muted-foreground">Input supplier invoice and cargo receipt details.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Net Weight (KG)</label>
                        <input 
                            type="number"
                            value={importNetWeight}
                            onChange={e => setImportNetWeight(parseFloat(e.target.value) || 0)}
                            className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Price per KG (USD)</label>
                        <input 
                            type="number"
                            step="0.001"
                            value={importPriceUsd}
                            onChange={e => setImportPriceUsd(parseFloat(e.target.value) || 0)}
                            className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">FX Rate (USD to PHP)</label>
                        <input 
                            type="number"
                            step="0.01"
                            value={importFxRate}
                            onChange={e => setImportFxRate(parseFloat(e.target.value) || 0)}
                            className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Density Factor (KG/L)</label>
                        <input 
                            type="number"
                            step="0.001"
                            value={importDensityFactor}
                            onChange={e => setImportDensityFactor(parseFloat(e.target.value) || 1.0)}
                            className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground"
                        />
                    </div>
                </div>

                <div className="border-t pt-4">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Local Port & Shipping Fees (PHP)</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">THC Fee</label>
                            <input 
                                type="number"
                                value={importThcFee}
                                onChange={e => setImportThcFee(parseFloat(e.target.value) || 0)}
                                className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Storage Fee</label>
                            <input 
                                type="number"
                                value={importStorageFee}
                                onChange={e => setImportStorageFee(parseFloat(e.target.value) || 0)}
                                className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Custom Brokerage / SOP</label>
                            <input 
                                type="number"
                                value={importCustomSop}
                                onChange={e => setImportCustomSop(parseFloat(e.target.value) || 0)}
                                className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Trucking Fee</label>
                            <input 
                                type="number"
                                value={importTruckingFee}
                                onChange={e => setImportTruckingFee(parseFloat(e.target.value) || 0)}
                                className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-xs font-medium text-muted-foreground">Other Port Fees (Arrastre, Wharfage, Doc Stamps)</label>
                            <input 
                                type="number"
                                value={importOtherPortFees}
                                onChange={e => setImportOtherPortFees(parseFloat(e.target.value) || 0)}
                                disabled={automateCustoms}
                                className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground disabled:opacity-60 disabled:bg-muted/30 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <div className="space-y-0.5 max-w-[80%]">
                            <label className="text-xs font-bold text-foreground cursor-pointer select-none">
                                Automate Customs (BOC) Duties & Taxes
                            </label>
                            <p className="text-[10px] text-muted-foreground leading-normal">
                                Compute CUD, IPF/CSF, Custom Duty, and 12% Import VAT automatically based on Philippines BOC guidelines.
                            </p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={automateCustoms}
                            onClick={() => setAutomateCustoms(!automateCustoms)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                                automateCustoms ? "bg-primary" : "bg-muted"
                            }`}
                        >
                            <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                    automateCustoms ? "translate-x-5" : "translate-x-0"
                                }`}
                            />
                        </button>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Customs Duties & Taxes (PHP)</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">BOC Custom Duty</label>
                                <input 
                                    type="number"
                                    value={importCustomDuty}
                                    onChange={e => setImportCustomDuty(parseFloat(e.target.value) || 0)}
                                    disabled={automateCustoms}
                                    className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground disabled:opacity-60 disabled:bg-muted/30 disabled:cursor-not-allowed"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">BOC Import VAT (12%)</label>
                                <input 
                                    type="number"
                                    value={importVat}
                                    onChange={e => setImportVat(parseFloat(e.target.value) || 0)}
                                    disabled={automateCustoms}
                                    className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground disabled:opacity-60 disabled:bg-muted/30 disabled:cursor-not-allowed"
                                />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <label className="text-xs font-medium text-muted-foreground">Import Processing (IPF) & Container Security (CSF)</label>
                                <input 
                                    type="number"
                                    value={importIpf}
                                    onChange={e => setImportIpf(parseFloat(e.target.value) || 0)}
                                    disabled={automateCustoms}
                                    className="w-full rounded border px-3 py-1.5 text-sm bg-background text-foreground disabled:opacity-60 disabled:bg-muted/30 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Column 2: Calculated Cost Summary */}
            <div className="space-y-6 rounded-xl border bg-muted/10 p-5 text-foreground">
                <div>
                    <h3 className="text-base font-bold">Landed Cost Allocation Summary</h3>
                    <p className="text-xs text-muted-foreground">Proportional cost distributions and density conversions.</p>
                </div>

                <div className="space-y-4">
                    {/* Raw values rollup card */}
                    <div className="rounded-lg bg-card p-4 border space-y-2.5">
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                            <span>Invoice Weight (Volume Equivalent):</span>
                            <span className="font-semibold text-foreground">
                                {importNetWeight.toLocaleString()} KG ({(importNetWeight / importDensityFactor).toFixed(0).toLocaleString()} Liters)
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                            <span>Raw Invoice Value:</span>
                            <span className="font-semibold text-foreground">
                                ${(importNetWeight * importPriceUsd).toFixed(2).toLocaleString()} (₱{importForeignPeso.toFixed(2).toLocaleString()})
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground border-b pb-2">
                            <span>Shipping & Port Charges Subtotal:</span>
                            <span className="font-semibold text-foreground">₱{importTotalShippingPort.toFixed(2).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground border-b pb-2">
                            <span>Duties, VAT & Taxes Subtotal:</span>
                            <span className="font-semibold text-foreground">₱{importTotalDutiesTaxes.toFixed(2).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold pt-1 text-foreground border-b pb-3">
                            <span>Total Gross Landed Cost (TLC):</span>
                            <span className="text-sm text-foreground">₱{importTotalLandedCost.toFixed(2).toLocaleString()}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                            <div className="bg-muted/40 p-2 rounded flex flex-col justify-center">
                                <span className="text-muted-foreground text-[10px] uppercase font-bold">Gross Landed Cost / KG</span>
                                <span className="text-sm font-extrabold">₱{importLandedCostPerKg.toFixed(2)}</span>
                            </div>
                            <div className="bg-muted/40 p-2 rounded flex flex-col justify-center">
                                <span className="text-muted-foreground text-[10px] uppercase font-bold">Gross Landed Cost / Liter</span>
                                <span className="text-sm font-extrabold">₱{importLandedCostPerL.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* COGS Net values card */}
                    <div className="rounded-lg bg-emerald-500/5 p-4 border border-emerald-500/20 space-y-3">
                        <div>
                            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Cost of Goods Sold (COGS) Allocation</span>
                            <p className="text-[10px] text-emerald-700">VAT (₱{importVat.toFixed(2).toLocaleString()}) is deducted as input tax credit.</p>
                        </div>

                        <div className="flex justify-between items-center text-xs font-semibold text-emerald-800 border-b border-emerald-500/10 pb-2">
                            <span>Net COGS Valuation:</span>
                            <span className="text-sm font-bold">₱{importTotalForCogs.toFixed(2).toLocaleString()}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-card p-2.5 rounded border border-emerald-500/10 flex flex-col justify-center shadow-xs">
                                <span className="text-emerald-700 text-[10px] uppercase font-bold">COGS cost / KG</span>
                                <span className="text-sm font-extrabold text-emerald-600">₱{importCogsPerKg.toFixed(4)}</span>
                            </div>
                            <div className="bg-card p-2.5 rounded border border-emerald-500/20 flex flex-col justify-center shadow-xs">
                                <span className="text-emerald-800 text-[10px] uppercase font-bold">COGS Cost / Liter</span>
                                <span className="text-base font-extrabold text-emerald-700">₱{importCogsPerL.toFixed(4)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Apply action container */}
                    <div className="rounded-xl border bg-amber-500/5 border-amber-500/10 p-4 space-y-3">
                        <div className="flex items-start gap-2.5">
                            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-xs font-bold text-amber-900">Apply to What-If Simulator Overrides</h4>
                                <p className="text-[10px] text-amber-700 mt-0.5 leading-relaxed">
                                    Clicking below will inject the calculated COGS cost per Liter (₱{importCogsPerL.toFixed(4)}/L) directly as a price override for all Soya, Canola, or Palm Olein raw material components in the What-If sandbox tab.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleApplyImportLandedCost}
                            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 text-xs shadow-xs transition-colors"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Apply Landed Cost to Simulation Overrides
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
