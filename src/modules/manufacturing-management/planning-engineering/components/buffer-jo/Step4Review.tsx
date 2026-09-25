/* eslint-disable */
import React from "react";
import { formatProductionValue } from "../../utils/production-timing";
import {
    formatManufacturingUnitCostForDisplay,
    getFactoryOverheadBasisLabel,
} from "../../utils/cogs-helper";
import type {
    ReleaseSummaryComponent,
    ReleaseSummaryFinancials,
    ReleaseSummaryRoutingStep,
} from "../../utils/release-summary-print";

export interface Step4ReviewProps {
    joNumber: string;
    productName: string;
    recipeVersion: string;
    recipeVersionId?: number | string | null;
    branchName: string;
    targetQuantity: number;
    uomLabel: string;
    plannedDate: string;
    dueDate: string;
    shiftHoursLabel: string;
    targetDurationHours: number;
    shortfallCount: number;
    allChecksPassed: boolean;
    remarks: string;
    components: ReleaseSummaryComponent[];
    routingSteps: ReleaseSummaryRoutingStep[];
    financials: ReleaseSummaryFinancials | null;
}

export function Step4Review({
    joNumber,
    productName,
    recipeVersion,
    recipeVersionId,
    branchName,
    targetQuantity,
    uomLabel,
    plannedDate,
    dueDate,
    shiftHoursLabel,
    targetDurationHours,
    shortfallCount,
    allChecksPassed,
    remarks,
    components,
    routingSteps,
    financials
}: Step4ReviewProps) {
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                {/* 1. General Job Order Parameters */}
                <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 lg:col-start-1 lg:row-start-1" aria-label="General Job Order Parameters">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-foreground border-b border-border pb-2 mb-2">
                        General Job Order Parameters
                    </h4>
                    <dl className="space-y-1.5 text-[11px]">
                        {[
                            { label: "Job Order Reference", value: <span className="font-mono font-bold text-foreground">{joNumber}</span> },
                            { label: "Product Name", value: productName || "N/A" },
                            { label: "Recipe Version", value: `${recipeVersion || "Default"}${recipeVersionId ? ` (#${recipeVersionId})` : ""}` },
                            { label: "Target Branch", value: branchName || "N/A" },
                            { label: "Target Quantity", value: `${targetQuantity.toLocaleString()} ${uomLabel}` },
                            { label: "Planned Date / Due", value: `${plannedDate || "Not set"} / ${dueDate || "Not set"}` },
                            { label: "Target Duration", value: `${formatProductionValue(targetDurationHours)} hrs (Shift: ${shiftHoursLabel} hrs)` },
                            { label: "Linked Sales Orders", value: "Buffer stock (no linked orders)" }
                        ].map((row) => (
                            <div key={row.label} className="flex min-w-0 items-start justify-between gap-3">
                                <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                                <dd className="min-w-0 max-w-[65%] break-words text-right font-semibold text-foreground">{row.value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                {/* 2. Remarks and readiness context */}
                <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 lg:col-start-1 lg:row-start-2" aria-label="Remarks and Order Context">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-foreground border-b border-border pb-2 mb-2">
                        Remarks / Order Context
                    </h4>
                    <div className="space-y-1.5 text-[11px] text-foreground">
                        <p>Buffer replenishment run initialized with no linked sales orders.</p>
                        <p className={allChecksPassed ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                            {allChecksPassed
                                ? "All component allocations passed. Ready for picking."
                                : `${shortfallCount} component shortfall${shortfallCount === 1 ? "" : "s"} detected. Child job orders / procurement requests will be generated on release.`}
                        </p>
                        {remarks.trim() && (
                            <p className="border-t border-border/60 pt-1.5 text-foreground">
                                <span className="font-semibold">Planning Remarks:</span>{" "}
                                <span className="italic">&quot;{remarks}&quot;</span>
                            </p>
                        )}
                    </div>
                </section>

                {/* 3. Component Sufficiency Summary */}
                <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 lg:col-start-2 lg:row-start-1" aria-label="Component Sufficiency Summary">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-foreground border-b border-border pb-2 mb-2">
                        Component Sufficiency Summary
                    </h4>
                    <div className="max-h-[260px] overflow-x-hidden overflow-y-auto pr-0.5">
                        <table className="w-full table-fixed text-[10px]">
                            <thead className="sticky top-0 bg-card">
                                <tr className="text-left text-[9px] uppercase tracking-wider text-muted-foreground">
                                    <th className="w-[48%] py-1.5 pr-2 font-bold">Component</th>
                                    <th className="w-[18%] py-1.5 pr-2 text-right font-bold">Req. Qty</th>
                                    <th className="w-[18%] py-1.5 pr-2 text-right font-bold">Available</th>
                                    <th className="w-[16%] py-1.5 text-right font-bold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {components.map((component, index) => (
                                    <tr key={`${component.name}-${index}`}>
                                        <td className="min-w-0 break-words py-1.5 pr-2">
                                            <div className="break-words font-bold text-foreground">{component.name}</div>
                                            {component.code && <div className="break-words text-[9px] text-muted-foreground">{component.code}</div>}
                                        </td>
                                        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                                            {component.needed.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="font-normal text-muted-foreground">{component.uom}</span>
                                        </td>
                                        <td className="py-1.5 pr-2 text-right text-muted-foreground tabular-nums">
                                            {component.available.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="font-normal">{component.uom}</span>
                                        </td>
                                        <td className="py-1.5 text-right">
                                            {component.sufficient ? (
                                                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">Sufficient</span>
                                            ) : (
                                                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-400">Insufficient</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {components.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="py-3 text-center text-muted-foreground">No raw material requirements specified.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* 4. Routing Steps & Financial Sanity Check */}
                <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 lg:col-start-2 lg:row-start-2" aria-label="Routing Steps and Financial Sanity Check">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-foreground border-b border-border pb-2 mb-2">
                        Routing Steps &amp; Financial Sanity Check
                    </h4>
                    <div className="space-y-1.5">
                        {routingSteps.map((step) => (
                            <div key={`route-${step.sequence}-${step.operation}`} className="flex items-start justify-between gap-2 text-[11px]">
                                <div className="min-w-0">
                                    <div className="truncate font-bold text-foreground">Step {step.sequence}: {step.operation}</div>
                                    <div className="flex min-w-0 flex-wrap items-center gap-x-1 text-[9px] text-muted-foreground">
                                        <span className="shrink-0 font-semibold">Op {step.sequence} ({step.operators.length > 0 ? "Assigned" : "Unassigned"})</span>
                                        <span className="min-w-0 break-words">{step.workCenter}</span>
                                        {step.operators.length > 0 && <span className="min-w-0 break-words">· {step.operators.join(", ")}</span>}
                                    </div>
                                </div>
                                <span className="shrink-0 whitespace-nowrap font-mono font-semibold text-foreground">{formatProductionValue(step.hours)} hrs</span>
                            </div>
                        ))}
                        {routingSteps.length === 0 && (
                            <p className="text-[10px] text-muted-foreground">No routing steps defined.</p>
                        )}
                    </div>
                    <div className="mt-2 space-y-1 border-t border-border pt-2 text-[11px]">
                        {financials ? (
                            <>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Direct Materials / unit</span>
                                    <span className="font-mono font-semibold text-foreground">₱{formatProductionValue(financials.materials)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Direct Labor / unit</span>
                                    <span className="font-mono font-semibold text-foreground">₱{formatProductionValue(financials.directLabor)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Machine &amp; Routing Overhead / unit</span>
                                    <span className="font-mono font-semibold text-foreground">₱{formatProductionValue(financials.machineOverhead)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        Configured Factory Overhead / unit
                                        <span className="ml-1 text-[10px]">({financials.configuredOverheadBasis})</span>
                                    </span>
                                    <span className="font-mono font-semibold text-foreground">₱{formatProductionValue(financials.configuredOverhead)}</span>
                                </div>
                                <div className="flex justify-between border-t border-border/60 pt-1">
                                    <span className="font-bold text-foreground">Est. Unit COGS (Base)</span>
                                    <span className="font-mono font-bold text-foreground">₱{formatManufacturingUnitCostForDisplay(financials.baseCogs)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-bold text-sky-700 dark:text-sky-400">Est. Unit COGS (Yield-Adjusted)</span>
                                    <span className="font-mono font-black text-sky-700 dark:text-sky-400">₱{formatManufacturingUnitCostForDisplay(financials.adjustedCogs)}</span>
                                </div>
                            </>
                        ) : (
                            <p className="text-[10px] text-muted-foreground">Costing data unavailable.</p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
