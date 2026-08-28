// src/modules/financial-management/accounting/customers-memo/components/PrintMemoSettingsDialog.tsx
"use client";

import * as React from "react";
import { DetailedMemo } from "../types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Printer, Loader2 } from "lucide-react";
import { PdfTemplate, pdfTemplateService } from "@/components/pdf-layout-design/services/pdf-template";
import { CompanyProfile } from "../types";
import { toast } from "sonner";
import { generateMemoPdf } from "../utils/generateMemoPdf";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    details: DetailedMemo;
    company: CompanyProfile | null;
}

export function PrintMemoSettingsDialog({ open, onOpenChange, details, company }: Props) {
    const [templates, setTemplates] = React.useState<PdfTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("none");
    const [loading, setLoading] = React.useState(false);
    const [generating, setGenerating] = React.useState(false);

    React.useEffect(() => {
        if (open) {
            const fetchTemplates = async () => {
                setLoading(true);
                try {
                    const tpls = await pdfTemplateService.fetchTemplates();
                    setTemplates(tpls);
                } catch (error) {
                    console.error("Error fetching templates:", error);
                    toast.error("Failed to load PDF templates");
                } finally {
                    setLoading(false);
                }
            };
            fetchTemplates();
        }
    }, [open]);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const selectedTemplate = templates.find(t => String(t.id) === selectedTemplateId);
            await generateMemoPdf(details, {
                company,
                selectedTemplate
            });
            onOpenChange(false);
        } catch (error) {
            console.error("Error generating PDF:", error);
            toast.error("Failed to generate PDF");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Printer className="w-5 h-5 text-primary" />
                        Print Settings
                    </DialogTitle>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="space-y-2">
                        <Label>Header Template</Label>
                        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                            <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Select a template" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Standard Header</SelectItem>
                                {templates.map(tpl => (
                                    <SelectItem key={tpl.id} value={String(tpl.id)}>{tpl.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedTemplateId !== "none" && (() => {
                        const tpl = templates.find(t => String(t.id) === selectedTemplateId);
                        const cfg = tpl?.config;
                        if (!cfg) return null;
                        return (
                            <div className="rounded-xl border border-border/50 overflow-hidden text-[11px]">
                                <div className="px-3 py-2 bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                                    Template Configuration
                                </div>
                                <div className="divide-y divide-border/40">
                                    <div className="flex items-center justify-between px-3 py-1.5">
                                        <span className="text-muted-foreground">Paper Size</span>
                                        <span className="font-medium text-foreground">{cfg.paperSize}</span>
                                    </div>
                                    <div className="flex items-center justify-between px-3 py-1.5">
                                        <span className="text-muted-foreground">Orientation</span>
                                        <span className="font-medium text-foreground">{cfg.orientation}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="p-3 bg-muted/30 rounded-xl text-xs text-muted-foreground">
                        The document will be generated as a high-quality PDF.
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
                        Cancel
                    </Button>
                    <Button onClick={handleGenerate} className="rounded-xl px-8" disabled={loading || generating}>
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate PDF"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
