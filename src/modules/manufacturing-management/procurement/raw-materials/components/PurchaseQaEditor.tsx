import { Plus, Trash2 } from "lucide-react";
import type {
    PurchaseQaConfig,
    PurchaseQaParameter,
    PurchaseQaSpecificationInput
} from "../types/raw-materials.types";

interface PurchaseQaEditorProps {
    config: PurchaseQaConfig;
    parameters: PurchaseQaParameter[];
    loading: boolean;
    error?: string | null;
    onChange: (config: PurchaseQaConfig) => void;
}

function parameterFor(specification: PurchaseQaSpecificationInput, parameters: PurchaseQaParameter[]) {
    return parameters.find(parameter => parameter.parameterId === specification.parameterId);
}

export function PurchaseQaEditor({ config, parameters, loading, error, onChange }: PurchaseQaEditorProps) {
    const usedParameterIds = new Set(config.specifications.map(specification => specification.parameterId));
    const availableParameters = parameters.filter(parameter => !usedParameterIds.has(parameter.parameterId));
    const hasValidationError = Boolean(error);

    const updateSpecification = (index: number, patch: Partial<PurchaseQaSpecificationInput>) => {
        onChange({
            ...config,
            specifications: config.specifications.map((specification, specificationIndex) =>
                specificationIndex === index ? { ...specification, ...patch } : specification
            )
        });
    };

    const addSpecification = () => {
        const parameter = availableParameters[0];
        if (!parameter) return;
        onChange({
            inspectionRequired: true,
            specifications: [
                ...config.specifications,
                {
                    parameterId: parameter.parameterId,
                    targetMin: null,
                    targetMax: null,
                    expectedText: parameter.dataType === "Boolean" ? "true" : null,
                    isCritical: false
                }
            ]
        });
    };

    return (
        <div className={`space-y-2 rounded-xl border bg-muted/10 p-3 ${hasValidationError ? "border-rose-500" : ""}`}>
            <div className="flex items-center justify-between gap-2">
                <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-foreground">PO Inspection QA</p>
                    <p className="text-[10px] text-muted-foreground">The checklist is applied during PO receiving.</p>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold">
                    <input
                        type="checkbox"
                        checked={config.inspectionRequired}
                        onChange={event => onChange({
                            inspectionRequired: event.target.checked,
                            specifications: event.target.checked ? config.specifications : []
                        })}
                        className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    Inspection Required
                </label>
            </div>

            {error && <p className="text-[10px] text-rose-600">{error}</p>}

            {!config.inspectionRequired ? (
                <p className="text-[10px] italic text-muted-foreground">No purchase receiving checklist will be required.</p>
            ) : (
                <div className="space-y-2">
                    {config.specifications.map((specification, index) => {
                        const parameter = parameterFor(specification, parameters);
                        return (
                            <div key={specification.specId || `${specification.parameterId}-${index}`} className={`space-y-2 rounded-lg border bg-background p-2 ${hasValidationError ? "border-rose-500/70" : ""}`}>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
                                    <label className="space-y-1">
                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">QA Parameter *</span>
                                        <select
                                            value={String(specification.parameterId)}
                                            onChange={event => updateSpecification(index, { parameterId: Number(event.target.value) })}
                                            className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
                                        >
                                            {parameters
                                                .filter(option => option.parameterId === specification.parameterId || !usedParameterIds.has(option.parameterId))
                                                .map(option => (
                                                    <option key={option.parameterId} value={option.parameterId}>{option.parameterName}</option>
                                                ))}
                                        </select>
                                        {parameter?.description && <span className="block text-[9px] text-muted-foreground">{parameter.description}</span>}
                                    </label>

                                    {parameter?.dataType === "Numeric" ? (
                                        <div className="grid grid-cols-2 gap-1">
                                            <label className="space-y-1">
                                                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Minimum</span>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={specification.targetMin ?? ""}
                                                    onChange={event => updateSpecification(index, { targetMin: event.target.value === "" ? null : Number(event.target.value) })}
                                                    className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
                                                />
                                            </label>
                                            <label className="space-y-1">
                                                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Maximum</span>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={specification.targetMax ?? ""}
                                                    onChange={event => updateSpecification(index, { targetMax: event.target.value === "" ? null : Number(event.target.value) })}
                                                    className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
                                                />
                                            </label>
                                        </div>
                                    ) : parameter?.dataType === "Boolean" ? (
                                        <label className="space-y-1">
                                            <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Expected</span>
                                            <select
                                                value={specification.expectedText || "true"}
                                                onChange={event => updateSpecification(index, { expectedText: event.target.value })}
                                                className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
                                            >
                                                <option value="true">Yes</option>
                                                <option value="false">No</option>
                                            </select>
                                        </label>
                                    ) : (
                                        <label className="space-y-1">
                                            <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Expected Value</span>
                                            <input
                                                type="text"
                                                value={specification.expectedText || ""}
                                                onChange={event => updateSpecification(index, { expectedText: event.target.value })}
                                                className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
                                            />
                                        </label>
                                    )}

                                    <div className="flex items-center justify-between gap-2">
                                        <label className="flex cursor-pointer items-center gap-1 text-[10px] font-semibold">
                                            <input
                                                type="checkbox"
                                                checked={specification.isCritical}
                                                onChange={event => updateSpecification(index, { isCritical: event.target.checked })}
                                                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                                            />
                                            Critical
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => onChange({ ...config, specifications: config.specifications.filter((_, specificationIndex) => specificationIndex !== index) })}
                                            className="rounded-md p-1 text-rose-600 hover:bg-rose-500/10"
                                            aria-label="Remove QA specification"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <button
                        type="button"
                        onClick={addSpecification}
                        disabled={loading || availableParameters.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-[10px] font-bold text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        {loading ? "Loading QA parameters..." : "Add QA check"}
                    </button>
                    {!loading && parameters.length === 0 && <p className="text-[10px] text-rose-600">No purchase QA parameters are available.</p>}
                </div>
            )}
        </div>
    );
}
