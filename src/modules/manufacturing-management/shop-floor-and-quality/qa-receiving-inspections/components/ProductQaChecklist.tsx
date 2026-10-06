import { AlertCircle, CheckCircle2, FlaskConical, Loader2 } from "lucide-react";
import { evaluateQaReading } from "@/app/api/manufacturing/qa/_purchase-specification-domain";
import type { QaSpecificationLoadState } from "../types";

interface ProductQaChecklistProps {
    lineId: number;
    loadState: QaSpecificationLoadState | undefined;
    readings: Record<number, string>;
    onReadingChange: (lineId: number, specId: number, value: string) => void;
    readOnly: boolean;
}

function targetLabel(specification: QaSpecificationLoadState["specifications"][number]): string {
    if (specification.parameter.dataType === "Numeric") {
        const unit = specification.parameter.unitOfMeasure ? ` ${specification.parameter.unitOfMeasure}` : "";
        if (specification.targetMin !== null && specification.targetMax !== null) {
            return `${specification.targetMin} to ${specification.targetMax}${unit}`;
        }
        if (specification.targetMin !== null) return `Minimum ${specification.targetMin}${unit}`;
        return `Maximum ${specification.targetMax}${unit}`;
    }
    if (specification.parameter.dataType === "Boolean") {
        return `Expected: ${specification.expectedText === "true" ? "Yes" : "No"}`;
    }
    return `Expected: ${specification.expectedText}`;
}

export default function ProductQaChecklist({
    lineId,
    loadState,
    readings,
    onReadingChange,
    readOnly
}: ProductQaChecklistProps) {
    if (!loadState || loadState.status === "loading") {
        return (
            <div className="border-t pt-3 flex items-center gap-2 text-[10px] text-muted-foreground" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading applicable QA specifications...
            </div>
        );
    }

    if (loadState.status === "error") {
        return (
            <div className="border-t pt-3 flex items-start gap-2 text-[10px] text-red-600" role="alert">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span><strong>QA checklist unavailable.</strong> {loadState.error}</span>
            </div>
        );
    }

    if (loadState.specifications.length === 0) {
        return (
            <div className="border-t pt-3 text-[10px] text-muted-foreground">
                No dynamic QA specifications are configured for this product. Disposition will be derived from the accepted and rejected quantities.
            </div>
        );
    }

    return (
        <section className="border-t pt-3 space-y-3" aria-label="Product QA specifications">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <FlaskConical className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h4 className="text-[10px] font-extrabold text-foreground">Dynamic QA Checklist</h4>
                        <p className="text-[9px] text-muted-foreground">Record the actual reading for every applicable specification.</p>
                    </div>
                </div>
                <span className="text-[9px] font-bold text-muted-foreground whitespace-nowrap">
                    {loadState.specifications.length} {loadState.specifications.length === 1 ? "check" : "checks"}
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-3">
                {loadState.specifications.map(specification => {
                    const reading = readings[specification.specId] ?? "";
                    const evaluation = evaluateQaReading(specification, reading);
                    const inputId = `qa-reading-${lineId}-${specification.specId}`;
                    const statusClass = evaluation.status === "passed"
                        ? "text-emerald-600"
                        : evaluation.status === "failed"
                            ? "text-red-600"
                            : "text-muted-foreground";

                    return (
                        <div key={specification.specId} className="min-w-0 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                                <label htmlFor={inputId} className="text-[10px] font-bold text-foreground leading-4 min-w-0">
                                    {specification.parameter.parameterName}
                                </label>
                                <span className={specification.isCritical
                                    ? "text-[8px] font-extrabold uppercase text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 whitespace-nowrap"
                                    : "text-[8px] font-extrabold uppercase text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 whitespace-nowrap"
                                }>
                                    {specification.isCritical ? "Critical" : "Standard"}
                                </span>
                            </div>
                            <p className="text-[9px] text-muted-foreground">{targetLabel(specification)}</p>

                            {specification.parameter.dataType === "Numeric" && (
                                <div className="flex items-center">
                                    <input
                                        id={inputId}
                                        type="number"
                                        step="any"
                                        value={reading}
                                        onChange={event => onReadingChange(lineId, specification.specId, event.target.value)}
                                        disabled={readOnly}
                                        placeholder="Enter reading"
                                        className="min-w-0 flex-1 h-10 bg-background border text-foreground rounded-l-lg px-3 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none"
                                    />
                                    {specification.parameter.unitOfMeasure && (
                                        <span className="h-10 px-3 border border-l-0 rounded-r-lg bg-muted/40 text-[10px] font-bold text-muted-foreground flex items-center">
                                            {specification.parameter.unitOfMeasure}
                                        </span>
                                    )}
                                </div>
                            )}

                            {specification.parameter.dataType === "Boolean" && (
                                <div id={inputId} className="grid grid-cols-2 h-10 border rounded-lg overflow-hidden" role="group" aria-label={`${specification.parameter.parameterName} reading`}>
                                    {[["true", "Yes"], ["false", "No"]].map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            aria-pressed={reading === value}
                                            onClick={() => onReadingChange(lineId, specification.specId, value)}
                                            disabled={readOnly}
                                            className={`text-xs font-bold transition-colors ${reading === value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {specification.parameter.dataType === "Text" && (
                                <input
                                    id={inputId}
                                    type="text"
                                    value={reading}
                                    onChange={event => onReadingChange(lineId, specification.specId, event.target.value)}
                                    disabled={readOnly}
                                    placeholder="Enter observed value"
                                    className="w-full h-10 bg-background border text-foreground rounded-lg px-3 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none"
                                />
                            )}

                            <div className={`flex items-center gap-1 text-[9px] font-bold ${statusClass}`} aria-live="polite">
                                {evaluation.status === "passed" && <CheckCircle2 className="h-3 w-3" />}
                                {evaluation.status === "failed" && <AlertCircle className="h-3 w-3" />}
                                <span>{evaluation.status === "incomplete" ? "Reading required" : evaluation.status === "passed" ? "Within specification" : "Outside specification"}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
