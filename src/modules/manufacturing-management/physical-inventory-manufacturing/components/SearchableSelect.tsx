"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export interface Option {
    value: string | number;
    label: string;
    sublabel?: string;
    disabled?: boolean;
}

interface SearchableSelectProps {
    options: Option[];
    value: string | number | null | undefined;
    onChange: (value: string | number) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    disabled?: boolean;
    className?: string;
    required?: boolean;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Select an option...",
    searchPlaceholder = "Search...",
    disabled = false,
    className = "",
    required = false,
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Selected option object
    const selectedOption = options.find((opt) => String(opt.value) === String(value));

    // Filter options based on search term
    const filteredOptions = options.filter((opt) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        const labelMatch = opt.label.toLowerCase().includes(term);
        const sublabelMatch = opt.sublabel ? opt.sublabel.toLowerCase().includes(term) : false;
        return labelMatch || sublabelMatch;
    });

    // Close popover when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Auto-focus search input when opening
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
        } else {
            setSearchTerm("");
        }
    }, [isOpen]);

    const handleSelect = (optValue: string | number) => {
        onChange(optValue);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className={`relative w-full ${className}`}>
            {/* Native hidden input for HTML form validation if required */}
            {required && (
                <input
                    type="text"
                    tabIndex={-1}
                    value={value !== undefined && value !== null && value !== 0 ? String(value) : ""}
                    onChange={() => {}}
                    required={required}
                    className="sr-only h-0 w-0 pointer-events-none opacity-0 absolute"
                />
            )}

            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-background border rounded-lg text-left transition-all ${
                    isOpen ? "ring-2 ring-primary/20 border-primary" : "hover:border-input"
                } ${disabled ? "opacity-60 cursor-not-allowed bg-muted" : "cursor-pointer"}`}
            >
                <span className="truncate">
                    {selectedOption ? (
                        <span className="font-medium text-foreground">
                            {selectedOption.label}
                            {selectedOption.sublabel && (
                                <span className="ml-1.5 text-xs text-muted-foreground">({selectedOption.sublabel})</span>
                            )}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Popover Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-popover border rounded-xl shadow-xl overflow-hidden text-popover-foreground animate-in fade-in-50 zoom-in-95">
                    {/* Search Bar */}
                    <div className="p-2 border-b bg-muted/40 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder={searchPlaceholder}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-7 py-1.5 text-xs bg-background border rounded-md focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm("")}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>

                    {/* Options List */}
                    <div className="max-h-56 overflow-y-auto py-1">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No options found.</div>
                        ) : (
                            filteredOptions.map((opt) => {
                                const isSelected = String(opt.value) === String(value);
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={opt.disabled}
                                        onClick={() => handleSelect(opt.value)}
                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                                            isSelected
                                                ? "bg-primary/10 text-primary font-semibold"
                                                : "hover:bg-accent hover:text-accent-foreground"
                                        } ${opt.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                                    >
                                        <div className="truncate pr-2">
                                            <div>{opt.label}</div>
                                            {opt.sublabel && <div className="text-[10px] text-muted-foreground truncate">{opt.sublabel}</div>}
                                        </div>
                                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
