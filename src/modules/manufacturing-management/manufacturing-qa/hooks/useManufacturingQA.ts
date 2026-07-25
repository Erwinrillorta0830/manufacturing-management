/* eslint-disable */
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { QALog, DispositionRecord, JobOrder, Branch } from "../types";
import {
    fetchQALogs,
    fetchDispositions,
    fetchJobOrders,
    fetchBranchesList,
    fetchJobOrderMaterials,
    postFinishedGoodsReceipt,
    postSupervisorOverride,
    fetchDailyQAInspections,
    fetchFinalQAReleases,
    fetchYieldLedger,
    fetchInventoryLotsData,
    postDailyQAInspection,
    postFinalQARelease
} from "../services/qa-api";

export interface PrintReceiptComponent {
    product_name: string;
    quantity: number;
    unit?: string;
}

export interface PrintReceiptData {
    jo_no: string;
    branch_name: string;
    product_code: string;
    product_name: string;
    recipe_version: string;
    yield_qty: number;
    lot_number: string;
    manufacturing_date?: string;
    expiry_date: string;
    unit_cost: number;
    components?: Array<PrintReceiptComponent>;
}

export const printYieldClosingReceipt = (data: PrintReceiptData) => {
    if (typeof window === "undefined") return;
    const printWindow = window.open("", "_blank", "width=600,height=750");
    if (!printWindow) {
        toast.error("Popup blocker prevented auto-printing the receipt. Please enable popups.");
        return;
    }

    const totalCost = data.yield_qty * data.unit_cost;

    printWindow.document.write(`
        <html>
            <style>
                @page { size: 58mm auto; margin: 0; }
                * {
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                    font-size: 8px;
                    color: #0f172a;
                    margin: 0;
                    padding: 2px;
                    line-height: 1.3;
                    background-color: #ffffff;
                }
                .receipt {
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    padding: 6px;
                    max-width: 48mm;
                    margin: 0 auto;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.01);
                }
                .header {
                    text-align: center;
                    border-bottom: 1px dashed #0f172a;
                    padding-bottom: 4px;
                    margin-bottom: 6px;
                }
                .header h1 {
                    font-size: 11px;
                    font-weight: 800;
                    margin: 0 0 2px 0;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    color: #0f172a;
                }
                .header p {
                    margin: 0;
                    font-size: 7.5px;
                    color: #64748b;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .section-title {
                    font-size: 7.5px;
                    font-weight: 800;
                    text-transform: uppercase;
                    color: #64748b;
                    margin-top: 6px;
                    margin-bottom: 2px;
                    letter-spacing: 0.3px;
                }
                .row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 2px;
                }
                .row.multiline {
                    flex-direction: column;
                    align-items: flex-start;
                    margin-bottom: 4px;
                }
                .row.multiline .value {
                    text-align: left;
                    width: 100%;
                    margin-top: 1px;
                }
                .label {
                    color: #64748b;
                    font-weight: 500;
                }
                .value {
                    text-align: right;
                    font-weight: 600;
                    color: #0f172a;
                }
                .highlight-box {
                    background-color: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 4px;
                    padding: 4px 6px;
                    margin: 6px 0;
                }
                .highlight-box .row.total {
                    font-size: 9px;
                    font-weight: 800;
                    color: #0f172a;
                    border-top: 1px dashed #cbd5e1;
                    padding-top: 3px;
                    margin-top: 3px;
                }
                .highlight-box .row.total .value {
                    color: #0f172a;
                    font-weight: 800;
                }
                .sig-box {
                    margin-top: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .sig {
                    border-top: 1px dashed #94a3b8;
                    width: 100%;
                    text-align: center;
                    padding-top: 3px;
                    font-size: 7px;
                    color: #64748b;
                    font-weight: 600;
                    text-transform: uppercase;
                    margin-top: 2px;
                }
                .footer {
                    margin-top: 10px;
                    text-align: center;
                    font-size: 7.5px;
                    color: #94a3b8;
                    font-weight: 500;
                    border-top: 1px dashed #cbd5e1;
                    padding-top: 4px;
                }
                @media print {
                    body { padding: 0; margin: 0; background: none; }
                    .receipt { border: none; box-shadow: none; padding: 2px; width: 46mm; margin: 0; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">
                    <h1>Finished Goods Receipt</h1>
                    <p>WMS Ledger & Run Closure Slip</p>
                    <div style="font-size: 8px; color: #94a3b8; margin-top: 4px; font-weight: normal;">
                        Printed: ${new Date().toLocaleString()}
                    </div>
                </div>

                <div class="section-title">Production Details</div>
                <div class="row">
                    <span class="label">Job Order No:</span>
                    <span class="value">${data.jo_no}</span>
                </div>
                <div class="row">
                    <span class="label">Target Branch:</span>
                    <span class="value">${data.branch_name}</span>
                </div>
                <div class="row">
                    <span class="label">Product Code:</span>
                    <span class="value">${data.product_code}</span>
                </div>
                <div class="row multiline">
                    <span class="label">Product Name:</span>
                    <span class="value" style="font-weight: bold; white-space: normal;">${data.product_name}</span>
                </div>
                <div class="row">
                    <span class="label">Recipe Version:</span>
                    <span class="value">${data.recipe_version}</span>
                </div>

                <div class="section-title">Lot & Tracking</div>
                <div class="row">
                    <span class="label">Lot/Batch Number:</span>
                    <span class="value font-mono">${data.lot_number}</span>
                </div>
                <div class="row">
                    <span class="label">Manufacturing Date:</span>
                    <span class="value">${data.manufacturing_date || "N/A"}</span>
                </div>
                <div class="row">
                    <span class="label">Expiration Date:</span>
                    <span class="value">${data.expiry_date || "N/A"}</span>
                </div>

                ${data.components && data.components.length > 0 ? `
                    <div class="section-title">BOM Used (Components Consumed)</div>
                    <div style="border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px; margin-bottom: 4px;">
                        ${data.components.map(c => `
                            <div class="row" style="font-size: 7.5px; margin-bottom: 1.5px;">
                                <span class="label" style="text-align: left; max-width: 65%; font-weight: normal; color: #334155;">${c.product_name}</span>
                                <span class="value" style="font-family: monospace; font-weight: bold; color: #0f172a;">${Number(c.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${c.unit || 'units'}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="highlight-box">
                    <div class="row">
                        <span class="label">Yield Produced:</span>
                        <span class="value" style="font-size: 12px; color: #0f172a;">${data.yield_qty.toLocaleString()} units</span>
                    </div>
                    <div class="row">
                        <span class="label">Landed Unit Cost:</span>
                        <span class="value">PHP ${data.unit_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div class="row total">
                        <span class="label">TOTAL LOGGED COST:</span>
                        <span class="value">PHP ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <div class="sig-box">
                    <div class="sig">QA Inspector Signature</div>
                    <div class="sig">Supervisor Authorization</div>
                </div>

                <div class="footer">
                    <div>ERP Automated Yield Ledger Receipt</div>
                    <div style="font-size: 7px; color: #cbd5e1; margin-top: 2px;">*** End of Receipt ***</div>
                </div>
            </div>
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                        window.close();
                    }, 300);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

export function useManufacturingQA() {
    // Tab State
    const [activeTab, setActiveTab] = useState("holds");

    // Data lists
    const [qaLogs, setQaLogs] = useState<QALog[]>([]);
    const [dispositions, setDispositions] = useState<DispositionRecord[]>([]);
    const [jobOrders, setJobOrders] = useState<JobOrder[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);

    // Loading states
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [loadingDispositions, setLoadingDispositions] = useState(false);
    const [loadingJobOrders, setLoadingJobOrders] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Search and filters
    const [logSearch, setLogSearch] = useState("");
    const [logStatusFilter, setLogStatusFilter] = useState("all");
    const [joSearch, setJoSearch] = useState("");

    // Yield Closing Dialog states
    const [selectedJO, setSelectedJO] = useState<JobOrder | null>(null);
    const [isYieldDialogOpen, setIsYieldDialogOpen] = useState(false);
    const [yieldQty, setYieldQty] = useState("");
    const [lotNumber, setLotNumber] = useState("");
    const [manufacturingDate, setManufacturingDate] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [unitCost, setUnitCost] = useState("");

    // Supervisor Override Dialog states
    const [selectedDisp, setSelectedDisp] = useState<DispositionRecord | null>(null);
    const [isOverrideDialogOpen, setIsOverrideDialogOpen] = useState(false);
    const [overrideDecision, setOverrideDecision] = useState<"Release with Deviation" | "Rework" | "Scrap">("Release with Deviation");
    const [overrideComments, setOverrideComments] = useState("");

    // Load QA Logs
    const loadQALogs = async (silent = false) => {
        if (!silent) setLoadingLogs(true);
        try {
            const data = await fetchQALogs();
            setQaLogs(data);
        } catch (e) {
            if (!silent) {
                console.error("QA Logs fetch error:", e);
                toast.error("Failed to retrieve quality checkpoint logs.");
            }
        } finally {
            if (!silent) setLoadingLogs(false);
        }
    };

    // Load Dispositions
    const loadDispositions = async (silent = false) => {
        if (!silent) setLoadingDispositions(true);
        try {
            const data = await fetchDispositions();
            setDispositions(data);
        } catch (e) {
            if (!silent) {
                console.error("Dispositions fetch error:", e);
                toast.error("Failed to retrieve quarantine/holds list.");
            }
        } finally {
            if (!silent) setLoadingDispositions(false);
        }
    };

    // Load Active Job Orders
    const loadJobOrders = async (silent = false) => {
        if (!silent) setLoadingJobOrders(true);
        try {
            const data = await fetchJobOrders();
            setJobOrders(data);
        } catch (e) {
            if (!silent) {
                console.error("Job Orders fetch error:", e);
                toast.error("Failed to retrieve active job orders.");
            }
        } finally {
            if (!silent) setLoadingJobOrders(false);
        }
    };

    // Load Branches
    const loadBranches = async () => {
        try {
            const list = await fetchBranchesList();
            setBranches(list);
        } catch (e) {
            console.error("Branches load error:", e);
        }
    };

    // Daily Yield QA & Final release QA states
    const [yieldLedger, setYieldLedger] = useState<any[]>([]);
    const [dailyInspections, setDailyInspections] = useState<any[]>([]);
    const [qaTemplates, setQaTemplates] = useState<any[]>([]);
    const [qaParamValues, setQaParamValues] = useState<Record<number, string>>({});
    const [finalReleases, setFinalReleases] = useState<any[]>([]);
    const [lots, setLots] = useState<any[]>([]);
    const [lotsProducts, setLotsProducts] = useState<any[]>([]);
    const [loadingDailyQA, setLoadingDailyQA] = useState(false);
    const [loadingFinalQA, setLoadingFinalQA] = useState(false);

    // Recording Daily QA Dialog states
    const [isDailyAuditOpen, setIsDailyAuditOpen] = useState(false);
    const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<any | null>(null);
    const [moisturePct, setMoisturePct] = useState("");
    const [acidityPh, setAcidityPh] = useState("");
    const [sensoryStatus, setSensoryStatus] = useState<"Passed" | "Failed">("Passed");
    const [weightCheckPassed, setWeightCheckPassed] = useState(true);
    const [dailyLabStatus, setDailyLabStatus] = useState<"Pending" | "Passed" | "Failed">("Passed");
    const [dailyActionTaken, setDailyActionTaken] = useState<"Released" | "Quarantined" | "Scrapped">("Released");
    const [dailyRemarks, setDailyRemarks] = useState("");
    const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
    const [routes, setRoutes] = useState<any[]>([]);

    // Recording Final QA release Dialog states
    const [isFinalReleaseOpen, setIsFinalReleaseOpen] = useState(false);
    const [selectedLot, setSelectedLot] = useState<any | null>(null);
    const [inspectedQty, setInspectedQty] = useState("");
    const [defectQty, setDefectQty] = useState("");
    const [microbiologicalStatus, setMicrobiologicalStatus] = useState<"Pending" | "Passed" | "Failed">("Passed");
    const [packagingSealPassed, setPackagingSealPassed] = useState(true);
    const [labelCompliancePassed, setLabelCompliancePassed] = useState(true);
    const [overallDisposition, setOverallDisposition] = useState<"Approved" | "Quarantined" | "Rejected">("Approved");
    const [coaRefNo, setCoaRefNo] = useState("");
    const [finalRemarks, setFinalRemarks] = useState("");

    // Imports from services are now at the top of the file

    const loadDailyQAData = async (silent = false) => {
        if (!silent) setLoadingDailyQA(true);
        try {
            const ledger = await fetchYieldLedger();
            const inspections = await fetchDailyQAInspections();
            setYieldLedger(ledger);
            setDailyInspections(inspections);

            // Load QA templates list
            const res = await fetch("/api/manufacturing/qa?action=templates");
            if (res.ok) {
                const data = await res.json();
                setQaTemplates(data);
            }
        } catch (e) {
            console.error("Error loading daily QA data:", e);
        } finally {
            if (!silent) setLoadingDailyQA(false);
        }
    };

    const loadFinalQAData = async (silent = false) => {
        if (!silent) setLoadingFinalQA(true);
        try {
            const releases = await fetchFinalQAReleases();
            const lotsData = await fetchInventoryLotsData();
            setFinalReleases(releases);
            setLots(lotsData.lots);
            setLotsProducts(lotsData.products);
        } catch (e) {
            console.error("Error loading final QA data:", e);
        } finally {
            if (!silent) setLoadingFinalQA(false);
        }
    };

    // Refresh all data
    const refreshAll = (silent: boolean | any = false) => {
        const isSilent = silent === true;
        loadQALogs(isSilent);
        loadDispositions(isSilent);
        loadJobOrders(isSilent);
        loadDailyQAData(isSilent);
        loadFinalQAData(isSilent);
    };

    // Mount lifecycle
    useEffect(() => {
        refreshAll(false);
        loadBranches();
    }, []);

    // Establish Realtime SSE (Server-Sent Events) Connection for inventory movements
    useEffect(() => {
        let eventSource: EventSource | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let isDisposed = false;
        let reconnectAttempts = 0;

        const connectSSE = () => {
            if (isDisposed) return;
            if (reconnectAttempts >= 10) {
                console.warn("[QA Realtime SSE] Maximum reconnect attempts reached (10). Standing by.");
                return;
            }

            try {
                eventSource = new EventSource("/api/manufacturing/inventory/movements/stream");

                eventSource.addEventListener("movement", (event) => {
                    try {
                        const movement = JSON.parse(event.data);
                        console.log(`[QA Realtime SSE] Inventory movement detected (ID: ${movement.movement_id}). Refreshing QA dashboard data...`);
                        
                        // Silent reload to update QA dashboard data
                        refreshAll(true);
                    } catch (e) {
                        console.error("[QA Realtime SSE] Error parsing movement event data:", e);
                    }
                });

                eventSource.onerror = () => {
                    if (eventSource) {
                        eventSource.close();
                        eventSource = null;
                    }
                    if (!isDisposed && reconnectAttempts < 10) {
                        reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                        reconnectTimeout = setTimeout(connectSSE, delay);
                    }
                };

            } catch (err) {
                console.error("[QA Realtime SSE] Error initializing EventSource:", err);
                if (!isDisposed && reconnectAttempts < 10) {
                    reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                    reconnectTimeout = setTimeout(connectSSE, delay);
                }
            }
        };

        connectSSE();

        return () => {
            isDisposed = true;
            if (eventSource) {
                eventSource.close();
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
        };
    }, []);

    // Resolve Branch Name from ID
    const getBranchName = (branchId?: number | null) => {
        if (!branchId) return "Main Branch";
        const found = branches.find(b => Number(b.branch_id || b.id) === Number(branchId));
        if (found) return found.branch_name || found.name || `Branch #${branchId}`;
        
        switch (Number(branchId)) {
            case 1:
            case 183: return "Main Branch";
            case 163: return "Urdaneta Branch";
            case 181: return "Bihon Branch";
            case 182: return "Bihon Bad Branch";
            default: return `Branch #${branchId}`;
        }
    };

    // Filtered QA Logs
    const filteredQALogs = useMemo(() => {
        return qaLogs.filter(log => {
            const joNo = typeof log.task_id === "object" ? log.task_id?.jo_id || "" : "";
            const stepName = typeof log.task_id === "object" ? log.task_id?.operation_name || log.task_id?.name || "" : "";
            const matchesSearch = joNo.toLowerCase().includes(logSearch.toLowerCase()) || 
                                  stepName.toLowerCase().includes(logSearch.toLowerCase()) ||
                                  (log.comments || "").toLowerCase().includes(logSearch.toLowerCase());
            
            const matchesStatus = logStatusFilter === "all" ? true : log.qa_status.toLowerCase() === logStatusFilter.toLowerCase();
            
            return matchesSearch && matchesStatus;
        });
    }, [qaLogs, logSearch, logStatusFilter]);

    // Active Pending Holds (Quarantined Job Orders)
    const pendingHolds = useMemo(() => {
        return dispositions.filter(d => d.disposition_status === "Pending");
    }, [dispositions]);

    // Filtered Active Job Orders (Awaiting yield closing)
    const activeJobOrders = useMemo(() => {
        return jobOrders.filter(jo => {
            const status = jo.status?.toLowerCase();
            const isCompleted = status === "finished" || status === "completed" || status === "cancelled" || status === "closed";
            const matchesSearch = jo.jo_id.toLowerCase().includes(joSearch.toLowerCase()) || 
                                  jo.product_name.toLowerCase().includes(joSearch.toLowerCase());
            return !isCompleted && matchesSearch;
        });
    }, [jobOrders, joSearch]);

    // Filtered Closed Job Orders (Completed/Closed runs)
    const closedJobOrders = useMemo(() => {
        return jobOrders.filter(jo => {
            const status = jo.status?.toLowerCase();
            const isCompleted = status === "finished" || status === "completed" || status === "closed";
            const matchesSearch = jo.jo_id.toLowerCase().includes(joSearch.toLowerCase()) || 
                                  jo.product_name.toLowerCase().includes(joSearch.toLowerCase());
            return isCompleted && matchesSearch;
        });
    }, [jobOrders, joSearch]);

    // Handle Open Yield Dialog
    const handleOpenYieldDialog = (jo: JobOrder) => {
        setSelectedJO(jo);
        setYieldQty(String(jo.quantity));
        
        // Find the first yield log to extract the lot number, mfg date, and expiry date if available
        const firstLog = jo.yield_logs && jo.yield_logs.length > 0 ? jo.yield_logs[0] : null;
        
        if (firstLog) {
            setLotNumber(firstLog.lot_number || firstLog.lot_no || firstLog.batch_no || `MFG-${jo.jo_id}`);
            setManufacturingDate(firstLog.manufacturing_date || firstLog.mfg_date || "");
            setExpiryDate(firstLog.expiry_date || "");
        } else {
            setLotNumber(`MFG-${jo.jo_id}`);
            setManufacturingDate("");
            setExpiryDate("");
        }
        
        setUnitCost("0");
        setIsYieldDialogOpen(true);
    };

    const handleReprintReceipt = async (jo: JobOrder) => {
        if (!jo) return;
        const log = jo.yield_logs && jo.yield_logs.length > 0 ? jo.yield_logs[0] : null;
        
        const branchName = getBranchName(jo.branch_id);
        const verName = jo.recipe_version_name || 
                        jo.recipeVersionName || 
                        jo.version_name || 
                        jo.versionName || 
                        ((jo.version_id || jo.versionId || jo.bom?.version_id) 
                            ? `Version #${jo.version_id || jo.versionId || jo.bom?.version_id}` 
                            : 'Active');

        let components: Array<PrintReceiptComponent> = [];
        try {
            const materials = await fetchJobOrderMaterials(jo.jo_id);
            components = materials.map((m: any) => ({
                product_name: m.product_name || `Component #${m.product_id}`,
                quantity: Number(m.actual_consumed_quantity || m.quantity_required || 0),
                unit: m.unit_shortcut || "units"
            }));
        } catch (err) {
            console.error("Failed to load materials for receipt reprint:", err);
        }

        printYieldClosingReceipt({
            jo_no: jo.jo_id,
            product_code: jo.product_code || `PROD-${jo.product_id}`,
            product_name: jo.product_name,
            recipe_version: verName,
            yield_qty: log ? Number(log.yield_quantity || jo.producedQty || jo.produced_quantity || 0) : Number(jo.producedQty || jo.produced_quantity || jo.quantity || 0),
            lot_number: log ? (log.lot_number || log.lot_no || `MFG-${jo.jo_id}`) : `MFG-${jo.jo_id}`,
            expiry_date: log ? (log.expiry_date || "N/A") : "N/A",
            manufacturing_date: log ? (log.manufacturing_date || "N/A") : "N/A",
            branch_name: branchName,
            unit_cost: log ? Number(log.unit_cost || 0) : 0,
            components: components
        });
    };

    // Submit Finished Goods Yield closing
    const handleSubmitYieldClosing = async () => {
        if (!selectedJO) return;
        if (!yieldQty || isNaN(Number(yieldQty)) || Number(yieldQty) <= 0) {
            toast.error("Please enter a valid yield quantity.");
            return;
        }
        if (!manufacturingDate) {
            toast.error("Please select a manufacturing date.");
            return;
        }
        if (!expiryDate) {
            toast.error("Please select an expiration date.");
            return;
        }

        setActionLoading(true);
        try {
            let componentsConsumed: Array<{
                component_product_id: number;
                required: number;
                quantity: number;
                component_name: string;
            }> = [];
            try {
                const materials = await fetchJobOrderMaterials(selectedJO.jo_id);
                componentsConsumed = materials.map((m: any) => ({
                    component_product_id: m.product_id,
                    required: m.quantity_required,
                    quantity: m.quantity_required,
                    component_name: m.product_name
                }));
            } catch (err) {
                console.warn("Failed to load materials for yield closing consumption:", err);
            }

            if (!selectedJO.branch_id) {
                toast.error("Error: Job Order is missing branch_id allocation.");
                return;
            }

            await postFinishedGoodsReceipt({
                joId: selectedJO.jo_id,
                productId: selectedJO.product_id,
                productName: selectedJO.product_name,
                quantityProduced: Number(yieldQty),
                branchId: Number(selectedJO.branch_id),
                lotNumber: lotNumber || `MFG-${selectedJO.jo_id}`,
                expirationDate: expiryDate || null,
                manufacturingDate: manufacturingDate || null,
                unitCost: Number(unitCost || 0),
                componentsConsumed: componentsConsumed,
                completeJobOrder: true
            });

            toast.success(`Job Order ${selectedJO.jo_id} successfully completed and WMS ledger receipted!`);
            setIsYieldDialogOpen(false);
            
            // Trigger auto print
            try {
                const branchName = getBranchName(selectedJO.branch_id);
                const verName = selectedJO.recipe_version_name || 
                                selectedJO.recipeVersionName || 
                                selectedJO.version_name || 
                                selectedJO.versionName || 
                                ((selectedJO.version_id || selectedJO.versionId || selectedJO.bom?.version_id) 
                                    ? `Version #${selectedJO.version_id || selectedJO.versionId || selectedJO.bom?.version_id}` 
                                    : 'Active');

                printYieldClosingReceipt({
                    jo_no: selectedJO.jo_id,
                    product_code: selectedJO.product_code || `PROD-${selectedJO.product_id}`,
                    product_name: selectedJO.product_name,
                    recipe_version: verName,
                    yield_qty: Number(yieldQty),
                    lot_number: lotNumber || `MFG-${selectedJO.jo_id}`,
                    expiry_date: expiryDate || "N/A",
                    manufacturing_date: manufacturingDate || "N/A",
                    branch_name: branchName,
                    unit_cost: Number(unitCost || 0),
                    components: componentsConsumed.map((c: any) => ({
                        product_name: c.component_name,
                        quantity: c.quantity,
                        unit: "units"
                    }))
                });
            } catch (printErr) {
                console.error("Auto print failed:", printErr);
            }

            refreshAll();
        } catch (e: any) {
            console.error("Yield closing error:", e);
            toast.error(e.message || "An error occurred during finished goods yield closing.");
        } finally {
            setActionLoading(false);
        }
    };

    // Handle Open Supervisor Override Dialog
    const handleOpenOverrideDialog = (disp: DispositionRecord) => {
        setSelectedDisp(disp);
        setOverrideDecision("Release with Deviation");
        setOverrideComments("");
        setIsOverrideDialogOpen(true);
    };

    // Submit Supervisor Override resolution
    const handleSubmitOverride = async () => {
        if (!selectedDisp) return;
        if (!overrideComments.trim()) {
            toast.error("Please enter supervisor reasoning comments.");
            return;
        }

        setActionLoading(true);
        try {
            await postSupervisorOverride({
                action: "disposition",
                dispositionId: selectedDisp.id,
                decision: overrideDecision,
                supervisorComments: overrideComments.trim(),
                userId: 1
            });

            toast.success(`Hold resolved successfully: Quarantined Job Order updated to "${overrideDecision}"`);
            setIsOverrideDialogOpen(false);
            refreshAll();
        } catch (e: any) {
            console.error("Override submission error:", e);
            toast.error(e.message || "Failed to resolve quarantine hold.");
        } finally {
            setActionLoading(false);
        }
    };

    // Handle Open Daily QA Dialog
    const handleOpenDailyAuditDialog = (ledgerEntry: any) => {
        setSelectedLedgerEntry(ledgerEntry);
        setMoisturePct("");
        setAcidityPh("");
        setSensoryStatus("Passed");
        setWeightCheckPassed(true);
        setDailyLabStatus("Passed");
        setDailyActionTaken("Released");
        setDailyRemarks("");
        setQaParamValues({}); // Reset dynamic parameter inputs

        const jo = jobOrders.find(
            (j) => 
                Number(j.order_id || j.job_order_id || j.id) === Number(ledgerEntry.job_order_id) ||
                j.jo_id === String(ledgerEntry.job_order_id)
        );
        const tasks = jo ? (jo.routing_tasks || jo.routingTasks || []) : [];
        setRoutes(tasks);

        // Find the first task that has NOT been audited yet for this ledger entry
        const audits = dailyInspections.filter((ins: any) => Number(ins.ledger_id) === Number(ledgerEntry.ledger_id || ledgerEntry.id));
        const pendingTask = tasks.find((t: any) => !audits.some((a: any) => Number(a.jo_route_id) === Number(t.id)));
        
        setSelectedRouteId(pendingTask ? (pendingTask.id || null) : (tasks.length > 0 ? (tasks[0].id || null) : null));

        setIsDailyAuditOpen(true);
    };

    // Submit Daily QA Inspection
    const handleSubmitDailyAudit = async () => {
        if (!selectedLedgerEntry) return;

        const jo = jobOrders.find(
            (j) => 
                Number(j.order_id || j.job_order_id || j.id) === Number(selectedLedgerEntry.job_order_id) ||
                j.jo_id === String(selectedLedgerEntry.job_order_id)
        );
        const tasks = jo ? (jo.routing_tasks || jo.routingTasks || []) : [];

        // Prepare the inspections array for all steps
        const inspectionsPayload = tasks.map((task: any) => {
            let activeParameters: any[] = [];
            if (task.qa_template_id) {
                const activeTemplate = qaTemplates.find((t: any) => Number(t.template_id) === Number(task.qa_template_id));
                if (activeTemplate) {
                    activeParameters = activeTemplate.parameters || [];
                }
            }

            // Map parameter values to payload format for this task
            const qaParametersPayload = activeParameters.map((param: any) => {
                const val = qaParamValues[param.parameter_id] || "";
                let isFailed = false;

                if (param.test_type === "Numeric" && val) {
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                        if (param.min_value !== null && num < Number(param.min_value)) isFailed = true;
                        if (param.max_value !== null && num > Number(param.max_value)) isFailed = true;
                    }
                } else if (param.test_type === "Boolean" || param.test_type === "Pass/Fail" || param.test_type === "Yes/No") {
                    if (val === "Fail" || val === "false" || val === "No") {
                        isFailed = true;
                    }
                }

                return {
                    parameter_id: param.parameter_id,
                    test_name: param.test_name,
                    value: val,
                    is_failed: isFailed,
                    remarks: isFailed ? "Out of specification range" : "In specification"
                };
            });

            // Auto-extract moisture and acidity pH for this step
            let resolvedMoisture = "";
            let resolvedAcidity = "";
            activeParameters.forEach((param: any) => {
                const val = qaParamValues[param.parameter_id];
                if (!val) return;
                const name = (param.test_name || "").toLowerCase();
                if (name.includes("moisture")) {
                    resolvedMoisture = val;
                } else if (name.includes("ph") || name.includes("acidity")) {
                    resolvedAcidity = val;
                }
            });

            // Determine sensory status/action taken per step
            const stepHasFailure = qaParametersPayload.some(p => p.is_failed);
            const stepSensoryStatus = stepHasFailure ? "Failed" : sensoryStatus;
            const stepActionTaken = stepHasFailure ? "Quarantined" : dailyActionTaken;
            const stepLabStatus = stepHasFailure ? "Failed" : dailyLabStatus;

            return {
                jobOrderId: selectedLedgerEntry.job_order_id,
                joRouteId: task.id,
                ledgerId: selectedLedgerEntry.id || selectedLedgerEntry.ledger_id,
                inspectorId: 1, // Default supervisor ID
                moisturePercentage: resolvedMoisture,
                acidityPh: resolvedAcidity,
                sensoryStatus: stepSensoryStatus,
                weightCheckPassed: 1,
                labStatus: stepLabStatus,
                actionTaken: stepActionTaken,
                remarks: stepHasFailure ? `[Critical Specs Failed] ${dailyRemarks}` : dailyRemarks,
                qaParameters: qaParametersPayload
            };
        });

        setActionLoading(true);
        try {
            await postDailyQAInspection(inspectionsPayload);

            toast.success("Daily yield QA checklist signed off successfully.");
            setIsDailyAuditOpen(false);
            refreshAll();
        } catch (e: any) {
            console.error("Daily QA submission error:", e);
            toast.error(e.message || "Failed to log daily QA inspection.");
        } finally {
            setActionLoading(false);
        }
    };

    // Handle Open Final QA Release Dialog
    const handleOpenFinalReleaseDialog = (lot: any) => {
        setSelectedLot(lot);
        setInspectedQty(String(lot.quantity_received || lot.quantity || 0));
        setDefectQty("0");
        setMicrobiologicalStatus("Passed");
        setPackagingSealPassed(true);
        setLabelCompliancePassed(true);
        setOverallDisposition("Approved");
        setCoaRefNo(`COA-${lot.lot_number}`);
        setFinalRemarks("");
        setIsFinalReleaseOpen(true);
    };

    // Submit Final QA Release
    const handleSubmitFinalRelease = async () => {
        if (!selectedLot) return;

        setActionLoading(true);
        try {
            // Self-healing: Resolve correct Job Order ID from lot number
            const matchingJO = jobOrders.find(jo => selectedLot.lot_number?.includes(jo.jo_id));
            const resolvedJoId = matchingJO ? matchingJO.order_id || matchingJO.id || 0 : 0;

            await postFinalQARelease({
                jobOrderId: resolvedJoId,
                lotId: selectedLot.line_id || selectedLot.id || selectedLot.lot_id,
                inspectedQuantity: Number(inspectedQty),
                defectQuantity: Number(defectQty),
                microbiologicalStatus,
                packagingSealPassed,
                labelCompliancePassed,
                overallDisposition,
                coaReferenceNo: coaRefNo,
                approvedBy: 1, // Supervisor
                remarks: finalRemarks
            });

            toast.success(`Finished Goods Lot successfully released: ${overallDisposition}`);
            setIsFinalReleaseOpen(false);
            refreshAll();
        } catch (e: any) {
            console.error("Final QA release error:", e);
            toast.error(e.message || "Failed to record final QA lot release.");
        } finally {
            setActionLoading(false);
        }
    };

    return {
        activeTab,
        setActiveTab,
        qaLogs,
        dispositions,
        jobOrders,
        branches,
        loadingLogs,
        loadingDispositions,
        loadingJobOrders,
        actionLoading,
        logSearch,
        setLogSearch,
        logStatusFilter,
        setLogStatusFilter,
        joSearch,
        setJoSearch,
        selectedJO,
        isYieldDialogOpen,
        setIsYieldDialogOpen,
        yieldQty,
        setYieldQty,
        lotNumber,
        setLotNumber,
        manufacturingDate,
        setManufacturingDate,
        expiryDate,
        setExpiryDate,
        unitCost,
        setUnitCost,
        selectedDisp,
        isOverrideDialogOpen,
        setIsOverrideDialogOpen,
        overrideDecision,
        setOverrideDecision,
        overrideComments,
        setOverrideComments,
        refreshAll,
        getBranchName,
        filteredQALogs,
        pendingHolds,
        activeJobOrders,
        closedJobOrders,
        handleOpenYieldDialog,
        handleSubmitYieldClosing,
        handleReprintReceipt,
        handleOpenOverrideDialog,
        handleSubmitOverride,

        // Daily Yield QA states & handlers
        yieldLedger,
        dailyInspections,
        loadingDailyQA,
        isDailyAuditOpen,
        setIsDailyAuditOpen,
        selectedLedgerEntry,
        moisturePct,
        setMoisturePct,
        acidityPh,
        setAcidityPh,
        sensoryStatus,
        setSensoryStatus,
        weightCheckPassed,
        setWeightCheckPassed,
        dailyLabStatus,
        setDailyLabStatus,
        dailyActionTaken,
        setDailyActionTaken,
        dailyRemarks,
        setDailyRemarks,
        handleOpenDailyAuditDialog,
        handleSubmitDailyAudit,
        selectedRouteId,
        setSelectedRouteId,
        routes,
        qaTemplates,
        qaParamValues,
        setQaParamValues,

        // Final QA states & handlers
        finalReleases,
        lots,
        lotsProducts,
        loadingFinalQA,
        isFinalReleaseOpen,
        setIsFinalReleaseOpen,
        selectedLot,
        inspectedQty,
        setInspectedQty,
        defectQty,
        setDefectQty,
        microbiologicalStatus,
        setMicrobiologicalStatus,
        packagingSealPassed,
        setPackagingSealPassed,
        labelCompliancePassed,
        setLabelCompliancePassed,
        overallDisposition,
        setOverallDisposition,
        coaRefNo,
        setCoaRefNo,
        finalRemarks,
        setFinalRemarks,
        handleOpenFinalReleaseDialog,
        handleSubmitFinalRelease
    };
}
