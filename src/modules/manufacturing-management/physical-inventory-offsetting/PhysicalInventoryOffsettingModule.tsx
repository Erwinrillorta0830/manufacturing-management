"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
    OffsettingSheetQueueItem,
    OffsettingPairing,
    Branch
} from "./types";
import {
    fetchOffsettingQueueSheets,
    fetchOffsettingSheetById,
    saveOffsettingPairings,
    commitOffsettingSheet
} from "./services/offsetting-api";
import { fetchMasterBranches } from "../physical-inventory-manufacturing/services/physical-inventory-manufacturing-api";
import OffsettingSheetsList from "./components/OffsettingSheetsList";
import OffsettingWorkspace from "./components/OffsettingWorkspace";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

function OffsettingModuleContent() {
    const searchParams = useSearchParams();
    const targetIdParam = searchParams.get("id") || searchParams.get("pi_id");

    const [view, setView] = useState<"QUEUE" | "WORKSPACE">("QUEUE");
    const [sheets, setSheets] = useState<OffsettingSheetQueueItem[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [activeSheet, setActiveSheet] = useState<OffsettingSheetQueueItem | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

    const showToast = (message: string, type: "success" | "error" = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 5000);
    };

    const loadQueue = useCallback(async () => {
        try {
            setLoading(true);
            const [qList, bList] = await Promise.all([
                fetchOffsettingQueueSheets(),
                fetchMasterBranches()
            ]);
            setSheets(qList);
            setBranches(bList);
            return qList;
        } catch (err: unknown) {
            console.error("Error loading offsetting queue:", err);
            showToast("Failed to load physical inventory offsetting queue", "error");
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        const init = async () => {
            const qList = await loadQueue();
            if (!isMounted) return;

            if (targetIdParam) {
                const targetId = Number(targetIdParam);
                if (!isNaN(targetId) && targetId > 0) {
                    try {
                        setLoading(true);
                        const fullSheet = await fetchOffsettingSheetById(targetId);
                        if (isMounted && fullSheet) {
                            setActiveSheet(fullSheet);
                            setView("WORKSPACE");
                        } else if (isMounted) {
                            const matchInQueue = qList.find(s => s.physical_inventory_id === targetId);
                            if (matchInQueue) {
                                setActiveSheet(matchInQueue);
                                setView("WORKSPACE");
                            }
                        }
                    } catch (e) {
                        console.error("Error auto-loading target PI sheet:", e);
                    } finally {
                        if (isMounted) setLoading(false);
                    }
                }
            }
        };

        init();
        return () => { isMounted = false; };
    }, [targetIdParam, loadQueue]);

    const handleSelectSheet = async (sheet: OffsettingSheetQueueItem) => {
        try {
            setLoading(true);
            const fullSheet = await fetchOffsettingSheetById(sheet.physical_inventory_id);
            setActiveSheet(fullSheet || sheet);
            setView("WORKSPACE");
        } catch (e) {
            console.error("Error loading full sheet details:", e);
            setActiveSheet(sheet);
            setView("WORKSPACE");
        } finally {
            setLoading(false);
        }
    };

    const handleSavePairings = async (pairings: OffsettingPairing[]) => {
        if (!activeSheet) return;
        try {
            const saved = await saveOffsettingPairings(activeSheet.physical_inventory_id, pairings);
            setActiveSheet(prev => prev ? { ...prev, offset_pairings: saved } : null);
            showToast(`Saved ${pairings.length} offset pairings.`);
            await loadQueue();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to save pairings";
            showToast(msg, "error");
            throw err;
        }
    };

    const handleCommitSheet = async (pairings: OffsettingPairing[], auditNotes?: string) => {
        if (!activeSheet) return;
        try {
            await saveOffsettingPairings(activeSheet.physical_inventory_id, pairings);
            await commitOffsettingSheet(activeSheet.physical_inventory_id, auditNotes);
            showToast(`Physical inventory sheet #${activeSheet.pi_no} committed successfully.`);
            await loadQueue();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to commit inventory sheet";
            showToast(msg, "error");
            throw err;
        }
    };

    return (
        <div className="space-y-4">
            {toast && (
                <div
                    className={`flex items-center justify-between p-3.5 rounded-lg border text-xs font-semibold shadow-xs animate-in fade-in-50 ${
                        toast.type === "success"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                            : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        {toast.type === "success" ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        )}
                        <span>{toast.message}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setToast(null)}
                        className="p-1 hover:opacity-75 transition-opacity"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {view === "QUEUE" || !activeSheet ? (
                <OffsettingSheetsList
                    sheets={sheets}
                    branches={branches}
                    loading={loading}
                    onRefresh={loadQueue}
                    onSelectSheet={handleSelectSheet}
                />
            ) : (
                <OffsettingWorkspace
                    sheet={activeSheet}
                    onBack={() => {
                        setView("QUEUE");
                        loadQueue();
                    }}
                    onSavePairings={handleSavePairings}
                    onCommitSheet={handleCommitSheet}
                />
            )}
        </div>
    );
}

export default function PhysicalInventoryOffsettingModule() {
    return (
        <Suspense fallback={
            <div className="p-8 text-center text-xs font-semibold text-muted-foreground animate-pulse">
                Loading Offsetting Audit Workspace...
            </div>
        }>
            <OffsettingModuleContent />
        </Suspense>
    );
}
