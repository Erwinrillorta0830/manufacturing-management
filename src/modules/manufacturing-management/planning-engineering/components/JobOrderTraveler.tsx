"use client";

import React, { useRef } from "react";
import Barcode from "react-barcode";
import { QRCodeSVG } from "qrcode.react";
import { 
    Printer, 
    X, 
    Layers, 
    Factory, 
    ShieldCheck, 
    PackageCheck,
    ClipboardCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
    JobOrder, 
    JobOrderMaterial, 
    JobOrderOperation, 
    JobOrderAllocation 
} from "../types";

export interface JobOrderTravelerProps {
    isOpen?: boolean;
    onClose?: () => void;
    jobOrder: JobOrder;
    materials?: JobOrderMaterial[];
    operations?: JobOrderOperation[];
    allocations?: JobOrderAllocation[];
    childJobOrders?: Array<{
        jobOrder: JobOrder;
        materials?: JobOrderMaterial[];
        operations?: JobOrderOperation[];
    }>;
    branchName?: string;
    printedBy?: string;
}

export function JobOrderTraveler({
    isOpen = true,
    onClose,
    jobOrder,
    materials = [],
    operations = [],
    childJobOrders = [],
    branchName = "Main Manufacturing Facility"
}: JobOrderTravelerProps) {
    const printableRef = useRef<HTMLDivElement>(null);

    if (!isOpen || !jobOrder) return null;

    const handlePrint = () => {
        window.print();
    };

    const currentDateStr = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });

    const activeMaterials = materials.length > 0 ? materials : (jobOrder.materials || []);
    const activeOperations = operations.length > 0 ? operations : (jobOrder.operations || jobOrder.routes || []);

    const renderTravelerSheet = (
        currentJo: JobOrder, 
        currentMats: JobOrderMaterial[], 
        currentOps: JobOrderOperation[], 
        sheetIndex: number, 
        isSubAssembly = false
    ) => {
        const cJoNo = String(currentJo.job_order_no || currentJo.jo_id || `JO-${currentJo.job_order_id || currentJo.id || "000000"}`).trim();
        const cProductName = currentJo.product_name || `Product #${currentJo.product_id}`;
        const cProductCode = currentJo.product_code || `SKU-${currentJo.product_id}`;
        const cTargetQty = Number(currentJo.target_quantity || currentJo.quantity || 0);
        const cUom = currentJo.unit_of_measurement || "PCS";
        const cBatchNo = `LOT-${cJoNo}`;
        const cShiftHours = currentJo.shift_option || "8";
        const cStatus = currentJo.status || "Planned";
        const cVersionName = currentJo.version_name || (currentJo.version_id ? `v${currentJo.version_id}` : "Standard");
        const parentJoNo = currentJo.parent_job_order_id || (cJoNo.includes("-SUB") ? cJoNo.split("-SUB")[0] : null);

        return (
            <div 
                key={`traveler-sheet-${cJoNo}-${sheetIndex}`} 
                className="bg-white text-neutral-900 border border-neutral-300 rounded-xl p-8 shadow-sm print:shadow-none print:border-none print:p-0 print:m-0 mb-8 page-break-after-always print:text-black"
                style={{ pageBreakInside: "avoid" }}
            >
                {/* Header Banner */}
                <div className="border-b-2 border-neutral-900 pb-4 mb-5">
                    <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="font-black text-xl tracking-wider uppercase text-neutral-900">
                                    VERTEX TECH CORP • VOS ERP
                                </span>
                                {isSubAssembly && (
                                    <span className="text-[10px] bg-sky-100 text-sky-800 border border-sky-300 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                                        Sub-Assembly Run
                                    </span>
                                )}
                            </div>
                            <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-tight">
                                Shop Floor Job Order Production Traveler & Route Sheet
                            </h2>
                            <p className="text-[11px] text-neutral-500">
                                Official Factory Execution Traveler • Maintain physical attachment with batch cart / tote at all times
                            </p>
                        </div>

                        {/* Top Barcode & QR Block */}
                        <div className="flex items-center gap-4 text-right">
                            <div className="flex flex-col items-end">
                                <div className="p-1 bg-white border border-neutral-300 rounded">
                                    <Barcode 
                                        value={cJoNo} 
                                        height={32} 
                                        width={1.2} 
                                        fontSize={10} 
                                        margin={0} 
                                        displayValue={false} 
                                    />
                                </div>
                                <div className="font-mono text-sm font-black text-neutral-900 mt-1 tracking-wider">
                                    {cJoNo}
                                </div>
                                <div className="text-[10px] text-neutral-600 font-semibold uppercase">
                                    Status: <span className="font-bold text-neutral-900">{cStatus}</span>
                                </div>
                            </div>
                            <div className="p-1.5 bg-neutral-50 border border-neutral-300 rounded shrink-0 hidden sm:block">
                                <QRCodeSVG value={`JO:${cJoNo}|PROD:${cProductCode}|QTY:${cTargetQty}`} size={56} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Master Details Matrix */}
                <div className="grid grid-cols-4 gap-3 bg-neutral-50 border border-neutral-300 rounded-lg p-3.5 mb-5 text-[11px] print:bg-neutral-50">
                    <div>
                        <span className="text-[9px] font-black uppercase text-neutral-500 block">Finished Product / SKU</span>
                        <div className="font-bold text-neutral-900 text-xs truncate" title={cProductName}>{cProductName}</div>
                        <div className="font-mono text-[10px] text-neutral-600 font-semibold">{cProductCode}</div>
                    </div>
                    <div>
                        <span className="text-[9px] font-black uppercase text-neutral-500 block">Target Production Qty</span>
                        <div className="font-black text-neutral-900 text-sm font-mono">
                            {cTargetQty.toLocaleString()} <span className="text-[10px] font-normal">{cUom}</span>
                        </div>
                        <div className="text-[10px] text-neutral-600">BOM: <span className="font-semibold">{cVersionName}</span></div>
                    </div>
                    <div>
                        <span className="text-[9px] font-black uppercase text-neutral-500 block">Batch / Lot Tracking #</span>
                        <div className="font-mono font-bold text-neutral-900 text-xs">{cBatchNo}</div>
                        <div className="text-[10px] text-neutral-600">Shift: <span className="font-semibold">{cShiftHours} hrs</span></div>
                    </div>
                    <div>
                        <span className="text-[9px] font-black uppercase text-neutral-500 block">Facility / Issue Details</span>
                        <div className="font-semibold text-neutral-900 text-xs truncate" title={branchName}>{branchName}</div>
                        <div className="text-[10px] text-neutral-600">Issued: <span className="font-mono">{currentDateStr}</span></div>
                    </div>
                    {isSubAssembly && parentJoNo && (
                        <div className="col-span-4 pt-2 mt-1 border-t border-neutral-200 flex items-center justify-between text-[11px] text-sky-900 bg-sky-50 px-2 py-1 rounded">
                            <span className="font-bold flex items-center gap-1">
                                <Layers className="h-3.5 w-3.5 text-sky-700" /> Linked to Parent Master JO:
                            </span>
                            <span className="font-mono font-black">{parentJoNo}</span>
                        </div>
                    )}
                </div>

                {/* Section 1: Staged Component Pick-List */}
                <div className="mb-6">
                    <div className="flex items-center justify-between border-b border-neutral-300 pb-1.5 mb-2">
                        <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                            <PackageCheck className="h-3.5 w-3.5 text-neutral-700" />
                            1. Bill of Materials & Staged Component Pick-List
                        </h3>
                        <span className="text-[10px] font-semibold text-neutral-500">
                            {currentMats.length} Materials Required
                        </span>
                    </div>

                    <table className="w-full border-collapse border border-neutral-300 text-[10px]">
                        <thead>
                            <tr className="bg-neutral-100 text-neutral-900 font-bold uppercase border-b border-neutral-300">
                                <th className="border border-neutral-300 p-1.5 text-center w-8">#</th>
                                <th className="border border-neutral-300 p-1.5 text-left">Component Item & Description</th>
                                <th className="border border-neutral-300 p-1.5 text-right w-20">Req Qty</th>
                                <th className="border border-neutral-300 p-1.5 text-right w-20">Alloc / Staged</th>
                                <th className="border border-neutral-300 p-1.5 text-left w-32">Lot / Batch #</th>
                                <th className="border border-neutral-300 p-1.5 text-center w-20">Location Bin</th>
                                <th className="border border-neutral-300 p-1.5 text-center w-24">Picker Sign-off</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentMats.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="border border-neutral-300 p-3 text-center text-neutral-400 italic">
                                        No raw material requirements specified for this operation.
                                    </td>
                                </tr>
                            ) : (
                                currentMats.map((mat: JobOrderMaterial, idx: number) => {
                                    const reqQty = Number(mat.allocated_quantity || mat.required_quantity || 0);
                                    const resQty = Number(mat.reserved_quantity || reqQty);
                                    const matName = mat.product_name || `Component #${mat.product_id}`;
                                    const matCode = mat.product_code || `SKU-${mat.product_id}`;
                                    const matUom = mat.unit_of_measurement || "pcs";
                                    const lotAllocations = mat.allocations || [];
                                    const lotText = lotAllocations.length > 0 
                                        ? lotAllocations.map((a: JobOrderAllocation) => a.batch_no || `LOT-${a.lot_id}`).join(", ")
                                        : (mat.batch_no || "FIFO / General Stock");

                                    return (
                                        <tr key={`mat-row-${idx}`} className="hover:bg-neutral-50">
                                            <td className="border border-neutral-300 p-1.5 text-center font-mono font-bold text-neutral-500">
                                                {idx + 1}
                                            </td>
                                            <td className="border border-neutral-300 p-1.5">
                                                <div className="font-bold text-neutral-900">{matName}</div>
                                                <div className="font-mono text-[9px] text-neutral-500">{matCode}</div>
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-right font-mono font-bold">
                                                {reqQty.toLocaleString(undefined, { maximumFractionDigits: 3 })} {matUom}
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-right font-mono text-neutral-700">
                                                {resQty.toLocaleString(undefined, { maximumFractionDigits: 3 })} {matUom}
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 font-mono text-[9px] text-neutral-800">
                                                {lotText}
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-center font-mono text-[9px] text-neutral-600">
                                                {mat.staging_bin || "A-01-STG"}
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-center">
                                                <div className="w-4 h-4 border border-neutral-400 mx-auto rounded-xs"></div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Section 2: Routing Operation Sequence */}
                <div className="mb-6">
                    <div className="flex items-center justify-between border-b border-neutral-300 pb-1.5 mb-2">
                        <h3 className="text-xs font-black uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                            <Factory className="h-3.5 w-3.5 text-neutral-700" />
                            2. Routing Operation Sequence & Step Sign-Off
                        </h3>
                        <span className="text-[10px] font-semibold text-neutral-500">
                            {currentOps.length} Sequential Steps
                        </span>
                    </div>

                    <table className="w-full border-collapse border border-neutral-300 text-[10px]">
                        <thead>
                            <tr className="bg-neutral-100 text-neutral-900 font-bold uppercase border-b border-neutral-300">
                                <th className="border border-neutral-300 p-1.5 text-center w-8">Seq</th>
                                <th className="border border-neutral-300 p-1.5 text-left w-36">Operation Name</th>
                                <th className="border border-neutral-300 p-1.5 text-left w-28">Work Center</th>
                                <th className="border border-neutral-300 p-1.5 text-right w-16">Plan Setup</th>
                                <th className="border border-neutral-300 p-1.5 text-right w-16">Plan Run</th>
                                <th className="border border-neutral-300 p-1.5 text-center w-20">Step Barcode</th>
                                <th className="border border-neutral-300 p-1.5 text-center w-16">Operator</th>
                                <th className="border border-neutral-300 p-1.5 text-center w-16">Start Time</th>
                                <th className="border border-neutral-300 p-1.5 text-center w-16">End Time</th>
                                <th className="border border-neutral-300 p-1.5 text-center w-16">Good Qty</th>
                                <th className="border border-neutral-300 p-1.5 text-center w-14">Scrap</th>
                                <th className="border border-neutral-300 p-1.5 text-center w-16">QA Sign</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentOps.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="border border-neutral-300 p-3 text-center text-neutral-400 italic">
                                        Standard single-step manufacturing execution flow.
                                    </td>
                                </tr>
                            ) : (
                                currentOps.map((op: JobOrderOperation, idx: number) => {
                                    const seq = op.sequence_order || (idx + 1) * 10;
                                    const opName = op.operation_name || `Operation #${op.operation_id || op.id || idx + 1}`;
                                    const wcName = op.work_center_name || `Work Center #${op.work_center_id || 1}`;
                                    const setupHrs = Number(op.planned_setup_hours || 0);
                                    const runHrs = Number(op.planned_run_hours || 0);
                                    const stepCode = `OP-${seq}-${op.operation_id || op.id || idx + 1}`;

                                    return (
                                        <tr key={`op-row-${idx}`} className="hover:bg-neutral-50">
                                            <td className="border border-neutral-300 p-1.5 text-center font-mono font-bold text-neutral-900 bg-neutral-50">
                                                {seq}
                                            </td>
                                            <td className="border border-neutral-300 p-1.5">
                                                <div className="font-bold text-neutral-900">{opName}</div>
                                                <div className="font-mono text-[9px] text-neutral-500">{stepCode}</div>
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-neutral-800 font-medium">
                                                {wcName}
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-right font-mono text-neutral-600">
                                                {setupHrs.toFixed(1)}h
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-right font-mono font-bold text-neutral-900">
                                                {runHrs.toFixed(1)}h
                                            </td>
                                            <td className="border border-neutral-300 p-1 text-center">
                                                <div className="inline-block p-0.5 bg-white">
                                                    <Barcode 
                                                        value={stepCode} 
                                                        height={18} 
                                                        width={0.8} 
                                                        fontSize={8} 
                                                        margin={0} 
                                                        displayValue={false} 
                                                    />
                                                </div>
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-center font-mono text-[9px] text-neutral-400">
                                                _______
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-center font-mono text-[9px] text-neutral-400">
                                                ___:___
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-center font-mono text-[9px] text-neutral-400">
                                                ___:___
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-center font-mono text-[9px] text-neutral-400">
                                                _______
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-center font-mono text-[9px] text-neutral-400">
                                                _______
                                            </td>
                                            <td className="border border-neutral-300 p-1.5 text-center font-mono text-[9px] text-neutral-400">
                                                _______
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Section 3: In-Process Quality Checkpoints & Sign-off */}
                <div className="mb-6 grid grid-cols-2 gap-4">
                    <div className="border border-neutral-300 rounded-lg p-3 bg-neutral-50 text-[10px]">
                        <h4 className="font-black uppercase tracking-wider text-neutral-900 flex items-center gap-1 mb-2">
                            <ShieldCheck className="h-3.5 w-3.5 text-neutral-700" />
                            3. In-Process Quality Checkpoints
                        </h4>
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between border-b border-neutral-200 pb-1">
                                <span className="text-neutral-700">• Raw Material Verification & Weight Check</span>
                                <span className="font-mono text-neutral-500">[ ] PASS [ ] FAIL</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-neutral-200 pb-1">
                                <span className="text-neutral-700">• Operating Temperature & Pressure Check</span>
                                <span className="font-mono text-neutral-500">[ ] PASS [ ] FAIL</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-neutral-200 pb-1">
                                <span className="text-neutral-700">• First Article Inspection (Color / Texture)</span>
                                <span className="font-mono text-neutral-500">[ ] PASS [ ] FAIL</span>
                            </div>
                            <div className="flex items-center justify-between pb-0.5">
                                <span className="text-neutral-700">• Final Packaging & Barcode Labeling</span>
                                <span className="font-mono text-neutral-500">[ ] PASS [ ] FAIL</span>
                            </div>
                        </div>
                    </div>

                    <div className="border border-neutral-300 rounded-lg p-3 bg-neutral-50 text-[10px]">
                        <h4 className="font-black uppercase tracking-wider text-neutral-900 flex items-center gap-1 mb-2">
                            <ClipboardCheck className="h-3.5 w-3.5 text-neutral-700" />
                            4. Final Yield Disposition
                        </h4>
                        <div className="grid grid-cols-3 gap-2 text-center pt-1">
                            <div className="border border-neutral-300 bg-white p-2 rounded">
                                <span className="text-[9px] font-black uppercase text-neutral-500 block">Accepted Good</span>
                                <div className="font-mono text-base font-black text-neutral-900">______</div>
                            </div>
                            <div className="border border-neutral-300 bg-white p-2 rounded">
                                <span className="text-[9px] font-black uppercase text-neutral-500 block">Scrap / Defect</span>
                                <div className="font-mono text-base font-black text-neutral-900">______</div>
                            </div>
                            <div className="border border-neutral-300 bg-white p-2 rounded">
                                <span className="text-[9px] font-black uppercase text-neutral-500 block">Yield %</span>
                                <div className="font-mono text-base font-black text-neutral-900">_____%</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Floor Authorization & Signatures */}
                <div className="border-t-2 border-neutral-900 pt-4 mt-6">
                    <div className="grid grid-cols-4 gap-4 text-center text-[10px]">
                        <div>
                            <div className="h-10 border-b border-neutral-400 mb-1"></div>
                            <span className="font-black uppercase text-neutral-800 block">Machine Lead / Operator</span>
                            <span className="text-[9px] text-neutral-500">Execution Sign & Date</span>
                        </div>
                        <div>
                            <div className="h-10 border-b border-neutral-400 mb-1"></div>
                            <span className="font-black uppercase text-neutral-800 block">Quality Assurance (QA)</span>
                            <span className="text-[9px] text-neutral-500">Inspection & Release Stamp</span>
                        </div>
                        <div>
                            <div className="h-10 border-b border-neutral-400 mb-1"></div>
                            <span className="font-black uppercase text-neutral-800 block">Shift Production Supervisor</span>
                            <span className="text-[9px] text-neutral-500">Floor Authorization</span>
                        </div>
                        <div>
                            <div className="h-10 border-b border-neutral-400 mb-1"></div>
                            <span className="font-black uppercase text-neutral-800 block">Warehouse Stock Custodian</span>
                            <span className="text-[9px] text-neutral-500">Finished Goods Receipt</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-xs overflow-y-auto">
            {/* Top Toolbar (Hidden on Print) */}
            <div className="fixed top-4 right-4 z-50 flex items-center gap-2 print:hidden bg-card/90 backdrop-blur-md p-2 rounded-2xl border border-border shadow-2xl">
                <Button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-bold text-xs rounded-xl shadow-lg hover:scale-105 transition-all"
                >
                    <Printer className="h-4 w-4" />
                    Print Traveler Sheet
                </Button>
                {onClose && (
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground shadow-sm transition-all"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Document Container */}
            <div ref={printableRef} className="w-full max-w-5xl my-auto py-8">
                {/* Master Parent Job Order Sheet */}
                {renderTravelerSheet(jobOrder, activeMaterials, activeOperations, 0, false)}

                {/* Sub-Assembly Sheets if Family Group */}
                {childJobOrders.map((child, cIdx) => (
                    renderTravelerSheet(
                        child.jobOrder, 
                        child.materials || [], 
                        child.operations || [], 
                        cIdx + 1, 
                        true
                    )
                ))}
            </div>
        </div>
    );
}

export default JobOrderTraveler;
