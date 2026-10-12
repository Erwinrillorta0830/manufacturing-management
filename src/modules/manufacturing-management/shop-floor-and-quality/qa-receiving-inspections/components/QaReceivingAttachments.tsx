"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Paperclip,
    Upload,
    Trash2,
    FileText,
    Image as ImageIcon,
    Loader2,
    ExternalLink,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    FileSpreadsheet
} from "lucide-react";
import type { QaReceivingAttachmentRecord } from "../types";
import {
    fetchQaReceivingAttachments,
    uploadQaReceivingAttachment,
    deleteQaReceivingAttachment
} from "../services/qa-api";
import { formatPhtTimestamp } from "@/modules/manufacturing-management/shared/pht-date";

interface QaReceivingAttachmentsProps {
    purchaseOrderId: number;
    receivingHeaderId?: number | null;
    readOnly?: boolean;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_ATTACHMENTS = 20;

function formatFileSize(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageMime(mime: string | null | undefined): boolean {
    if (!mime) return false;
    return mime.startsWith("image/");
}

function isSpreadsheetMime(mime: string | null | undefined, fileName: string): boolean {
    if (mime?.includes("spreadsheet") || mime?.includes("excel") || mime?.includes("csv")) return true;
    return /\.(xlsx?|csv)$/i.test(fileName);
}

export default function QaReceivingAttachments({
    purchaseOrderId,
    receivingHeaderId,
    readOnly = false
}: QaReceivingAttachmentsProps) {
    const [attachments, setAttachments] = useState<QaReceivingAttachmentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadAttachments = useCallback(async () => {
        if (!purchaseOrderId || purchaseOrderId <= 0) return;
        setLoading(true);
        setErrorMessage(null);
        try {
            const data = await fetchQaReceivingAttachments({
                purchaseOrderId,
                receivingHeaderId: receivingHeaderId || null
            });
            setAttachments(data);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Failed to load attachments.");
        } finally {
            setLoading(false);
        }
    }, [purchaseOrderId, receivingHeaderId]);

    useEffect(() => {
        loadAttachments();
    }, [loadAttachments]);

    const handleFileSelect = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setErrorMessage(null);

        const currentCount = attachments.length;
        if (currentCount + files.length > MAX_ATTACHMENTS) {
            setErrorMessage(`Maximum limit of ${MAX_ATTACHMENTS} attachments per receipt. You can only add ${Math.max(0, MAX_ATTACHMENTS - currentCount)} more.`);
            return;
        }

        // Validate sizes
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > MAX_FILE_SIZE_BYTES) {
                setErrorMessage(`File "${file.name}" exceeds the 20 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
                return;
            }
        }

        setUploading(true);
        try {
            const newRecords: QaReceivingAttachmentRecord[] = [];
            for (let i = 0; i < files.length; i++) {
                const record = await uploadQaReceivingAttachment({
                    purchaseOrderId,
                    receivingHeaderId: receivingHeaderId || null,
                    file: files[i]
                });
                newRecords.push(record);
            }
            setAttachments(prev => [...newRecords, ...prev]);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Failed to upload one or more files.");
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleDelete = async (id: number) => {
        if (readOnly) return;
        setDeletingId(id);
        setErrorMessage(null);
        try {
            await deleteQaReceivingAttachment(id);
            setAttachments(prev => prev.filter(att => att.id !== id));
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Failed to delete attachment.");
        } finally {
            setDeletingId(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (readOnly || uploading) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            void handleFileSelect(e.dataTransfer.files);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div className="mx-4 mt-4 rounded-xl border border-border bg-card overflow-hidden shadow-xs">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-primary" />
                    <div>
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                            Inspection & Delivery Attachments
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                {attachments.length} / {MAX_ATTACHMENTS}
                            </span>
                        </h4>
                        <p className="text-[10px] text-muted-foreground">
                            Upload photos of delivered cargo, supplier documents, or inspection evidence (up to 20 MB each).
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {!readOnly && (
                        <label
                            className={`h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border transition-all ${
                                uploading || attachments.length >= MAX_ATTACHMENTS
                                    ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
                            }`}
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Uploading...</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="h-3.5 w-3.5" />
                                    <span>Add Files</span>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                disabled={readOnly || uploading || attachments.length >= MAX_ATTACHMENTS}
                                className="sr-only"
                                onChange={e => void handleFileSelect(e.target.files)}
                            />
                        </label>
                    )}

                    <button
                        type="button"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="h-8 w-8 rounded-lg border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                        title={isCollapsed ? "Expand section" : "Collapse section"}
                    >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {!isCollapsed && (
                <div className="p-4 space-y-3">
                    {/* Error Notice */}
                    {errorMessage && (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 text-xs font-semibold">
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Drag and Drop Box (only when editable) */}
                    {!readOnly && attachments.length < MAX_ATTACHMENTS && (
                        <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            className="border-2 border-dashed border-border/80 hover:border-primary/50 transition-colors rounded-xl p-4 text-center bg-muted/10 flex flex-col items-center justify-center gap-1 cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="h-6 w-6 text-muted-foreground mb-0.5" />
                            <p className="text-xs font-semibold text-foreground">
                                Drag & drop files here, or <span className="text-primary hover:underline">browse</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                Supports images (PNG, JPG, WEBP) and documents (PDF, Word, Excel). Max 20 MB per file.
                            </p>
                        </div>
                    )}

                    {/* Content / List */}
                    {loading ? (
                        <div className="py-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span>Loading attachments...</span>
                        </div>
                    ) : attachments.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                            No files or photos attached to this receipt.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {attachments.map(attachment => {
                                const isImg = isImageMime(attachment.mime_type);
                                const isSheet = isSpreadsheetMime(attachment.mime_type, attachment.file_name);
                                const fileUrl = `/api/manufacturing/files?id=${encodeURIComponent(attachment.directus_file_id)}`;
                                const isDeleting = deletingId === attachment.id;

                                return (
                                    <div
                                        key={attachment.id}
                                        className="flex items-center justify-between gap-2.5 p-2.5 rounded-lg border bg-background hover:bg-muted/30 transition-all text-xs"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="h-9 w-9 rounded-md bg-muted/50 border flex items-center justify-center shrink-0">
                                                {isImg ? (
                                                    <ImageIcon className="h-4 w-4 text-emerald-600" />
                                                ) : isSheet ? (
                                                    <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                                                ) : (
                                                    <FileText className="h-4 w-4 text-primary" />
                                                )}
                                            </div>

                                            <div className="min-w-0">
                                                <a
                                                    href={fileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="font-semibold text-foreground truncate block hover:underline hover:text-primary flex items-center gap-1"
                                                    title={attachment.file_name}
                                                >
                                                    <span className="truncate">{attachment.file_name}</span>
                                                    <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                                                </a>
                                                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                    <span>{formatFileSize(attachment.file_size)}</span>
                                                    <span>·</span>
                                                    <span>{attachment.created_at ? formatPhtTimestamp(attachment.created_at) : "PHT"}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {!readOnly && (
                                            <button
                                                type="button"
                                                onClick={() => void handleDelete(attachment.id)}
                                                disabled={isDeleting}
                                                className="h-7 w-7 rounded-md border text-red-600 hover:bg-red-500/10 flex items-center justify-center transition-colors shrink-0"
                                                title={`Delete ${attachment.file_name}`}
                                                aria-label={`Delete ${attachment.file_name}`}
                                            >
                                                {isDeleting ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
