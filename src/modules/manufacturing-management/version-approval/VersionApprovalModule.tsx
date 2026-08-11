"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import "./version-approval.css";
import {
    VersionApprovalItem,
    VersionApprovalKPISummary,
    ApprovalStatus
} from "./types";
import VersionApprovalTable from "./components/VersionApprovalTable";
import VersionReviewModal from "./components/VersionReviewModal";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Clock,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Search,
    RotateCw,
    ShieldCheck
} from "lucide-react";

export const VersionApprovalModule: React.FC = () => {
    const [items, setItems] = useState<VersionApprovalItem[]>([]);
    const [kpi, setKpi] = useState<VersionApprovalKPISummary>({
        pendingCount: 0,
        approvedMonthCount: 0,
        rejectedCount: 0,
        revisionCount: 0,
    });
    const [loading, setLoading] = useState<boolean>(true);
    const [selectedTab, setSelectedTab] = useState<ApprovalStatus>("All");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedItem, setSelectedItem] = useState<VersionApprovalItem | null>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
    const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const fetchApprovals = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/manufacturing/finished-goods/versions/approvals", { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to fetch version approvals");
            const data = await res.json();
            setItems(data.data || []);
            if (data.kpi) {
                setKpi(data.kpi);
            }
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Error loading approvals:", err);
            setActionMessage({ type: "error", text: error.message || "Failed to load approval records." });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchApprovals();
    }, [fetchApprovals]);

    const handleQuickApprove = async (item: VersionApprovalItem) => {
        if (!confirm(`Are you sure you want to approve version '${item.version_name}' for ${item.product_name}?`)) {
            return;
        }

        try {
            const res = await fetch("/api/manufacturing/finished-goods/versions/approvals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    versionId: item.version_id,
                    action: "approve",
                    setActive: true
                }),
            });
            const result = await res.json();
            if (!res.ok || result.error) throw new Error(result.error || "Failed to approve version");

            setActionMessage({ type: "success", text: `Version '${item.version_name}' approved & set active successfully!` });
            fetchApprovals();
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Quick approve error:", err);
            setActionMessage({ type: "error", text: error.message || "Failed to approve version." });
        }
    };

    const handleQuickReject = async (item: VersionApprovalItem) => {
        const reason = prompt(`Enter rejection reason for version '${item.version_name}':`);
        if (reason === null) return; // User cancelled
        if (!reason.trim()) {
            alert("Rejection reason is required.");
            return;
        }

        try {
            const res = await fetch("/api/manufacturing/finished-goods/versions/approvals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    versionId: item.version_id,
                    action: "reject",
                    reason: reason.trim()
                }),
            });
            const result = await res.json();
            if (!res.ok || result.error) throw new Error(result.error || "Failed to reject version");

            setActionMessage({ type: "success", text: `Version '${item.version_name}' rejected.` });
            fetchApprovals();
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Quick reject error:", err);
            setActionMessage({ type: "error", text: error.message || "Failed to reject version." });
        }
    };

    const handleOpenReviewModal = (item: VersionApprovalItem) => {
        setSelectedItem(item);
        setIsReviewModalOpen(true);
    };

    // Filter & Search computation
    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            // Status Tab Filter
            if ((selectedTab as string) !== "All") {
                const s = item.status as string;
                const tab = selectedTab as string;
                if (tab === "Pending Approval" || tab === "For Approval") {
                    if (s !== "Pending Approval" && s !== "For Approval") return false;
                } else if (tab === "Approved" || tab === "Active") {
                    if (s !== "Approved" && s !== "Active") return false;
                } else if (tab === "Rejected") {
                    if (s !== "Rejected") return false;
                } else if (tab === "Revision Required" || tab === "Revision") {
                    if (s !== "Revision Required" && s !== "Revision") return false;
                } else {
                    if (s !== tab) return false;
                }
            }

            // Search Query Filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchName = item.product_name.toLowerCase().includes(q);
                const matchCode = item.product_code.toLowerCase().includes(q);
                const matchVer = item.version_name.toLowerCase().includes(q);
                const matchCategory = item.category.toLowerCase().includes(q);
                const matchCreator = item.created_by.toLowerCase().includes(q);
                return matchName || matchCode || matchVer || matchCategory || matchCreator;
            }

            return true;
        });
    }, [items, selectedTab, searchQuery]);

    return (
        <div className="va-container">
            {/* Header & Subtitle */}
            <div className="va-header">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="text-blue-500" size={28} />
                    <h1 className="va-title">Product Version Approval</h1>
                </div>
                <p className="va-subtitle">
                    Evaluate engineering BOM & Routing changes, compare side-by-side diffs, and approve production versions.
                </p>
            </div>

            {/* Banner Notifications */}
            {actionMessage && (
                <Alert
                    variant={actionMessage.type === "error" ? "destructive" : "default"}
                    className={`flex items-center justify-between p-4 border ${
                        actionMessage.type === "success"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                            : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
                    }`}
                >
                    <AlertDescription className="text-sm font-medium">
                        {actionMessage.text}
                    </AlertDescription>
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setActionMessage(null)}
                        className="text-xs hover:underline opacity-80 h-auto p-1 text-current hover:bg-transparent"
                    >
                        Dismiss
                    </Button>
                </Alert>
            )}

            {/* KPI Summary Cards Grid */}
            <div className="va-kpi-grid">
                <Card className="va-kpi-card p-4 flex flex-row items-center gap-4">
                    <div className="va-kpi-icon-wrapper va-kpi-icon-pending">
                        <Clock size={22} />
                    </div>
                    <div className="va-kpi-content flex-1">
                        <CardHeader className="p-0">
                            <CardTitle className="va-kpi-value">{kpi.pendingCount}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <span className="va-kpi-label">Pending Approval</span>
                        </CardContent>
                    </div>
                </Card>

                <Card className="va-kpi-card p-4 flex flex-row items-center gap-4">
                    <div className="va-kpi-icon-wrapper va-kpi-icon-approved">
                        <CheckCircle2 size={22} />
                    </div>
                    <div className="va-kpi-content flex-1">
                        <CardHeader className="p-0">
                            <CardTitle className="va-kpi-value">{kpi.approvedMonthCount}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <span className="va-kpi-label">Approved This Month</span>
                        </CardContent>
                    </div>
                </Card>

                <Card className="va-kpi-card p-4 flex flex-row items-center gap-4">
                    <div className="va-kpi-icon-wrapper va-kpi-icon-revision">
                        <AlertTriangle size={22} />
                    </div>
                    <div className="va-kpi-content flex-1">
                        <CardHeader className="p-0">
                            <CardTitle className="va-kpi-value">{kpi.revisionCount}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <span className="va-kpi-label">Revision Required</span>
                        </CardContent>
                    </div>
                </Card>

                <Card className="va-kpi-card p-4 flex flex-row items-center gap-4">
                    <div className="va-kpi-icon-wrapper va-kpi-icon-rejected">
                        <XCircle size={22} />
                    </div>
                    <div className="va-kpi-content flex-1">
                        <CardHeader className="p-0">
                            <CardTitle className="va-kpi-value">{kpi.rejectedCount}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <span className="va-kpi-label">Rejected</span>
                        </CardContent>
                    </div>
                </Card>
            </div>

            {/* Filter Tabs & Search Control Bar */}
            <div className="va-controls">
                <div className="flex border-b border-border/60 gap-1 bg-muted/20 px-2 pt-1 rounded-t-xl shrink-0 overflow-x-auto">
                    {(["All", "Pending Approval", "Approved", "Rejected", "Revision Requested"] as ApprovalStatus[]).map((status) => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => setSelectedTab(status)}
                            className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                                selectedTab === status
                                    ? "border-primary text-primary bg-background rounded-t-lg shadow-xs"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>


                <div className="flex items-center gap-2">
                    <div className="relative flex items-center min-w-[280px]">
                        <Search size={16} className="absolute left-3 text-muted-foreground pointer-events-none" />
                        <Input
                            type="text"
                            className="pl-9 h-9 bg-background border-input text-foreground placeholder:text-muted-foreground"
                            placeholder="Search by product, code, or version..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5"
                        onClick={fetchApprovals}
                        title="Refresh List"
                    >
                        <RotateCw size={14} className={loading ? "animate-spin" : ""} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                </div>
            </div>

            {/* Version Approval Table */}
            <VersionApprovalTable
                items={filteredItems}
                loading={loading}
                onReviewAndCompare={handleOpenReviewModal}
                onQuickApprove={handleQuickApprove}
                onReject={handleQuickReject}
            />

            {/* Side-by-Side Review & Comparison Modal */}
            {isReviewModalOpen && (
                <VersionReviewModal
                    item={selectedItem}
                    onClose={() => {
                        setIsReviewModalOpen(false);
                        setSelectedItem(null);
                    }}
                    onSuccess={() => {
                        setActionMessage({
                            type: "success",
                            text: "Approval decision submitted successfully!"
                        });
                        fetchApprovals();
                    }}
                />
            )}
        </div>
    );
};

export default VersionApprovalModule;

