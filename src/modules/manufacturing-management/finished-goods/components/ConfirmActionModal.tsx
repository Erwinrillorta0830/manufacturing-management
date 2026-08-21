"use client";

import React, { useEffect } from "react";
import { AlertTriangle, HelpCircle, Check, X, Star } from "lucide-react";

export interface ConfirmActionModalProps {
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "primary" | "success";
    icon?: "warning" | "help" | "star" | "check";
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmActionModal({
    isOpen,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "primary",
    icon = "help",
    onConfirm,
    onCancel
}: ConfirmActionModalProps) {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onCancel();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    const renderIcon = () => {
        if (icon === "warning" || variant === "warning" || variant === "danger") {
            return (
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5" />
                </div>
            );
        }
        if (icon === "star" || variant === "success") {
            return (
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Star className="h-5 w-5 fill-emerald-500 text-emerald-500" />
                </div>
            );
        }
        return (
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                <HelpCircle className="h-5 w-5" />
            </div>
        );
    };

    const confirmButtonClass = () => {
        switch (variant) {
            case "danger":
                return "bg-rose-600 hover:bg-rose-700 text-white shadow-xs focus:ring-rose-500";
            case "warning":
                return "bg-amber-600 hover:bg-amber-700 text-white shadow-xs focus:ring-amber-500";
            case "success":
                return "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs focus:ring-emerald-500";
            default:
                return "bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs focus:ring-primary";
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-xs animate-in fade-in duration-150 p-4">
            <div
                className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
                role="dialog"
                aria-modal="true"
            >
                <div className="p-6 space-y-4">
                    <div className="flex items-start gap-3.5">
                        {renderIcon()}
                        <div className="space-y-1 min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-foreground leading-tight">{title}</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 bg-muted/20 border-t border-border/60">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${confirmButtonClass()}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
