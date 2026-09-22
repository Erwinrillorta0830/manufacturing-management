/* eslint-disable */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Search, Check, Shield, AlertCircle, Save } from "lucide-react";
import { QATemplate, QAParameter, Unit } from "../types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface QATemplatesTabProps {
    qaTemplates: QATemplate[];
    units: Unit[];
    handleAddQATemplate: (template: Omit<QATemplate, "template_id">) => Promise<QATemplate | undefined>;
    handleSaveQATemplate: (templateId: number, template: Partial<QATemplate>) => Promise<QATemplate | undefined>;
}

export const QATemplatesTab: React.FC<QATemplatesTabProps> = ({
    qaTemplates,
    units,
    handleAddQATemplate,
    handleSaveQATemplate
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

    // Active edit states
    const [templateName, setTemplateName] = useState("");
    const [description, setDescription] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [parameters, setParameters] = useState<QAParameter[]>([]);

    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [saving, setSaving] = useState(false);

    // Filter templates
    const filteredTemplates = useMemo(() => {
        return qaTemplates.filter(t =>
            t.template_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.description || "").toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [qaTemplates, searchQuery]);

    // Select the first template if none selected and templates exist
    useEffect(() => {
        if (!selectedTemplateId && filteredTemplates.length > 0 && !isCreatingNew) {
            setSelectedTemplateId(filteredTemplates[0].template_id);
        }
    }, [filteredTemplates, selectedTemplateId, isCreatingNew]);

    // Update form when selected template changes
    useEffect(() => {
        if (isCreatingNew) return;

        const current = qaTemplates.find(t => t.template_id === selectedTemplateId);
        if (current) {
            setTemplateName(current.template_name);
            setDescription(current.description || "");
            setIsActive(current.is_active !== false);
            setParameters(current.parameters || []);
        } else {
            setTemplateName("");
            setDescription("");
            setIsActive(true);
            setParameters([]);
        }
    }, [selectedTemplateId, qaTemplates, isCreatingNew]);

    const handleCreateNewClick = () => {
        setIsCreatingNew(true);
        setSelectedTemplateId(null);
        setTemplateName("New QA Template");
        setDescription("");
        setIsActive(true);
        setParameters([]);
    };

    const handleCancelCreate = () => {
        setIsCreatingNew(false);
        if (filteredTemplates.length > 0) {
            setSelectedTemplateId(filteredTemplates[0].template_id);
        }
    };

    // Parameters editing
    const handleAddParam = () => {
        const newParam: QAParameter = {
            parameter_id: -Math.floor(Math.random() * 1000000),
            template_id: selectedTemplateId || 0,
            test_name: "",
            test_type: "Text",
            min_value: null,
            max_value: null,
            target_value: null,
            uom_id: null,
            is_critical: false
        };
        setParameters(prev => [...prev, newParam]);
    };

    const handleDeleteParam = (paramId: number) => {
        setParameters(prev => prev.filter(p => p.parameter_id !== paramId));
    };

    const handleUpdateParam = (paramId: number, field: keyof QAParameter, value: unknown) => {
        setParameters(prev => prev.map(p => {
            if (p.parameter_id !== paramId) return p;
            const updated = { ...p, [field]: value };

            // Clean up invalid properties depending on type
            if (field === "test_type") {
                if (value !== "Numeric") {
                    updated.min_value = null;
                    updated.max_value = null;
                }
                if (value === "Numeric") {
                    updated.target_value = null;
                }
            }
            return updated;
        }));
    };

    const handleSaveClick = async () => {
        if (!templateName.trim()) {
            toast.error("Template name cannot be empty.");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                template_name: templateName.trim(),
                description: description.trim() || null,
                is_active: isActive,
                parameters: parameters.map(p => ({
                    parameter_id: p.parameter_id < 0 ? undefined : p.parameter_id,
                    test_name: p.test_name.trim(),
                    test_type: p.test_type,
                    min_value: p.min_value,
                    max_value: p.max_value,
                    target_value: p.target_value,
                    uom_id: p.uom_id || null,
                    is_critical: !!p.is_critical
                })) as any
            };

            if (isCreatingNew) {
                const res = await handleAddQATemplate(payload);
                if (res) {
                    setIsCreatingNew(false);
                    setSelectedTemplateId(res.template_id);
                }
            } else if (selectedTemplateId) {
                await handleSaveQATemplate(selectedTemplateId, payload);
            }
        } catch (e) {
            console.error("Save Template error:", e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left side list */}
            <div className="lg:col-span-1 rounded-xl border bg-card text-card-foreground p-4 flex flex-col gap-4 border-muted/50">
                <div className="flex justify-between items-center">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">QA Checklist Templates</h4>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleCreateNewClick}
                        className="h-8 w-8 text-primary hover:bg-primary/10 rounded-md"
                        title="Create QA Template"
                    >
                        <Plus className="h-4.5 w-4.5" />
                    </Button>
                </div>

                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground opacity-70" />
                    <input
                        type="text"
                        placeholder="Search templates..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 rounded-lg border border-muted bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 max-h-[450px]">
                    {filteredTemplates.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No templates found.</p>
                    ) : (
                        filteredTemplates.map(t => {
                            const isSelected = t.template_id === selectedTemplateId;
                            return (
                                <button
                                    key={t.template_id}
                                    onClick={() => {
                                        setIsCreatingNew(false);
                                        setSelectedTemplateId(t.template_id);
                                    }}
                                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex flex-col gap-1 ${isSelected
                                            ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                                            : "hover:bg-muted/10 text-foreground"
                                        }`}
                                >
                                    <div className="flex justify-between items-center w-full">
                                        <span className="truncate">{t.template_name}</span>
                                        {!t.is_active && (
                                            <span className="text-[9px] uppercase font-bold text-destructive">Inactive</span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground truncate font-normal">
                                        {t.description || "No description provided."}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right side form */}
            <div className="lg:col-span-3 rounded-xl border bg-card text-card-foreground p-5 flex flex-col gap-5 border-muted/50">
                <div className="flex justify-between items-center border-b border-muted/50 pb-3">
                    <div>
                        <h3 className="text-base font-bold text-foreground">
                            {isCreatingNew ? "Create Quality inspection Template" : "Template Blueprint Specifications"}
                        </h3>
                        <p className="text-xs text-muted-foreground">Setup target thresholds and tolerance limits for each step parameter validation checklist.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isCreatingNew && (
                            <Button
                                onClick={handleCancelCreate}
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground rounded-lg"
                            >
                                Cancel
                            </Button>
                        )}
                        <Button
                            onClick={handleSaveClick}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 h-8 text-xs rounded-lg"
                        >
                            {saving ? (
                                <div className="h-3 w-3 animate-spin border border-current border-t-transparent rounded-full" />
                            ) : (
                                <Save className="h-3.5 w-3.5" />
                            )}
                            Save Template
                        </Button>
                    </div>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Template Name</label>
                        <input
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-muted bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="e.g. Acid wash & clean chemical parameters"
                        />
                    </div>
                    <div className="space-y-1 flex flex-col justify-end">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Status</label>
                        <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="h-4 w-4 rounded border-muted bg-background text-primary focus:ring-0"
                            />
                            Active &amp; Available for Routings
                        </label>
                    </div>
                    <div className="md:col-span-3 space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full h-16 p-2.5 rounded-lg border border-muted bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                            placeholder="Detail what inspections this template is designed for..."
                        />
                    </div>
                </div>

                {/* Parameter checklist */}
                <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Shield className="h-3.5 w-3.5" /> Quality Checklist Parameters
                        </h4>
                        <Button
                            onClick={handleAddParam}
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] font-bold text-primary border-primary/20 hover:bg-primary/5 rounded-md inline-flex items-center gap-1"
                        >
                            <Plus className="h-3 w-3" /> Add Check Parameter
                        </Button>
                    </div>

                    {parameters.length === 0 ? (
                        <div className="text-center py-8 border border-dashed rounded-lg border-muted bg-muted/5">
                            <AlertCircle className="h-8 w-8 text-muted-foreground opacity-30 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">No inspection parameters added yet. Create checklist criteria above.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-muted/50 bg-card">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="bg-muted/10 border-b border-muted/50 text-muted-foreground font-bold">
                                        <th className="p-2.5 w-[25%]">Test Parameter</th>
                                        <th className="p-2.5 w-[15%]">Type</th>
                                        <th className="p-2.5 w-[25%]">Limits / Target Value</th>
                                        <th className="p-2.5 w-[15%]">Unit (UOM)</th>
                                        <th className="p-2.5 w-[12%] text-center">Critical?</th>
                                        <th className="p-2.5 w-[8%] text-center">Delete</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parameters.map((p) => {
                                        return (
                                            <tr key={p.parameter_id} className="border-b border-muted/40 hover:bg-muted/5">
                                                <td className="p-2 align-middle">
                                                    <input
                                                        type="text"
                                                        value={p.test_name}
                                                        onChange={(e) => handleUpdateParam(p.parameter_id, "test_name", e.target.value)}
                                                        className="w-full h-8 px-2 border border-muted bg-background text-foreground text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                                        placeholder="e.g. PH balance check"
                                                    />
                                                </td>
                                                <td className="p-2 align-middle">
                                                    <select
                                                        value={p.test_type}
                                                        onChange={(e) => handleUpdateParam(p.parameter_id, "test_type", e.target.value)}
                                                        className="w-full h-8 px-1.5 border border-muted bg-background text-foreground text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                                    >
                                                        <option value="Numeric">Numeric</option>
                                                        <option value="Pass/Fail">Pass/Fail</option>
                                                        <option value="Text">Text</option>
                                                    </select>
                                                </td>
                                                <td className="p-2 align-middle">
                                                    {p.test_type === "Numeric" ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <input
                                                                type="number"
                                                                value={p.min_value !== null ? p.min_value : ""}
                                                                onChange={(e) => handleUpdateParam(p.parameter_id, "min_value", e.target.value !== "" ? parseFloat(e.target.value) : null)}
                                                                className="w-full h-8 px-1.5 border border-muted bg-background text-foreground text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary text-center"
                                                                placeholder="Min"
                                                            />
                                                            <span className="text-muted-foreground">-</span>
                                                            <input
                                                                type="number"
                                                                value={p.max_value !== null ? p.max_value : ""}
                                                                onChange={(e) => handleUpdateParam(p.parameter_id, "max_value", e.target.value !== "" ? parseFloat(e.target.value) : null)}
                                                                className="w-full h-8 px-1.5 border border-muted bg-background text-foreground text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary text-center"
                                                                placeholder="Max"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            value={p.target_value !== null ? p.target_value : ""}
                                                            onChange={(e) => handleUpdateParam(p.parameter_id, "target_value", e.target.value)}
                                                            className="w-full h-8 px-2 border border-muted bg-background text-foreground text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                                            placeholder={p.test_type === "Pass/Fail" ? "e.g. Pass / Good" : "Target specification description"}
                                                        />
                                                    )}
                                                </td>
                                                <td className="p-2 align-middle">
                                                    <select
                                                        value={p.uom_id || ""}
                                                        onChange={(e) => handleUpdateParam(p.parameter_id, "uom_id", e.target.value ? parseInt(e.target.value) : null)}
                                                        className="w-full h-8 px-1 border border-muted bg-background text-foreground text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                                    >
                                                        <option value="">No unit</option>
                                                        {units.map(u => (
                                                            <option key={u.unit_id} value={u.unit_id}>{u.unit_shortcut}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="p-2 align-middle text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!p.is_critical}
                                                        onChange={(e) => handleUpdateParam(p.parameter_id, "is_critical", e.target.checked)}
                                                        className="h-4.5 w-4.5 rounded border-muted bg-background text-primary focus:ring-0"
                                                    />
                                                </td>
                                                <td className="p-2 align-middle text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDeleteParam(p.parameter_id)}
                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
