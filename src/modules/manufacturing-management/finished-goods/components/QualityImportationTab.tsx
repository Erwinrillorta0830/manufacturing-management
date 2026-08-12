"use client";

import React, { useState } from "react";
import { Shield, Briefcase } from "lucide-react";
import { QATemplatesTab } from "./QATemplatesTab";
import { ImportationTab } from "./ImportationTab";
import { QATemplate, Unit } from "../types";

export interface QualityImportationTabProps {
    qaTemplates: QATemplate[];
    units: Unit[];
    handleAddQATemplate: (template: Omit<QATemplate, "template_id">) => Promise<QATemplate | undefined>;
    handleSaveQATemplate: (templateId: number, template: Partial<QATemplate>) => Promise<QATemplate | undefined>;

    // Importation props
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

export function QualityImportationTab(props: QualityImportationTabProps) {
    const [subTab, setSubTab] = useState<"qa_templates" | "importation">("qa_templates");

    return (
        <div className="space-y-6">
            {/* Inner Sub-tab Navigation */}
            <div className="flex border-b border-border/60 gap-2 bg-muted/20 px-3 pt-2 rounded-t-xl shrink-0">
                <button
                    type="button"
                    onClick={() => setSubTab("qa_templates")}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                        subTab === "qa_templates"
                            ? "border-primary text-primary bg-background rounded-t-lg shadow-xs"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <Shield className="h-3.5 w-3.5" />
                    QA Checklist Templates
                </button>
                <button
                    type="button"
                    onClick={() => setSubTab("importation")}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                        subTab === "importation"
                            ? "border-primary text-primary bg-background rounded-t-lg shadow-xs"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <Briefcase className="h-3.5 w-3.5" />
                    Importation &amp; Landed Cost
                </button>
            </div>

            {subTab === "qa_templates" ? (
                <QATemplatesTab
                    qaTemplates={props.qaTemplates}
                    units={props.units}
                    handleAddQATemplate={props.handleAddQATemplate}
                    handleSaveQATemplate={props.handleSaveQATemplate}
                />
            ) : (
                <ImportationTab
                    importNetWeight={props.importNetWeight}
                    setImportNetWeight={props.setImportNetWeight}
                    importPriceUsd={props.importPriceUsd}
                    setImportPriceUsd={props.setImportPriceUsd}
                    importFxRate={props.importFxRate}
                    setImportFxRate={props.setImportFxRate}
                    importDensityFactor={props.importDensityFactor}
                    setImportDensityFactor={props.setImportDensityFactor}
                    importThcFee={props.importThcFee}
                    setImportThcFee={props.setImportThcFee}
                    importStorageFee={props.importStorageFee}
                    setImportStorageFee={props.setImportStorageFee}
                    importCustomSop={props.importCustomSop}
                    setImportCustomSop={props.setImportCustomSop}
                    importTruckingFee={props.importTruckingFee}
                    setImportTruckingFee={props.setImportTruckingFee}
                    importOtherPortFees={props.importOtherPortFees}
                    setImportOtherPortFees={props.setImportOtherPortFees}
                    importCustomDuty={props.importCustomDuty}
                    setImportCustomDuty={props.setImportCustomDuty}
                    importVat={props.importVat}
                    setImportVat={props.setImportVat}
                    importIpf={props.importIpf}
                    setImportIpf={props.setImportIpf}
                    importForeignPeso={props.importForeignPeso}
                    importTotalShippingPort={props.importTotalShippingPort}
                    importTotalDutiesTaxes={props.importTotalDutiesTaxes}
                    importTotalLandedCost={props.importTotalLandedCost}
                    importLandedCostPerKg={props.importLandedCostPerKg}
                    importLandedCostPerL={props.importLandedCostPerL}
                    importTotalForCogs={props.importTotalForCogs}
                    importCogsPerKg={props.importCogsPerKg}
                    importCogsPerL={props.importCogsPerL}
                    handleApplyImportLandedCost={props.handleApplyImportLandedCost}
                    automateCustoms={props.automateCustoms}
                    setAutomateCustoms={props.setAutomateCustoms}
                />
            )}
        </div>
    );
}
