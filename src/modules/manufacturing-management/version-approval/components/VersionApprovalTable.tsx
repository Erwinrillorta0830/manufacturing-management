"use client";

import React from "react";
import { VersionApprovalItem } from "../types";
import { Card } from "@/components/ui/card";
import {
    Table,
    TableHeader,
    TableBody,
    TableHead,
    TableRow,
    TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle, XCircle, Clock, AlertTriangle, Layers } from "lucide-react";

interface VersionApprovalTableProps {
    items: VersionApprovalItem[];
    loading: boolean;
    onReviewAndCompare: (item: VersionApprovalItem) => void;
    onQuickApprove: (item: VersionApprovalItem) => void;
    onReject: (item: VersionApprovalItem) => void;
}

export const VersionApprovalTable: React.FC<VersionApprovalTableProps> = ({
    items,
    loading,
    onReviewAndCompare,
    onQuickApprove,
    onReject,
}) => {
    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        } catch {
            return dateStr;
        }
    };

    const renderStatusBadge = (status: string) => {
        switch (status) {
            case "Pending Approval":
            case "For Approval":
                return (
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
                        <Clock size={13} />
                        Pending Approval
                    </Badge>
                );
            case "Approved":
            case "Active":
                return (
                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
                        <CheckCircle size={13} />
                        {status === "Active" ? "Active Version" : "Approved"}
                    </Badge>
                );
            case "Rejected":
                return (
                    <Badge variant="destructive" className="bg-rose-500/15 text-rose-400 border-rose-500/30 gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
                        <XCircle size={13} />
                        Rejected
                    </Badge>
                );
            case "Revision Required":
            case "Revision":
                return (
                    <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
                        <AlertTriangle size={13} />
                        Revision Required
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 rounded-full px-2.5 py-1 text-xs font-semibold">
                        {status}
                    </Badge>
                );
        }
    };

    if (loading) {
        return (
            <Card className="va-table-card">
                <div className="va-loading-state">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                    <p>Loading version approval requests...</p>
                </div>
            </Card>
        );
    }

    if (items.length === 0) {
        return (
            <Card className="va-table-card">
                <div className="va-empty-state">
                    <Layers size={36} className="text-muted-foreground mb-1" />
                    <h3 className="font-semibold text-foreground">No version approvals found</h3>
                    <p className="text-sm text-muted-foreground">
                        There are no product version approval records matching your current filter.
                    </p>
                </div>
            </Card>
        );
    }

    return (
        <Card className="va-table-card overflow-hidden">
            <div className="va-table-scroll">
                <Table className="va-table">
                    <TableHeader>
                        <TableRow className="border-b border-border hover:bg-transparent">
                            <TableHead className="text-muted-foreground uppercase text-xs">Product</TableHead>
                            <TableHead className="text-muted-foreground uppercase text-xs">Version Name</TableHead>
                            <TableHead className="text-muted-foreground uppercase text-xs">Base Qty</TableHead>
                            <TableHead className="text-muted-foreground uppercase text-xs">Yield %</TableHead>
                            <TableHead className="text-muted-foreground uppercase text-xs">Created By & Date</TableHead>
                            <TableHead className="text-muted-foreground uppercase text-xs">Status</TableHead>
                            <TableHead className="text-right text-muted-foreground uppercase text-xs pr-6">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.id} className="border-b border-border/60 hover:bg-muted/40">
                                <TableCell>
                                    <div className="va-product-cell">
                                        <div className="va-product-name-row">
                                            <span className="va-product-name">{item.product_name}</span>
                                            <Badge variant="outline" className="text-[11px] py-0 px-2 bg-secondary text-secondary-foreground border-border">
                                                {item.category}
                                            </Badge>
                                        </div>
                                        <span className="va-product-code">{item.product_code}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="font-semibold text-foreground">{item.version_name}</span>
                                </TableCell>
                                <TableCell>
                                    <span className="font-mono text-foreground">
                                        {item.base_quantity.toLocaleString()}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span
                                        className={`font-semibold ${item.expected_yield_percentage >= 98
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : item.expected_yield_percentage >= 95
                                                    ? "text-amber-600 dark:text-amber-400"
                                                    : "text-rose-600 dark:text-rose-400"
                                            }`}
                                    >
                                        {item.expected_yield_percentage.toFixed(1)}%
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col text-xs">
                                        <span className="text-foreground font-medium">{item.created_by}</span>
                                        <span className="text-muted-foreground">{formatDate(item.created_at)}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{renderStatusBadge(item.status)}</TableCell>
                                <TableCell>
                                    <div className="va-actions-cell justify-end gap-1.5">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="default"
                                            className="gap-1.5 h-8 px-3 text-xs"
                                            onClick={() => onReviewAndCompare(item)}
                                            title="Review Version Summary & BOM Details"
                                        >
                                            <Eye size={14} />
                                            <span>Review Version</span>
                                        </Button>

                                        {((item.status as string) === "Pending Approval" || (item.status as string) === "For Approval" || (item.status as string) === "Revision Required" || (item.status as string) === "Revision") && (
                                            <>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 w-8 p-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 hover:text-emerald-300"
                                                    onClick={() => onQuickApprove(item)}
                                                    title="Quick Approve"
                                                >
                                                    <CheckCircle size={15} />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="destructive"
                                                    className="h-8 w-8 p-0 bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 hover:text-rose-300"
                                                    onClick={() => onReject(item)}
                                                    title="Reject Version"
                                                >
                                                    <XCircle size={15} />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
};

export default VersionApprovalTable;

