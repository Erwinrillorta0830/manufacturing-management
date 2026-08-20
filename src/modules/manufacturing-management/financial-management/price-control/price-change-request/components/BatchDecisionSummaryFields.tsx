"use client";

import { decisionUserLabel } from "../utils/labels";

type BatchDecisionSummary = {
    status: string;
    approved_by?: number | string | null;
    approved_at?: string | null;
    approved_by_name?: string | null;
    rejected_by?: number | string | null;
    rejected_at?: string | null;
    rejected_by_name?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    applied_at?: string | null;
};

function safeDate(value: string | null | undefined) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

export function BatchDecisionSummaryFields({ detail }: { detail: BatchDecisionSummary }) {
    const status = String(detail.status ?? "").toUpperCase();
    const applicationStatus = String(detail.application_status ?? "").toUpperCase();
    const isApproved = status === "APPROVED" || applicationStatus === "SCHEDULED";

    if (isApproved) {
        return (
            <>
                <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Approved By</div>
                    <div className="mt-1 font-medium">
                        {decisionUserLabel(detail.approved_by, detail.approved_by_name)}
                    </div>
                </div>
                <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Approved At</div>
                    <div className="mt-1 font-medium">{safeDate(detail.approved_at)}</div>
                </div>
                <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                        {applicationStatus === "SCHEDULED" ? "Scheduled At" : "Effective At"}
                    </div>
                    <div className="mt-1 font-medium">{safeDate(detail.effective_at)}</div>
                </div>
                <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Application Status</div>
                    <div className="mt-1 font-medium">{detail.application_status || "-"}</div>
                </div>
                {detail.application_status === "APPLIED" ? (
                    <div>
                        <div className="text-xs font-medium uppercase text-muted-foreground">Applied At</div>
                        <div className="mt-1 font-medium">{safeDate(detail.applied_at)}</div>
                    </div>
                ) : null}
            </>
        );
    }

    if (status === "REJECTED") {
        return (
            <>
                <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Rejected By</div>
                    <div className="mt-1 font-medium">
                        {decisionUserLabel(detail.rejected_by, detail.rejected_by_name)}
                    </div>
                </div>
                <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Rejected At</div>
                    <div className="mt-1 font-medium">{safeDate(detail.rejected_at)}</div>
                </div>
                <div className="sm:col-span-2">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Reject Reason</div>
                    <div className="mt-1 whitespace-pre-wrap font-medium">{detail.reject_reason || "-"}</div>
                </div>
            </>
        );
    }

    return null;
}
