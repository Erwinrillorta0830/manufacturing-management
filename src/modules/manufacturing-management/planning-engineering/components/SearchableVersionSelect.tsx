"use client";

import React, { useState } from "react";
import { Check, ChevronsUpDown, Search, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export interface VersionOption {
    version_id: number;
    version_name?: string;
    status?: string;
    base_quantity?: number;
    expected_yield_percentage?: number;
}

interface SearchableVersionSelectProps {
    versions: VersionOption[];
    selectedVersionId?: number;
    onVersionChange: (versionId: number) => void;
    disabled?: boolean;
    loading?: boolean;
    productName?: string;
}

export function SearchableVersionSelect({
    versions = [],
    selectedVersionId,
    onVersionChange,
    disabled = false,
    loading = false,
    productName = "Sub-Assembly"
}: SearchableVersionSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const currentVersion = versions.find(v => Number(v.version_id) === Number(selectedVersionId)) || versions[0];

    const filteredVersions = versions.filter(v => {
        const query = search.toLowerCase().trim();
        if (!query) return true;
        const nameMatch = String(v.version_name || "").toLowerCase().includes(query);
        const statusMatch = String(v.status || "").toLowerCase().includes(query);
        const idMatch = String(v.version_id).includes(query);
        return nameMatch || statusMatch || idMatch;
    });

    const getStatusBadge = (status?: string) => {
        const s = String(status || "").toLowerCase();
        if (s === "active" || s === "approved") {
            return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[9px] px-1.5 py-0 font-bold uppercase">Active</Badge>;
        }
        if (s === "for approval" || s === "pending") {
            return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[9px] px-1.5 py-0 font-bold uppercase">Pending</Badge>;
        }
        return <Badge variant="outline" className="text-[9px] px-1.5 py-0 uppercase font-semibold">{status || "Draft"}</Badge>;
    };

    return (
        <div className="flex items-center gap-2 w-full max-w-md">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled || loading || versions.length === 0}
                        className="h-8 border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10 text-foreground justify-between text-xs font-semibold px-2.5 rounded-lg transition-all w-full min-w-0"
                    >
                        <div className="flex items-center gap-1.5 truncate min-w-0">
                            <Layers className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                            {loading ? (
                                <span className="flex items-center gap-1.5 text-muted-foreground text-[10px] shrink-0">
                                    <Loader2 className="h-3 w-3 animate-spin text-sky-500 shrink-0" /> Loading BOM...
                                </span>
                            ) : currentVersion ? (
                                <div className="flex items-center gap-1.5 truncate text-[11px] min-w-0">
                                    <span className="font-bold text-sky-700 dark:text-sky-300 truncate max-w-[200px]" title={String(currentVersion.version_name)}>
                                        {currentVersion.version_name || `Version #${currentVersion.version_id}`}
                                    </span>
                                    <span className="shrink-0">{getStatusBadge(currentVersion.status)}</span>
                                    <span className="text-[10px] text-muted-foreground font-normal shrink-0">
                                        (Base: {currentVersion.base_quantity || 1} pc)
                                    </span>
                                </div>
                            ) : (
                                <span className="text-muted-foreground text-[11px] truncate">Select Recipe Version...</span>
                            )}
                        </div>
                        <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50 text-sky-500" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 border-border bg-card shadow-xl" align="start">
                    <div className="p-2 border-b border-border bg-muted/30 flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Input
                            placeholder={`Search ${productName} versions...`}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-7 text-xs bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                            autoFocus
                        />
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
                        {filteredVersions.length === 0 ? (
                            <div className="p-3 text-center text-xs text-muted-foreground">
                                No manufacturing versions found.
                            </div>
                        ) : (
                            filteredVersions.map((v) => {
                                const isSelected = Number(v.version_id) === Number(selectedVersionId);
                                return (
                                    <div
                                        key={v.version_id}
                                        onClick={() => {
                                            onVersionChange(Number(v.version_id));
                                            setOpen(false);
                                        }}
                                        className={`p-2 rounded-md flex items-center justify-between cursor-pointer text-xs transition-colors ${
                                            isSelected
                                                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold"
                                                : "hover:bg-muted text-foreground"
                                        }`}
                                    >
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span>{v.version_name || `Version #${v.version_id}`}</span>
                                                {getStatusBadge(v.status)}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground font-normal">
                                                Base Qty: {v.base_quantity || 1} unit(s)
                                                {v.expected_yield_percentage ? ` • Yield: ${v.expected_yield_percentage}%` : ""}
                                            </div>
                                        </div>
                                        {isSelected && <Check className="h-4 w-4 text-sky-500 shrink-0" />}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
